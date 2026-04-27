import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getFirebaseFirestore } from "@/lib/firebase-admin";

export type HealthStatus = "pass" | "warn" | "fail";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface SystemHealthOptions {
  deep?: boolean;
  expectedOrigin?: string;
  requireAppData?: boolean;
  validateGemini?: boolean;
}

export interface SystemHealthReport {
  ok: boolean;
  generatedAt: string;
  environment: string;
  deep: boolean;
  checks: HealthCheck[];
}

const DEFAULT_APP_ORIGIN = "https://spdautomation.civilsai.in";
const APP_DATA_COLLECTIONS = ["users", "plants"] as const;

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return {
        key,
        value,
      };
    }
  }

  return null;
}

function sanitizeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted-api-key]")
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[redacted-private-key]")
    .replace(/\s+/g, " ")
    .slice(0, 320);
}

function makeCheck(name: string, status: HealthStatus, message: string, details?: Record<string, unknown>): HealthCheck {
  return {
    name,
    status,
    message,
    ...(details ? { details } : {}),
  };
}

function getExpectedOrigin(input?: string) {
  return input?.trim() || process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || DEFAULT_APP_ORIGIN;
}

function getFirebaseEnvSummary() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH?.trim() || "";
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || "";
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || "";
  const privateKey = privateKeyRaw.replaceAll("\\n", "\n").trim();
  const usesJsonFile = Boolean(serviceAccountPath);
  const usesInlineCredentials = Boolean(projectId || clientEmail || privateKeyRaw);
  const privateKeyLooksValid =
    !privateKeyRaw ||
    (privateKey.includes("-----BEGIN PRIVATE KEY-----") &&
      privateKey.includes("-----END PRIVATE KEY-----") &&
      privateKey.includes("\n"));

  return {
    usesJsonFile,
    jsonFileExists: usesJsonFile ? existsSync(serviceAccountPath) : null,
    usesInlineCredentials,
    projectIdPresent: Boolean(projectId),
    clientEmailPresent: Boolean(clientEmail),
    privateKeyPresent: Boolean(privateKeyRaw.trim()),
    privateKeyLooksValid,
    databaseIdPresent: Boolean(process.env.FIREBASE_FIRESTORE_DATABASE_ID?.trim()),
    appStateCollection: process.env.FIREBASE_APP_STATE_COLLECTION?.trim() || "app_state",
  };
}

async function checkFirebase(options: Required<Pick<SystemHealthOptions, "deep" | "requireAppData">>) {
  const summary = getFirebaseEnvSummary();

  if (summary.usesJsonFile && !summary.jsonFileExists) {
    return makeCheck("firebase", "fail", "Firebase service-account JSON path is configured but the file is missing.", summary);
  }

  if (!summary.usesJsonFile && (!summary.projectIdPresent || !summary.clientEmailPresent || !summary.privateKeyPresent)) {
    return makeCheck("firebase", "fail", "Firebase credentials are incomplete.", summary);
  }

  if (!summary.privateKeyLooksValid) {
    return makeCheck("firebase", "fail", "Firebase private key format looks invalid. It should contain escaped newlines.", summary);
  }

  if (!options.deep) {
    return makeCheck("firebase", "pass", "Firebase credential shape is present.", summary);
  }

  try {
    const firestore = await getFirebaseFirestore();
    const healthId = `health-${Date.now()}-${randomUUID()}`;
    const healthRef = firestore.collection("__system_health_checks").doc(healthId);

    await healthRef.set({
      createdAt: new Date().toISOString(),
      purpose: "temporary production health validation",
    });
    const healthSnap = await healthRef.get();
    await healthRef.delete();

    const appDataResults = await Promise.all(
      APP_DATA_COLLECTIONS.map(async (collectionName) => {
        const snap = await firestore
          .collection(summary.appStateCollection)
          .doc("collections")
          .collection(collectionName)
          .limit(1)
          .get();

        return {
          collectionName,
          hasAnyDocument: !snap.empty,
        };
      }),
    );
    const hasAppData = appDataResults.some((entry) => entry.hasAnyDocument);

    if (!healthSnap.exists) {
      return makeCheck("firebase", "fail", "Firebase write succeeded but read-back failed.", summary);
    }

    if (options.requireAppData && !hasAppData) {
      return makeCheck(
        "firebase",
        "fail",
        "Firebase is reachable, but no existing app data was found in the configured app_state path. This can indicate the wrong project, database, or collection.",
        {
          ...summary,
          appDataResults,
        },
      );
    }

    return makeCheck("firebase", hasAppData ? "pass" : "warn", "Firebase durable read/write/delete check passed.", {
      ...summary,
      appDataResults,
    });
  } catch (error) {
    return makeCheck("firebase", "fail", `Firebase durable check failed: ${sanitizeError(error)}`, summary);
  }
}

