import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { resolveVerification } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { manualValue?: string | number; note?: string };
    const { id } = await context.params;
    const reading = await resolveVerification(user, id, Number(body.manualValue), `${body.note ?? ""}`);
    return jsonOk({ reading });
  } catch (error) {
    return jsonError(error);
  }
}
