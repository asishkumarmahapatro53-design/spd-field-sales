import type { LeadStage } from "@/lib/types";
import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { closeLead, rejectLeadClosure, reopenLead, updateLead } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const body = (await request.json()) as Record<string, string | number>;
    const { id } = await context.params;
    const action = `${body.action ?? ""}`.trim();

    if (action === "close") {
      const lead = await closeLead(user, id, {
        reason: `${body.reason ?? ""}`.trim(),
        remarks: `${body.remarks ?? ""}`.trim(),
      });
      return jsonOk({ lead });
    }

    if (action === "reopen") {
      const lead = await reopenLead(user, id, `${body.reason ?? ""}`);
      return jsonOk({ lead });
    }

    if (action === "rejectClosure") {
      const lead = await rejectLeadClosure(user, id, `${body.reason ?? ""}`);
      return jsonOk({ lead });
    }

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
