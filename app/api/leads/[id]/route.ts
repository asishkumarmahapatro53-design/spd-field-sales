import type { LeadStage } from "@/lib/types";
import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { updateLead } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const body = (await request.json()) as Record<string, string | number>;
    const { id } = await context.params;

    let nextFollowUpAt: string | undefined;
    if (body.nextFollowUpAt) {
      const d = new Date(`${body.nextFollowUpAt}`);
      if (Number.isNaN(d.getTime())) {
        throw new ApiError(400, "Invalid follow-up date provided.");
      }
      nextFollowUpAt = d.toISOString();
    }

    const lead = await updateLead(user, id, {
      score: body.score !== undefined ? Number(body.score) : undefined,
      stage: body.stage as LeadStage | undefined,
      nextFollowUpAt,
      futureScope: typeof body.futureScope === "string" ? body.futureScope : undefined,
      priceExpectation: typeof body.priceExpectation === "string" ? body.priceExpectation : undefined,
    });
    return jsonOk({ lead });
  } catch (error) {
    return jsonError(error);
  }
}
