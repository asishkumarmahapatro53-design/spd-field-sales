import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { verifyReimbursementClaimOtp } from "@/lib/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { otpCode?: string };
    const otpCode = `${body.otpCode ?? ""}`.trim();

    if (!otpCode) {
      throw new ApiError(400, "Enter the OTP shared with the sales agent.");
    }

    const claim = await verifyReimbursementClaimOtp(user, id, otpCode);
    return jsonOk({ claim });
  } catch (error) {
    return jsonError(error);
  }
}
