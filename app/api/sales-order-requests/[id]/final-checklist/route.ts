import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { saveSalesOrderFinalChecklistByAccounting } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const orderRequest = await saveSalesOrderFinalChecklistByAccounting(user, id, body);
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
