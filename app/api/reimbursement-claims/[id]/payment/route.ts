import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { recordReimbursementClaimPayment } from "@/lib/repository";
import type { ReimbursementPaymentMode } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const { id } = await params;
    const body = (await request.json()) as {
      action?: "FULL" | "PARTIAL" | "HOLD" | "REJECT";
      amount?: number;
      paymentMode?: ReimbursementPaymentMode;
      referenceNumber?: string;
      remarks?: string;
    };
    const claim = await recordReimbursementClaimPayment(user, id, {
      action: body.action ?? "FULL",
      amount: Number(body.amount),
      paymentMode: body.paymentMode,
      referenceNumber: `${body.referenceNumber ?? ""}`,
      remarks: `${body.remarks ?? ""}`,
    });
    return jsonOk({ claim });
  } catch (error) {
    return jsonError(error);
  }
}
