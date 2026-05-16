import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { confirmSalesOrderPreviewByAccounting } from "@/lib/repository";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const { id } = await context.params;
    const orderRequest = await confirmSalesOrderPreviewByAccounting(user, id);
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
