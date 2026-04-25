import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { upsertTarget } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as Record<string, string>;
    const target = await upsertTarget(user, `${body.agentId}`, `${body.month}`, Number(body.quantityTarget));
    return jsonOk({ target }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