function getS3EnvSummary() {
  const bucket = readEnv("S3_BUCKET_NAME", "AWS_S3_BUCKET_NAME");
  const region = readEnv("S3_REGION", "AWS_REGION");
  const accessKeyId = readEnv("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  const sessionToken = readEnv("S3_SESSION_TOKEN", "AWS_SESSION_TOKEN");

  return {
    bucketKey: bucket?.key ?? null,
    bucketPresent: Boolean(bucket),
    regionKey: region?.key ?? null,
    regionPresent: Boolean(region),
    accessKeyKey: accessKeyId?.key ?? null,
    accessKeyPresent: Boolean(accessKeyId),
    secretKeyKey: secretAccessKey?.key ?? null,
    secretKeyPresent: Boolean(secretAccessKey),
    sessionTokenPresent: Boolean(sessionToken),
    usesAwsAlias: [bucket, region, accessKeyId, secretAccessKey, sessionToken].some((entry) => entry?.key.startsWith("AWS_")),
    bucket: bucket?.value ?? "",
    region: region?.value || "us-east-1",
    accessKeyId: accessKeyId?.value ?? "",
    secretAccessKey: secretAccessKey?.value ?? "",
    sessionToken: sessionToken?.value ?? "",
  };
}

async function checkS3(options: Required<Pick<SystemHealthOptions, "deep" | "expectedOrigin">>) {
  const summary = getS3EnvSummary();
  const safeSummary = {
    bucketPresent: summary.bucketPresent,
    regionPresent: summary.regionPresent,
    accessKeyPresent: summary.accessKeyPresent,
    secretKeyPresent: summary.secretKeyPresent,
    sessionTokenPresent: summary.sessionTokenPresent,
    usesAwsAlias: summary.usesAwsAlias,
    bucketKey: summary.bucketKey,
    regionKey: summary.regionKey,
    accessKeyKey: summary.accessKeyKey,
    secretKeyKey: summary.secretKeyKey,
    region: summary.region,
  };

  if (!summary.bucketPresent || !summary.regionPresent || !summary.accessKeyPresent || !summary.secretKeyPresent) {
    return makeCheck("s3", "fail", "S3 bucket, region, or credentials are incomplete.", safeSummary);
  }

  if (process.env.NODE_ENV === "production" && summary.usesAwsAlias) {
    return makeCheck(
      "s3",
      "fail",
      "S3 production config must use explicit S3_* variables, not AWS_* aliases. Amplify reserves AWS_* names and may inject unrelated credentials.",
      safeSummary,
    );
  }

  if (!options.deep) {
    return makeCheck("s3", "pass", "S3 credential shape is present.", safeSummary);
  }

  try {
    const client = new S3Client({
      region: summary.region,
      credentials: {
        accessKeyId: summary.accessKeyId,
        secretAccessKey: summary.secretAccessKey,
        ...(summary.sessionToken ? { sessionToken: summary.sessionToken } : {}),
      },
    });
    const key = `system-health/${Date.now()}-${randomUUID()}.txt`;

    await client.send(new HeadBucketCommand({ Bucket: summary.bucket }));
    await client.send(
      new PutObjectCommand({
        Bucket: summary.bucket,
        Key: key,
        Body: "temporary production health validation",
        ContentType: "text/plain",
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: summary.bucket, Key: key }));

    let corsDetails: Record<string, unknown> = {
      expectedOrigin: options.expectedOrigin,
      hasExpectedOrigin: false,
      allowsPut: false,
      allowsHead: false,
      allowsContentTypeHeader: false,
    };

    try {
      const cors = await client.send(new GetBucketCorsCommand({ Bucket: summary.bucket }));
      const rules = cors.CORSRules ?? [];
      const hasExpectedOrigin = rules.some((rule) =>
        (rule.AllowedOrigins ?? []).includes(options.expectedOrigin) || (rule.AllowedOrigins ?? []).includes("*"),
      );
      const allowsPut = rules.some((rule) => (rule.AllowedMethods ?? []).includes("PUT"));
      const allowsHead = rules.some((rule) => (rule.AllowedMethods ?? []).includes("HEAD"));
      const allowsContentTypeHeader = rules.some((rule) =>
        (rule.AllowedHeaders ?? []).some((header) => header === "*" || header.toLowerCase() === "content-type"),
      );
      corsDetails = {
        expectedOrigin: options.expectedOrigin,
        ruleCount: rules.length,
        hasExpectedOrigin,
        allowsPut,
        allowsHead,
        allowsContentTypeHeader,
      };

      if (!hasExpectedOrigin || !allowsPut || !allowsHead || !allowsContentTypeHeader) {
        return makeCheck("s3", "fail", "S3 CORS does not allow browser direct uploads from the production domain.", {
          ...safeSummary,
          cors: corsDetails,
        });
      }
    } catch (error) {
      return makeCheck("s3", "fail", `S3 bucket CORS check failed: ${sanitizeError(error)}`, safeSummary);
    }

    return makeCheck("s3", "pass", "S3 bucket, upload/delete, and CORS checks passed.", {
      ...safeSummary,
      cors: corsDetails,
    });
  } catch (error) {
    return makeCheck("s3", "fail", `S3 durable upload check failed: ${sanitizeError(error)}`, safeSummary);
  }
}

function getGeminiSummary() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const model = process.env.GEMINI_CHAT_MODEL?.trim() || process.env.GEMINI_OCR_MODEL?.trim() || "gemini-2.5-flash-lite";

  return {
    apiKeyPresent: Boolean(apiKey),
    apiKeyLooksLikeGoogleKey: !apiKey || apiKey.startsWith("AIza"),
    model,
    apiKey,
  };
}

