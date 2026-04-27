import { randomUUID } from "node:crypto";
import { ApiError, jsonError, jsonOk, requireApiUser, requireString } from "@/lib/api";
import { createPresignedS3PutUrl, isS3StorageConfigured } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_ODOMETER_DIRECT_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_SITE_VISIT_DIRECT_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_SITE_VISIT_VOICE_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/aac", "audio/m4a", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm"]);

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const payload = (await request.json()) as {
      purpose?: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
    };

    if (!isS3StorageConfigured()) {
      throw new ApiError(500, "S3 storage is not configured for direct uploads.");
    }

    const purpose = requireString(payload.purpose, "Upload purpose is required.");
    if (purpose !== "odometer" && purpose !== "site-visit" && purpose !== "site-visit-voice") {
      throw new ApiError(400, "Unsupported upload purpose.");
    }

    const mimeType = normalizeMimeType(payload.mimeType, purpose);
    const sizeBytes = Number(payload.sizeBytes);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new ApiError(400, "Photo size is required.");
    }

    const maxBytes = getMaxBytesForPurpose(purpose);
    if (sizeBytes > maxBytes) {
      throw new ApiError(413, "The uploaded file is too large. Please capture a smaller file and try again.");
    }

    const extension = extensionForMimeType(mimeType);
    const dateDir = new Date().toISOString().slice(0, 7);
    const key = `uploads/${prefixForPurpose(purpose)}/${sanitizePathSegment(user.id)}/${dateDir}/${randomUUID()}${extension}`;
    const upload = await createPresignedS3PutUrl({
      key,
      contentType: mimeType,
      expiresInSeconds: 300,
    });

    return jsonOk({
      ...upload,
      originalFileName: sanitizeFileName(payload.fileName) || `${purpose}${extension}`,
      maxBytes,
    });
  } catch (error) {
    return jsonError(error);
  }
}

function normalizeMimeType(value: string | null | undefined, purpose: string) {
  const fallbackMimeType = purpose === "site-visit-voice" ? "audio/webm" : "image/webp";
  const mimeType = value?.trim().toLowerCase() || fallbackMimeType;

  if (purpose === "site-visit-voice") {
    if (!ALLOWED_AUDIO_TYPES.has(mimeType) && !mimeType.startsWith("audio/")) {
      throw new ApiError(400, "Only audio voice notes are supported.");
    }

    return mimeType;
  }

  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new ApiError(400, "Only JPG, PNG, and WebP odometer photos are supported.");
  }

  return mimeType;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType.includes("mpeg")) {
    return ".mp3";
  }

  if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    return ".m4a";
  }

  if (mimeType.includes("ogg")) {
    return ".ogg";
  }

  if (mimeType.includes("wav")) {
    return ".wav";
  }

  return mimeType.startsWith("audio/") ? ".webm" : ".webp";
}

function getMaxBytesForPurpose(purpose: string) {
  if (purpose === "site-visit") {
    return MAX_SITE_VISIT_DIRECT_UPLOAD_BYTES;
  }

  if (purpose === "site-visit-voice") {
    return MAX_SITE_VISIT_VOICE_UPLOAD_BYTES;
  }

  return MAX_ODOMETER_DIRECT_UPLOAD_BYTES;
}

function prefixForPurpose(purpose: string) {
  if (purpose === "site-visit") {
    return "site-visits";
  }

  if (purpose === "site-visit-voice") {
    return "site-visit-voice";
  }

  return "odometer";
}

function sanitizeFileName(value: string | null | undefined) {
  return value?.trim().replace(/[^\w.-]/g, "_").slice(0, 120) ?? "";
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^\w.-]/g, "_").slice(0, 80) || "user";
}
