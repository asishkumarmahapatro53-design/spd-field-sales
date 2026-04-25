import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { sendReimbursementClaimOtp } from "@/lib/repository";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const { id } = await params;
    const claim = await sendReimbursementClaimOtp(user, id);
    return jsonOk({ claim });
  } catch (error) {
    return jsonError(error);
  }
}
