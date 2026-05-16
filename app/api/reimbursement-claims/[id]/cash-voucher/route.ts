import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createReimbursementCashVoucher } from "@/lib/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const { id } = await params;
    const body = (await request.json()) as {
      cashVoucherNumber?: string;
      amount?: number;
      remarks?: string;
    };
    const claim = await createReimbursementCashVoucher(user, id, {
      cashVoucherNumber: `${body.cashVoucherNumber ?? ""}`,
      amount: Number(body.amount),
      remarks: `${body.remarks ?? ""}`,
    });
    return jsonOk({ claim });
  } catch (error) {
    return jsonError(error);
  }
}
