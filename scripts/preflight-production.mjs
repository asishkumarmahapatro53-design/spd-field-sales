import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_APP_ORIGIN = "https://spdautomation.civilsai.in";
const APP_DATA_COLLECTIONS = ["users", "plants"];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    try {
      value = JSON.parse(value);
    } catch {
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
    }

    env[key] = String(value);
  }

  return env;
}

function loadEnv() {
  const env = {
    ...parseEnvFile(".env.local"),
    ...parseEnvFile(".env.production"),
    ...process.env,
  };

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return env;
}

function envValue(env, ...keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return { key, value };
  }

  return null;
}

function sanitizeError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted-api-key]")
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[redacted-private-key]")
    .replace(/\s+/g, " ")
    .slice(0, 320);
}

function record(results, status, name, message, details = {}) {
  results.push({ status, name, message, details });
}

function getFirebaseCredential(env) {
  const jsonPath = env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH?.trim();
  if (jsonPath) {
    if (!fs.existsSync(jsonPath)) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON_PATH is configured but the file does not exist.");
    }

    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error("Firebase service-account JSON is missing required fields.");
    }

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
      mode: "json-file",
    };
  }

  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_PRIVATE_KEY?.replaceAll("\\n", "\n").trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY is missing.");
  }

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new Error("FIREBASE_PRIVATE_KEY format is invalid.");
  }

  return {
    projectId,
    clientEmail,
    privateKey,
    mode: "inline-env",
  };
}

async function checkFirebase(env, results) {
  let app;

  try {
    const credential = getFirebaseCredential(env);
    const databaseId = env.FIREBASE_FIRESTORE_DATABASE_ID?.trim();
    const rootCollection = env.FIREBASE_APP_STATE_COLLECTION?.trim() || "app_state";
    const legacyDocId = env.FIREBASE_APP_STATE_DOC?.trim() || "main";

    app = initializeApp(
      {
        credential: cert({
          projectId: credential.projectId,
          clientEmail: credential.clientEmail,
          privateKey: credential.privateKey,
        }),
      },
      `preflight-${Date.now()}`,
    );

    const firestore = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
    const healthRef = firestore.collection("__system_health_checks").doc(`preflight-${Date.now()}-${randomUUID()}`);

    await healthRef.set({
      createdAt: new Date().toISOString(),
      purpose: "temporary production preflight validation",
    });
    const snap = await healthRef.get();
    await healthRef.delete();

    if (!snap.exists) {
      throw new Error("Firestore write succeeded but read-back failed.");
    }

    const appDataResults = await Promise.all(
      APP_DATA_COLLECTIONS.map(async (collectionName) => {
        const dataSnap = await firestore
          .collection(rootCollection)
          .doc("collections")
          .collection(collectionName)
          .limit(1)
          .get();

        return {
          collectionName,
          hasAnyDocument: !dataSnap.empty,
        };
      }),
    );
    const hasAppData = appDataResults.some((entry) => entry.hasAnyDocument);
    const legacySnap = await firestore.collection(rootCollection).doc(legacyDocId).get();
    const legacyData = legacySnap.exists ? legacySnap.data() || {} : {};
    const legacyAppDataResults = APP_DATA_COLLECTIONS.map((collectionName) => {
      const value = legacyData[collectionName];
      return {
        collectionName,
        hasAnyDocument: Array.isArray(value) && value.length > 0,
      };
    });
    const hasLegacyAppData = legacyAppDataResults.some((entry) => entry.hasAnyDocument);
    const allowEmpty = env.PREFLIGHT_ALLOW_EMPTY_FIREBASE?.trim().toLowerCase() === "true";

    if (!hasAppData && !hasLegacyAppData && !allowEmpty) {
      throw new Error(
        `No existing app data was found at ${rootCollection}/collections or legacy document ${rootCollection}/${legacyDocId}. This usually means the Firebase project, database, or collection is wrong.`,
      );
    }

    record(results, "pass", "firebase", "Firestore durable write/read/delete passed.", {
      credentialMode: credential.mode,
      databaseId: databaseId || "(default)",
      rootCollection,
      legacyDocId,
      appDataResults,
      legacyAppDataResults,
      storageShape: hasAppData ? "collections" : hasLegacyAppData ? "legacy-document" : "empty-allowed",
    });
  } catch (error) {
    record(results, "fail", "firebase", sanitizeError(error));
  } finally {
    if (app) {
      await deleteApp(app);
    }
  }
}

