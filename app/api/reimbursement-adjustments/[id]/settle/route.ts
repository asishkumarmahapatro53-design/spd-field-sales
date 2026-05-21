import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { settleReimbursementAdjustment } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const body = (await request.json().catch(() => ({}))) as { settledInClaimId?: string | null; remark?: string | null };
    const { id } = await context.params;
    const adjustment = await settleReimbursementAdjustment(user, id, {
      settledInClaimId: body.settledInClaimId ?? null,
      remark: body.remark ?? null,
    });
    return jsonOk({ adjustment });
  } catch (error) {
    return jsonError(error);
  }
}
