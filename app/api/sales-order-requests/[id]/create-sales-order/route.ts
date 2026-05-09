import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createSalesOrderFromLedgerByAccounting } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const { id } = await context.params;
    const orderRequest = await createSalesOrderFromLedgerByAccounting(user, id, `${body.note ?? ""}`);

    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
