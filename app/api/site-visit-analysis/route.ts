import { ApiError, jsonError, jsonOk, requireApiUser, requireString } from "@/lib/api";
import { ocrService } from "@/lib/ocr";
import { readS3ObjectBuffer, readUploadedFileBuffer } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_SITE_VISIT_ANALYSIS_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const payload = (await request.json()) as {
        s3Key?: string;
        photoName?: string;
        mimeType?: string;
      };
      const s3Key = validateSiteVisitS3Key(payload.s3Key, user.id);
      const object = await readS3ObjectBuffer(s3Key, { maxBytes: MAX_SITE_VISIT_ANALYSIS_BYTES });
      const metadata = await ocrService.extractSiteVisitMetadata({
        fileName: sanitizeFileName(payload.photoName) || s3Key.split("/").at(-1) || "site-visit-photo",
        localAbsolutePath: null,
        inlineBytesBase64: object.buffer.toString("base64"),
        mimeType: payload.mimeType?.trim() || object.contentType,
      });

      return jsonOk({ metadata });
    }

    const formData = await request.formData();
    const photo = formData.get("photo");

    if (!(photo instanceof File) || photo.size === 0) {
      throw new ApiError(400, "A GPS camera site photo is required.");
    }

    const buffer = await readUploadedFileBuffer(photo);
    const metadata = await ocrService.extractSiteVisitMetadata({
      fileName: photo.name || "site-visit-photo",
      localAbsolutePath: null,
      inlineBytesBase64: buffer.toString("base64"),
      mimeType: photo.type || null,
    });

    return jsonOk({ metadata });
  } catch (error) {
    return jsonError(error);
  }
}

function validateSiteVisitS3Key(value: string | null | undefined, userId: string) {
  const key = requireString(value, "Uploaded site visit photo is required.");
  const expectedPrefix = `uploads/site-visits/${sanitizePathSegment(userId)}/`;

  if (!key.startsWith(expectedPrefix) || key.includes("..")) {
    throw new ApiError(400, "Uploaded site visit photo path is not allowed.");
  }

  return key;
}

function sanitizeFileName(value: string | null | undefined) {
  return value?.trim().replace(/[^\w.-]/g, "_").slice(0, 120) ?? "";
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^\w.-]/g, "_").slice(0, 80) || "user";
}
