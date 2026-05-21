import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { recordSiteDirectionUse } from "@/lib/repository";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const { id } = await context.params;
    const site = await recordSiteDirectionUse(user, id);
    return jsonOk({ site });
  } catch (error) {
    return jsonError(error);
  }
}
