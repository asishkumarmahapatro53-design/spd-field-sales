import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import {
  GstVerifyConfigError,
  GstVerifyRequestError,
  verifyGstinWithGstVerify,
} from "@/lib/gst-verify";

export async function POST(request: Request) {
  try {
    await requireApiUser(["SALES_AGENT", "ACCOUNTING"]);

    const body = await request.json().catch(() => ({}));
    const gstin = `${body.gstin ?? ""}`.trim();

    if (!gstin) {
      throw new ApiError(400, "GSTIN is required.");
    }

    const verification = await verifyGstinWithGstVerify(gstin);

    return jsonOk({ verification });
  } catch (error) {
    if (error instanceof GstVerifyConfigError) {
      return jsonError(new ApiError(503, error.message));
    }

    if (error instanceof GstVerifyRequestError) {
      return jsonError(new ApiError(error.status, error.message));
    }

    return jsonError(error);
  }
}
