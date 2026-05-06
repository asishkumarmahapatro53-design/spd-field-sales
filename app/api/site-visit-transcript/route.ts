import { ApiError, jsonError, jsonOk, requireApiUser, requireString } from "@/lib/api";
import { ocrService } from "@/lib/ocr";
import { readS3ObjectBuffer, readUploadedFileBuffer } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_SITE_VISIT_VOICE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const payload = (await request.json()) as {
        s3Key?: string;
        voiceName?: string;
        mimeType?: string;
      };
      const s3Key = validateSiteVisitVoiceS3Key(payload.s3Key, user.id);
      const object = await readS3ObjectBuffer(s3Key, { maxBytes: MAX_SITE_VISIT_VOICE_BYTES });
      const transcript = await ocrService.transcribeVoiceNote({
        fileName: sanitizeFileName(payload.voiceName) || s3Key.split("/").at(-1) || "voice-note",
        localAbsolutePath: null,
        inlineBytesBase64: object.buffer.toString("base64"),
        mimeType: payload.mimeType?.trim() || object.contentType,
      });
      return jsonOk({ transcript });
    }

    const formData = await request.formData();
    const voice = formData.get("voice");

    if (!(voice instanceof File) || voice.size === 0) {
      throw new ApiError(400, "A voice note file is required.");
    }

    const buffer = await readUploadedFileBuffer(voice);
    const transcript = await ocrService.transcribeVoiceNote({
      fileName: voice.name || "voice-note",
      localAbsolutePath: null,
      inlineBytesBase64: buffer.toString("base64"),
      mimeType: voice.type || null,
    });
    return jsonOk({ transcript });
  } catch (error) {
    return jsonError(error);
  }
}

function validateSiteVisitVoiceS3Key(value: string | null | undefined, userId: string) {
  const key = requireString(value, "Uploaded voice note is required.");
  const expectedPrefix = `uploads/site-visit-voice/${sanitizePathSegment(userId)}/`;

  if (!key.startsWith(expectedPrefix) || key.includes("..")) {
    throw new ApiError(400, "Uploaded voice-note path is not allowed.");
  }

  return key;
}

function sanitizeFileName(value: string | null | undefined) {
  return value?.trim().replace(/[^\w.-]/g, "_").slice(0, 120) ?? "";
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^\w.-]/g, "_").slice(0, 80) || "user";
}
