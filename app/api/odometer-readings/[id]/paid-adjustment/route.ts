import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createPaidOdometerCorrectionAdjustment } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { newValue?: number | string; reason?: string };
    const { id } = await context.params;
    const adjustment = await createPaidOdometerCorrectionAdjustment(user, id, {
      newValue: Number(body.newValue),
      reason: `${body.reason ?? ""}`,
    });
    return jsonOk({ adjustment }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
