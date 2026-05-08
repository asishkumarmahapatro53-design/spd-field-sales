import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { assertRateLimit, buildRateLimitKey, clearRateLimit } from "@/lib/rate-limit";
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

    const rateLimitKey = buildRateLimitKey(request, "reimbursement-otp", `${user.id}:${id}`);
    assertRateLimit(rateLimitKey, {
      limit: 5,
      windowMs: 10 * 60 * 1000,
      message: "Too many OTP verification attempts.",
    });

    const claim = await verifyReimbursementClaimOtp(user, id, otpCode);
    clearRateLimit(rateLimitKey);
    return jsonOk({ claim });
  } catch (error) {
    return jsonError(error);
  }
}