async function checkGemini(validate: boolean) {
  const summary = getGeminiSummary();
  const safeSummary = {
    apiKeyPresent: summary.apiKeyPresent,
    apiKeyLooksLikeGoogleKey: summary.apiKeyLooksLikeGoogleKey,
    model: summary.model,
  };

  if (!summary.apiKeyPresent) {
    return makeCheck("gemini", "fail", "GEMINI_API_KEY is missing.", safeSummary);
  }

  if (!summary.apiKeyLooksLikeGoogleKey) {
    return makeCheck("gemini", "warn", "GEMINI_API_KEY is present, but the format is unusual.", safeSummary);
  }

  if (!validate) {
    return makeCheck("gemini", "pass", "Gemini API key is present.", safeSummary);
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${summary.model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": summary.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with OK only." }] }],
        generationConfig: {
          maxOutputTokens: 8,
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      return makeCheck("gemini", "fail", `Gemini API validation failed with HTTP ${response.status}.`, safeSummary);
    }

    return makeCheck("gemini", "pass", "Gemini API validation passed.", safeSummary);
  } catch (error) {
    return makeCheck("gemini", "fail", `Gemini API validation failed: ${sanitizeError(error)}`, safeSummary);
  }
}

function checkEphemeralPersistence() {
  const enabled = process.env.ALLOW_EPHEMERAL_PERSISTENCE?.trim().toLowerCase() === "true";

  if (process.env.NODE_ENV === "production" && enabled) {
    return makeCheck(
      "ephemeral-persistence",
      "fail",
      "ALLOW_EPHEMERAL_PERSISTENCE is true in production. This can re-enable disposable /tmp database or upload storage.",
      { enabled },
    );
  }

  return makeCheck("ephemeral-persistence", "pass", "Disposable local persistence is disabled for production.", { enabled });
}

export async function runSystemHealthChecks(options: SystemHealthOptions = {}): Promise<SystemHealthReport> {
  const normalizedOptions = {
    deep: options.deep ?? false,
    expectedOrigin: getExpectedOrigin(options.expectedOrigin),
    requireAppData: options.requireAppData ?? true,
    validateGemini: options.validateGemini ?? false,
  };
  const checks = await Promise.all([
    checkFirebase(normalizedOptions),
    checkS3(normalizedOptions),
    checkGemini(normalizedOptions.validateGemini),
    Promise.resolve(checkEphemeralPersistence()),
  ]);

  return {
    ok: checks.every((check) => check.status !== "fail"),
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || "unknown",
    deep: normalizedOptions.deep,
    checks,
  };
}
