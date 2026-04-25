import type { LeadStage } from "@/lib/types";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { updateLead } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const body = (await request.json()) as Record<string, string | number>;
    const { id } = await context.params;
    const lead = await updateLead(user, id, {
      score: body.score !== undefined ? Number(body.score) : undefined,
      stage: body.stage as LeadStage | undefined,
      nextFollowUpAt: body.nextFollowUpAt ? new Date(`${body.nextFollowUpAt}`).toISOString() : undefined,
      futureScope: typeof body.futureScope === "string" ? body.futureScope : undefined,
      priceExpectation: typeof body.priceExpectation === "string" ? body.priceExpectation : undefined,
    });
    return jsonOk({ lead });
  } catch (error) {
    return jsonError(error);
  }
}
