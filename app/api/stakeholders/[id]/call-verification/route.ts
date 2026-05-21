import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { markStakeholderContactVerified, requestStakeholderContactVerification } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { markVerified?: boolean };

    if (body.markVerified) {
      const stakeholder = await markStakeholderContactVerified(user, id, "CALL");
      return jsonOk({ stakeholder });
    }

    const result = await requestStakeholderContactVerification(user, id, "CALL");
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
