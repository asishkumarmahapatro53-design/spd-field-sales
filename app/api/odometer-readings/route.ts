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
      ? await parseJsonOdometerPayload(request)
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
    latLng: parseLatLng({
      lat: formData.get("lat"),
      lng: formData.get("lng"),
    }),
  };
}

async function parseJsonOdometerPayload(request: Request) {
  const payload = (await request.json()) as {
    type?: string;
    photoBase64?: string;
    photoName?: string;
    mimeType?: string;
    lat?: string;
    lng?: string;
  };
  const type = requireString(payload.type, "Reading type is required.") as ReadingType;
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
    latLng: parseLatLng({
      lat: payload.lat,
      lng: payload.lng,
    }),
  };
}

function sanitizeFileName(value: string | null | undefined) {
  return value?.trim().replace(/[^\w.-]/g, "_").slice(0, 120) ?? "";
}
