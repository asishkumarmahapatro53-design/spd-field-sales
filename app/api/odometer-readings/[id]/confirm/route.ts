import { confirmOdometerReading } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const { id } = await context.params;
    const reading = await confirmOdometerReading(user, id);
    return jsonOk({ reading });
  } catch (error) {
    return jsonError(error);
  }
}
