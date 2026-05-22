import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { correctOdometerReading } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { newValue?: number | string; reason?: string };
    const { id } = await context.params;

    const reading = await correctOdometerReading(user, id, {
      newValue: Number(body.newValue),
      reason: `${body.reason ?? ""}`,
    });

    return jsonOk({ reading });
  } catch (error) {
    return jsonError(error);
  }
}
