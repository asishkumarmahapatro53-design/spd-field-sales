import { ApiError, jsonError, jsonOk, parseLatLng, requireApiUser, requireNumber, requireString, toIsoDateTime } from "@/lib/api";
import { createSiteVisit } from "@/lib/repository";
import type { ExpectedSupplyWindow, LeadStage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.includes("application/json")
      ? await parseJsonSiteVisitPayload(request, user.id)
      : await parseFormSiteVisitPayload(request);
    const visit = await createSiteVisit(user, input);

    return jsonOk({ visit }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

async function parseFormSiteVisitPayload(request: Request) {
  const formData = await request.formData();
  const arrivalPhoto = formData.get("arrivalPhoto");
  const remarksVoiceNote = formData.get("remarksVoiceNote");

  if (!(arrivalPhoto instanceof File)) {
    throw new ApiError(400, "Arrival photo is required.");
  }

  return {
    file: arrivalPhoto,
    ...readCommonSiteVisitFields({
      get: (key) => formData.get(key),
    }),
    remarksVoiceNoteFile: remarksVoiceNote instanceof File && remarksVoiceNote.size > 0 ? remarksVoiceNote : null,
  };
}

async function parseJsonSiteVisitPayload(request: Request, userId: string) {
  const payload = (await request.json()) as Record<string, unknown>;
  const arrivalPhotoS3Key = validateUploadedKey(payload.arrivalPhotoS3Key, userId, "site-visits", "Arrival photo is required.");
  const remarksVoiceNoteS3Key = `${payload.remarksVoiceNoteS3Key ?? ""}`.trim();

  return {
    uploadedObject: {
      s3Key: arrivalPhotoS3Key,
      originalFileName: sanitizeFileName(payload.arrivalPhotoName) || arrivalPhotoS3Key.split("/").at(-1) || "site-visit.webp",
      mimeType: readOptionalString(payload.arrivalPhotoMimeType) || null,
      sizeBytes: readOptionalNumber(payload.arrivalPhotoSizeBytes),
    },
    ...readCommonSiteVisitFields({
      get: (key) => payload[key],
    }),
    remarksVoiceNoteObject: remarksVoiceNoteS3Key
      ? {
          s3Key: validateUploadedKey(remarksVoiceNoteS3Key, userId, "site-visit-voice", "Voice note path is invalid."),
          originalFileName: sanitizeFileName(payload.remarksVoiceNoteName) || remarksVoiceNoteS3Key.split("/").at(-1) || "voice-note",
          mimeType: readOptionalString(payload.remarksVoiceNoteMimeType) || null,
          sizeBytes: readOptionalNumber(payload.remarksVoiceNoteSizeBytes),
        }
      : null,
  };
}

function readCommonSiteVisitFields(source: { get: (key: string) => unknown }) {
  const leadStageValue = readOptionalString(source.get("leadStage"));
  const nextFollowUpAtValue = readOptionalString(source.get("nextFollowUpAt"));

  return {
    leadId: readOptionalString(source.get("leadId")) || null,
    siteId: readOptionalString(source.get("siteId")) || null,
    siteName: readOptionalString(source.get("siteName")),
    siteAddress: readOptionalString(source.get("siteAddress")),
    stakeholders: requireString(readOptionalString(source.get("stakeholders")), "Stakeholder details are required."),
    concreteGrade: requireString(readOptionalString(source.get("concreteGrade")), "Concrete grade is required."),
    quantityCum: requireNumber(`${source.get("quantityCum") ?? ""}`, "Quantity is required."),
    stageOfWork: requireString(readOptionalString(source.get("stageOfWork")), "Stage of work is required."),
    futureScope: requireString(readOptionalString(source.get("futureScope")), "Future scope is required."),
    currentSupplier: readOptionalString(source.get("currentSupplier")),
    priceExpectation: readOptionalString(source.get("priceExpectation")),
    expectedSupplyWindow: (readOptionalString(source.get("expectedSupplyWindow")) || null) as ExpectedSupplyWindow | null,
    score: readOptionalString(source.get("score")) ? requireNumber(`${source.get("score") ?? ""}`, "Score is invalid.") : null,
    leadStage: (leadStageValue || null) as LeadStage | null,
    nextFollowUpAt: nextFollowUpAtValue ? toIsoDateTime(nextFollowUpAtValue, "Invalid follow-up date.") : null,
    latLng: parseLatLng({
      lat: source.get("lat"),
      lng: source.get("lng"),
    }),
    detectedLatLng: parseLatLng({
      lat: source.get("detectedLat"),
      lng: source.get("detectedLng"),
    }),
    photoWatermarkAddress: readOptionalString(source.get("photoWatermarkAddress")),
    photoCapturedAt: readOptionalString(source.get("photoCapturedAt")) || null,
    remarksText: readOptionalString(source.get("remarksText")),
    remarksTranscriptText: readOptionalString(source.get("remarksTranscriptText")),
  };
}

function validateUploadedKey(value: unknown, userId: string, uploadPrefix: string, message: string) {
  const key = requireString(readOptionalString(value), message);
  const expectedPrefix = `uploads/${uploadPrefix}/${sanitizePathSegment(userId)}/`;

  if (!key.startsWith(expectedPrefix) || key.includes("..")) {
    throw new ApiError(400, "Uploaded file path is not allowed.");
  }

  return key;
}

function readOptionalString(value: unknown) {
  return `${value ?? ""}`.trim();
}

function readOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeFileName(value: unknown) {
  return `${value ?? ""}`.trim().replace(/[^\w.-]/g, "_").slice(0, 120);
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^\w.-]/g, "_").slice(0, 80) || "user";
}
