import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { reopenOdometerReadingForCorrection } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const { id } = await context.params;

    const result = await reopenOdometerReadingForCorrection(user, id, `${body.reason ?? ""}`);

    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
