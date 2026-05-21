import { discardOdometerReading } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import type { OdometerDiscardReason } from "@/lib/types";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json().catch(() => ({}))) as { reason?: OdometerDiscardReason; note?: string };
    const { id } = await context.params;
    const reading = await discardOdometerReading(user, id, {
      reason: body.reason ?? "OTHER",
      note: `${body.note ?? ""}`,
    });
    return jsonOk({ reading });
  } catch (error) {
    return jsonError(error);
  }
}
