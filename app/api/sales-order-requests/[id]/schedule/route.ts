import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { submitScheduleRequest } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json()) as {
      scheduleDateTime?: string;
      receiverName?: string;
      receiverPhone?: string;
      note?: string;
    };
    const { id } = await context.params;
    const orderRequest = await submitScheduleRequest(user, id, {
      scheduleDateTime: `${body.scheduleDateTime ?? ""}`,
      receiverName: `${body.receiverName ?? ""}`,
      receiverPhone: `${body.receiverPhone ?? ""}`,
      note: `${body.note ?? ""}`,
    });
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