async function checkS3(env, results) {
  const bucket = envValue(env, "S3_BUCKET_NAME", "AWS_S3_BUCKET_NAME");
  const region = envValue(env, "S3_REGION", "AWS_REGION") || { key: "S3_REGION", value: "us-east-1" };
  const accessKeyId = envValue(env, "S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = envValue(env, "S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  const sessionToken = envValue(env, "S3_SESSION_TOKEN", "AWS_SESSION_TOKEN");
  const usesAwsAlias = [bucket, region, accessKeyId, secretAccessKey, sessionToken].some((entry) =>
    entry?.key?.startsWith("AWS_"),
  );
  const allowAwsAlias = env.PREFLIGHT_ALLOW_AWS_S3_ALIASES?.trim().toLowerCase() === "true";

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    record(results, "fail", "s3", "S3_BUCKET_NAME, S3_REGION, S3_ACCESS_KEY_ID, or S3_SECRET_ACCESS_KEY is missing.");
    return;
  }

  if (usesAwsAlias && !allowAwsAlias) {
    record(
      results,
      "fail",
      "s3",
      "Production S3 preflight requires explicit S3_* variables. AWS_* aliases can be reserved/injected by Amplify.",
      {
        bucketKey: bucket.key,
        regionKey: region.key,
        accessKeyKey: accessKeyId.key,
        secretKeyKey: secretAccessKey.key,
      },
    );
    return;
  }

  try {
    const expectedOrigin = env.APP_ORIGIN?.trim() || env.NEXT_PUBLIC_APP_ORIGIN?.trim() || DEFAULT_APP_ORIGIN;
    const client = new S3Client({
      region: region.value,
      credentials: {
        accessKeyId: accessKeyId.value,
        secretAccessKey: secretAccessKey.value,
        ...(sessionToken ? { sessionToken: sessionToken.value } : {}),
      },
    });
    const key = `preflight/${Date.now()}-${randomUUID()}.txt`;

    await client.send(new HeadBucketCommand({ Bucket: bucket.value }));
    await client.send(
      new PutObjectCommand({
        Bucket: bucket.value,
        Key: key,
        Body: "temporary production preflight validation",
        ContentType: "text/plain",
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket.value, Key: key }));

    const cors = await client.send(new GetBucketCorsCommand({ Bucket: bucket.value }));
    const rules = cors.CORSRules || [];
    const hasExpectedOrigin = rules.some((rule) =>
      (rule.AllowedOrigins || []).includes(expectedOrigin) || (rule.AllowedOrigins || []).includes("*"),
    );
    const allowsPut = rules.some((rule) => (rule.AllowedMethods || []).includes("PUT"));
    const allowsHead = rules.some((rule) => (rule.AllowedMethods || []).includes("HEAD"));
    const allowsContentTypeHeader = rules.some((rule) =>
      (rule.AllowedHeaders || []).some((header) => header === "*" || header.toLowerCase() === "content-type"),
    );

    if (!hasExpectedOrigin || !allowsPut || !allowsHead || !allowsContentTypeHeader) {
      throw new Error("S3 CORS does not allow direct uploads from the production domain.");
    }

    record(results, "pass", "s3", "S3 bucket write/delete and CORS checks passed.", {
      region: region.value,
      expectedOrigin,
      corsRuleCount: rules.length,
    });
  } catch (error) {
    record(results, "fail", "s3", sanitizeError(error));
  }
}

async function checkGemini(env, results) {
  if (env.PREFLIGHT_SKIP_GEMINI?.trim().toLowerCase() === "true") {
    record(results, "warn", "gemini", "Gemini validation was skipped by PREFLIGHT_SKIP_GEMINI.");
    return;
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_CHAT_MODEL?.trim() || env.GEMINI_OCR_MODEL?.trim() || "gemini-2.5-flash-lite";

  if (!apiKey) {
    record(results, "fail", "gemini", "GEMINI_API_KEY is missing.");
    return;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
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
      throw new Error(`Gemini API returned HTTP ${response.status}.`);
    }

    record(results, "pass", "gemini", "Gemini API validation passed.", { model });
  } catch (error) {
    record(results, "fail", "gemini", sanitizeError(error), { model });
  }
}

function checkEphemeral(env, results) {
  const enabled = env.ALLOW_EPHEMERAL_PERSISTENCE?.trim().toLowerCase() === "true";

  if (enabled) {
    record(
      results,
      "fail",
      "ephemeral-persistence",
      "ALLOW_EPHEMERAL_PERSISTENCE is true. This can re-enable disposable /tmp database or upload storage.",
    );
    return;
  }

  record(results, "pass", "ephemeral-persistence", "Disposable /tmp persistence is disabled.");
}

async function main() {
  const env = loadEnv();
  const results = [];

  checkEphemeral(env, results);
  await checkFirebase(env, results);
  await checkS3(env, results);
  await checkGemini(env, results);

  for (const result of results) {
    const icon = result.status === "pass" ? "PASS" : result.status === "warn" ? "WARN" : "FAIL";
    console.log(`[${icon}] ${result.name}: ${result.message}`);
    if (result.details && Object.keys(result.details).length > 0) {
      console.log(`       ${JSON.stringify(result.details)}`);
    }
  }

  const failed = results.filter((result) => result.status === "fail");
  if (failed.length) {
    console.error(`Production preflight failed with ${failed.length} blocking issue(s). Deployment stopped to protect data.`);
    process.exitCode = 1;
    return;
  }

  console.log("Production preflight passed.");
}

main().catch((error) => {
  console.error(`Production preflight crashed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
