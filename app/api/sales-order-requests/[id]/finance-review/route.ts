import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { reviewSalesOrderRequestByAccounting } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const body = (await request.json()) as { status?: "FINANCE_VERIFIED" | "FINANCE_REJECTED"; note?: string };
    const { id } = await context.params;
    const orderRequest = await reviewSalesOrderRequestByAccounting(
      user,
      id,
      body.status === "FINANCE_REJECTED" ? "FINANCE_REJECTED" : "FINANCE_VERIFIED",
      `${body.note ?? ""}`,
    );
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
