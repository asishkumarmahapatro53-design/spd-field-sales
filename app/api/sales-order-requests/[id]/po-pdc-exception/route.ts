import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { decidePoPdcExceptionByManager, requestPoPdcExceptionByAccounting } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "REQUEST" | "APPROVE" | "REJECT";
      reason?: string;
      note?: string;
    };
    const { id } = await context.params;

    if (body.action === "APPROVE" || body.action === "REJECT") {
      const user = await requireApiUser(["MANAGER"]);
      const orderRequest = await decidePoPdcExceptionByManager(user, id, body.action === "APPROVE", `${body.note ?? body.reason ?? ""}`);
      return jsonOk({ orderRequest });
    }

    const user = await requireApiUser(["ACCOUNTING"]);
    const orderRequest = await requestPoPdcExceptionByAccounting(user, id, `${body.reason ?? ""}`);
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
