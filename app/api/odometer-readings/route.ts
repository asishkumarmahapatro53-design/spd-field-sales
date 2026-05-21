import { ApiError, jsonError, jsonOk, parseLatLng, requireApiUser, requireString } from "@/lib/api";
import { createOdometerReading } from "@/lib/repository";
import type { ReadingType } from "@/lib/types";

export const runtime = "nodejs";

const MAX_JSON_PHOTO_BYTES = 80 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.includes("application/json")
      ? await parseJsonOdometerPayload(request, user.id)
      : await parseFormOdometerPayload(request);

    const reading = await createOdometerReading(user, input);

    return jsonOk({ reading }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

async function parseFormOdometerPayload(request: Request) {
  const formData = await request.formData();
  const type = requireString(formData.get("type"), "Reading type is required.") as ReadingType;
  const photo = formData.get("photo");

  if (!(photo instanceof File)) {
    throw new ApiError(400, "An odometer photo is required.");
  }

  return {
    type,
    file: photo,
    agentEnteredReading: requireOdometerManualValue(formData.get("agentEnteredReading")),
    batchConfirmation: `${formData.get("batchConfirmation") ?? ""}`.trim() || null,
    latLng: parseLatLng({
      lat: formData.get("lat"),
      lng: formData.get("lng"),
    }),
  };
}

async function parseJsonOdometerPayload(request: Request, userId: string) {
  const payload = (await request.json()) as {
    type?: string;
    photoBase64?: string;
    photoName?: string;
    mimeType?: string;
    s3Key?: string;
    sizeBytes?: number;
    agentEnteredReading?: string | number;
    batchConfirmation?: string;
    lat?: string;
    lng?: string;
  };
  const type = requireString(payload.type, "Reading type is required.") as ReadingType;
  const latLng = parseLatLng({
    lat: payload.lat,
    lng: payload.lng,
  });

  if (payload.s3Key) {
    const s3Key = validateOdometerS3Key(payload.s3Key, userId);
    return {
      type,
      uploadedObject: {
        s3Key,
        originalFileName: sanitizeFileName(payload.photoName) || s3Key.split("/").at(-1) || "odometer.webp",
        mimeType: payload.mimeType?.trim() || null,
        sizeBytes: Number.isFinite(payload.sizeBytes) ? Number(payload.sizeBytes) : null,
      },
      agentEnteredReading: requireOdometerManualValue(payload.agentEnteredReading),
      batchConfirmation: `${payload.batchConfirmation ?? ""}`.trim() || null,
      latLng,
    };
  }

  const photoBase64 = requireString(payload.photoBase64, "An odometer photo is required.").replace(
    /^data:[^;]+;base64,/,
    "",
  );
  const buffer = Buffer.from(photoBase64, "base64");

  if (!buffer.length) {
    throw new ApiError(400, "The odometer photo could not be decoded.");
  }

  if (buffer.length > MAX_JSON_PHOTO_BYTES) {
    throw new ApiError(413, "The odometer photo is too large. Please retake it closer to the dashboard.");
  }

  const fileName = sanitizeFileName(payload.photoName) || `odometer-${Date.now()}.webp`;
  const mimeType = payload.mimeType?.trim() || "image/webp";
  const file = new File([new Uint8Array(buffer)], fileName, { type: mimeType });

  return {
    type,
    file,
    agentEnteredReading: requireOdometerManualValue(payload.agentEnteredReading),
    batchConfirmation: `${payload.batchConfirmation ?? ""}`.trim() || null,
    latLng,
  };
}

function requireOdometerManualValue(value: unknown) {
  const manualValue = Number(`${value ?? ""}`);

  if (!Number.isFinite(manualValue) || manualValue < 0) {
    throw new ApiError(400, "Agent-entered odometer reading is required and must be a non-negative number.");
  }

  return Math.round(manualValue * 10) / 10;
}

function sanitizeFileName(value: string | null | undefined) {
  return value?.trim().replace(/[^\w.-]/g, "_").slice(0, 120) ?? "";
}

function validateOdometerS3Key(value: string, userId: string) {
  const key = requireString(value, "Uploaded odometer photo is required.");
  const expectedPrefix = `uploads/odometer/${sanitizePathSegment(userId)}/`;

  if (!key.startsWith(expectedPrefix) || key.includes("..")) {
    throw new ApiError(400, "Uploaded odometer photo path is not allowed.");
  }

  return key;
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^\w.-]/g, "_").slice(0, 80) || "user";
}
