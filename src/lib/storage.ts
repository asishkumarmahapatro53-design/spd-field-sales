import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getFirebaseStorageBucket, isFirebaseConfigured } from "@/lib/firebase-admin";

const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT?.trim() || "./runtime-uploads");

function shouldUseSupabaseStorage() {
  return process.env.SUPABASE_USE_STORAGE?.trim().toLowerCase() === "true";
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
