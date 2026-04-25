import { rejectOdometerReading } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const { id } = await context.params;
    const reading = await rejectOdometerReading(user, id, `${body.note ?? ""}`);
    return jsonOk({ reading });
  } catch (error) {
    return jsonError(error);
  }
}
