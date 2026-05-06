import type { ExpectedSupplyWindow, LeadStage } from "@/lib/types";
import { ApiError, jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { updateSiteVisit } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    let nextFollowUpAt: string | undefined;
    if (typeof body.nextFollowUpAt === "string" && body.nextFollowUpAt.trim()) {
      const date = new Date(body.nextFollowUpAt);
      if (Number.isNaN(date.getTime())) {
        throw new ApiError(400, "Invalid follow-up date provided.");
      }
      nextFollowUpAt = date.toISOString();
    }

    const quantityRaw =
      typeof body.quantityCum === "number"
        ? body.quantityCum
        : typeof body.quantityCum === "string" && body.quantityCum.trim()
          ? Number(body.quantityCum)
          : undefined;

    const visit = await updateSiteVisit(user, id, {
      stageOfWork: typeof body.stageOfWork === "string" ? body.stageOfWork : undefined,
      futureScope: typeof body.futureScope === "string" ? body.futureScope : undefined,
      concreteGrade: typeof body.concreteGrade === "string" ? body.concreteGrade : undefined,
      quantityCum: quantityRaw,
      leadStage: typeof body.leadStage === "string" ? (body.leadStage as LeadStage) : undefined,
      nextFollowUpAt,
      expectedSupplyWindow:
        body.expectedSupplyWindow === null
          ? null
          : typeof body.expectedSupplyWindow === "string"
            ? (body.expectedSupplyWindow as ExpectedSupplyWindow)
            : undefined,
      remarksText: typeof body.remarksText === "string" ? body.remarksText : undefined,
    });

    return jsonOk({ visit });
  } catch (error) {
    return jsonError(error);
  }
}
