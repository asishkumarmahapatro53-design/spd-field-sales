import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { reviseSalesOrderQuantity } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER", "ACCOUNTING"]);
    const body = (await request.json()) as { revisedQuantity?: number | string; reason?: string };
    const { id } = await context.params;
    const orderRequest = await reviseSalesOrderQuantity(user, id, {
      revisedQuantity: Number(body.revisedQuantity),
      reason: `${body.reason ?? ""}`,
    });
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
