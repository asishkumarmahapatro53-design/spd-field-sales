import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { resolveHelpRequest } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { resolutionNote?: string };
    const { id } = await context.params;
    const helpRequest = await resolveHelpRequest(user, id, `${body.resolutionNote ?? ""}`);
    return jsonOk({ helpRequest });
  } catch (error) {
    return jsonError(error);
  }
}
