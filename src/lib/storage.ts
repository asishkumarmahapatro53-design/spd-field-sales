import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { getFirebaseStorageBucket, isFirebaseConfigured } from "@/lib/firebase-admin";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const defaultStorageRoot = process.env.NODE_ENV === "production" ? "/tmp/runtime-uploads" : "./runtime-uploads";
const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT?.trim() || defaultStorageRoot);

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function shouldUseSupabaseStorage() {
  return process.env.SUPABASE_USE_STORAGE?.trim().toLowerCase() === "true";
}

function shouldUseS3Storage() {
  return Boolean(readEnv("S3_BUCKET_NAME", "AWS_S3_BUCKET_NAME"));
}

export function isS3StorageConfigured() {
  return shouldUseS3Storage();
}

function shouldUseFirebaseStorage() {
  return process.env.FIREBASE_USE_STORAGE?.trim().toLowerCase() === "true";
}

function getSupabaseStorageConfig() {
  const projectUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "") || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "";

  if (!projectUrl || !serviceRoleKey || !bucket) {
    return null;
  }

  return {
    projectUrl,
    serviceRoleKey,
    bucket,
  };
}

function buildSupabaseObjectPath(bucketPath: string) {
  return bucketPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getS3Config() {
  const bucket = readEnv("S3_BUCKET_NAME", "AWS_S3_BUCKET_NAME");
  const region = readEnv("S3_REGION", "AWS_REGION") || "us-east-1";
  const accessKeyId = readEnv("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  const sessionToken = readEnv("S3_SESSION_TOKEN", "AWS_SESSION_TOKEN");

  if (!bucket) {
    throw new Error("S3_BUCKET_NAME is not configured.");
  }

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("S3 access key and secret access key are required.");
  }

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    client: new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    }),
  };
}

function buildS3ObjectUrl(key: string, bucket: string, region: string) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`;
}

function encodeS3Key(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildCanonicalQuery(query: Record<string, string>) {
  return Object.entries(query)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function hmacBuffer(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string) {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, "s3");
  return hmacBuffer(serviceKey, "aws4_request");
}

async function saveToSupabaseStorage(
  file: File,
  buffer: Buffer,
  bucketPath: string,
  mimeType: string,
) {
  const config = getSupabaseStorageConfig();

  if (!config) {
    throw new Error(
      "Supabase Storage is enabled, but SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_STORAGE_BUCKET is missing.",
    );
  }

  const objectPath = buildSupabaseObjectPath(bucketPath);
  const response = await fetch(`${config.projectUrl}/storage/v1/object/${config.bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "Content-Type": mimeType,
      "x-upsert": "false",
      "cache-control": "3600",
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase Storage upload failed (${response.status}): ${message}`);
  }

  return {
    photoUrl: `${config.projectUrl}/storage/v1/object/public/${config.bucket}/${objectPath}`,
    originalFileName: file.name || path.basename(bucketPath),
    localAbsolutePath: null,
  };
}

async function saveToS3Storage(file: File, buffer: Buffer, bucketPath: string, mimeType: string) {
  const { bucket, region, client } = getS3Config();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: bucketPath,
    Body: new Uint8Array(buffer),
    ContentType: mimeType,
  });

  await client.send(command);

  return {
    photoUrl: buildS3ObjectUrl(bucketPath, bucket, region),
    originalFileName: file.name || path.basename(bucketPath),
    localAbsolutePath: null,
  };
}

export async function createPresignedS3PutUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const { bucket, region, accessKeyId, secretAccessKey, sessionToken } = getS3Config();
  const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds ?? 300, 60), 600);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const signedHeaders = "content-type;host";
  const credential = `${accessKeyId}/${scope}`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  if (sessionToken) {
    query["X-Amz-Security-Token"] = sessionToken;
  }

  const canonicalUri = `/${encodeS3Key(input.key)}`;
  const canonicalQuery = buildCanonicalQuery(query);
  const canonicalHeaders = `content-type:${input.contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const signature = hmacHex(getSigningKey(secretAccessKey, dateStamp, region), stringToSign);

  return {
    uploadUrl: `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    key: input.key,
    photoUrl: buildS3ObjectUrl(input.key, bucket, region),
    headers: {
      "Content-Type": input.contentType,
    },
    expiresInSeconds,
  };
}

export async function readS3ObjectBuffer(key: string, options?: { maxBytes?: number }) {
  const { bucket, client } = getS3Config();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

  if (options?.maxBytes && head.ContentLength && head.ContentLength > options.maxBytes) {
    throw new Error("The uploaded S3 object is larger than allowed.");
  }

  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await result.Body?.transformToByteArray();

  if (!bytes) {
    throw new Error("Could not read uploaded S3 object.");
  }

  return {
    buffer: Buffer.from(bytes),
    contentType: result.ContentType ?? null,
    contentLength: result.ContentLength ?? null,
  };
}

export function buildS3PublicUrl(key: string) {
  const { bucket, region } = getS3Config();
  return buildS3ObjectUrl(key, bucket, region);
}

export async function readUploadedFileBuffer(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes);
}

export async function saveUploadedFile(file: File, buffer?: Buffer) {
  const fileBuffer = buffer ?? (await readUploadedFileBuffer(file));
  const extension = path.extname(file.name || "") || ".jpg";
  const dateDir = new Date().toISOString().slice(0, 7);
  const relativeDir = path.join(dateDir);
  const fileName = `${randomUUID()}${extension}`;
  const absoluteDir = path.join(storageRoot, relativeDir);
  const absolutePath = path.join(absoluteDir, fileName);
  const bucketPath = `uploads/${relativeDir.replaceAll("\\", "/")}/${fileName}`;
  const mimeType = file.type || "application/octet-stream";

  if (shouldUseS3Storage()) {
    return saveToS3Storage(file, fileBuffer, bucketPath, mimeType);
  }

  if (shouldUseSupabaseStorage()) {
    return saveToSupabaseStorage(file, fileBuffer, bucketPath, mimeType);
  }

  if (shouldUseFirebaseStorage() && (await isFirebaseConfigured())) {
    const bucket = await getFirebaseStorageBucket();
    const storageFile = bucket.file(bucketPath);

    await storageFile.save(fileBuffer, {
      contentType: mimeType,
      resumable: false,
    });

    const [photoUrl] = await storageFile.getSignedUrl({
      action: "read",
      expires: "03-09-2491",
    });

    return {
      photoUrl,
      originalFileName: file.name || fileName,
      localAbsolutePath: null,
    };
  }

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, fileBuffer);

  return {
    photoUrl: `/local-uploads/${relativeDir.replaceAll("\\", "/")}/${fileName}`,
    originalFileName: file.name || fileName,
    localAbsolutePath: absolutePath,
  };
}
