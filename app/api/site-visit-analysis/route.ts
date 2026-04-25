import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { ocrService } from "@/lib/ocr";
import { readUploadedFileBuffer } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    await requireApiUser(["SALES_AGENT"]);
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
