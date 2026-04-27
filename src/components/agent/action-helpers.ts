"use client";

export type DirectUploadPurpose = "odometer" | "site-visit" | "site-visit-voice";

export interface PresignedUploadPayload {
  uploadUrl: string;
  key: string;
  headers: Record<string, string>;
  originalFileName: string;
}

export async function getLocationPayload() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: "", lng: "" };
  }

  return new Promise<{ lat: string; lng: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        }),
      () => resolve({ lat: "", lng: "" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export async function uploadDirectFile(file: File, purpose: DirectUploadPurpose) {
  const presignResponse = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purpose,
      fileName: file.name,
      mimeType: file.type || (purpose === "site-visit-voice" ? "audio/webm" : "image/webp"),
      sizeBytes: file.size,
    }),
  });

  if (!presignResponse.ok) {
    throw new Error(await parseApiError(presignResponse));
  }

  const upload = (await presignResponse.json()) as PresignedUploadPayload;
  let s3Response: Response;

  try {
    s3Response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: file,
    });
  } catch {
    throw new Error("File upload to S3 could not start. Check S3 CORS for this domain and try again.");
  }

  if (!s3Response.ok) {
    throw new Error(`File upload to S3 failed (${s3Response.status}). Check S3 CORS and try again.`);
  }

  return upload;
}

export async function parseApiError(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return `Request failed (${response.status}).`;
  }

  const normalized = text.trim();

  if (normalized.startsWith("<!DOCTYPE") || normalized.startsWith("<html") || normalized.startsWith("<HTML")) {
    if (/request could not be satisfied/i.test(normalized)) {
      return `Upload failed before the app server could process the photo (${response.status}). Please retake the photo closer to the odometer and try again.`;
    }

    return `The server returned an HTML error page instead of an API response (${response.status}). Please try again.`;
  }

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error ?? `Request failed (${response.status}).`;
  } catch {
    return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
  }
}

export function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localTime.toISOString().slice(0, 16);
}
