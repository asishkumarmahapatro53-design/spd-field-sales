import { requireUser } from "@/lib/auth";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { updateDatabase } from "@/lib/db";
import { nowIso } from "@/lib/date";
import type { MixDesign } from "@/lib/types";

/** PUT /api/mix-designs/[id] — Update an existing mix design (creates a new version) */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (user.role === "SALES_AGENT") {
      throw new ApiError(403, "Only Managers can update Mix Designs.");
    }

    const { id } = await params;
    const body = (await request.json()) as Partial<MixDesign>;

    let updatedDesign: MixDesign | null = null;

    await updateDatabase((draft) => {
      const idx = draft.mixDesigns.findIndex((d) => d.id === id);
      if (idx === -1) throw new ApiError(404, "Mix Design not found.");

      const existing = draft.mixDesigns[idx];
      updatedDesign = {
        ...existing,
        mixDesignType: body.mixDesignType ?? existing.mixDesignType,
        targetSlumpMm: body.targetSlumpMm !== undefined ? Number(body.targetSlumpMm) : existing.targetSlumpMm,
        cementKgPerCum: body.cementKgPerCum !== undefined ? Number(body.cementKgPerCum) : existing.cementKgPerCum,
        ggbsKgPerCum: body.ggbsKgPerCum !== undefined ? Number(body.ggbsKgPerCum) : existing.ggbsKgPerCum,
        flyAshKgPerCum: body.flyAshKgPerCum !== undefined ? Number(body.flyAshKgPerCum) : existing.flyAshKgPerCum,
        sandKgPerCum: body.sandKgPerCum !== undefined ? Number(body.sandKgPerCum) : existing.sandKgPerCum,
        aggregate10mmKgPerCum: body.aggregate10mmKgPerCum !== undefined ? Number(body.aggregate10mmKgPerCum) : existing.aggregate10mmKgPerCum,
        aggregate20mmKgPerCum: body.aggregate20mmKgPerCum !== undefined ? Number(body.aggregate20mmKgPerCum) : existing.aggregate20mmKgPerCum,
        admixtureKgPerCum: body.admixtureKgPerCum !== undefined ? Number(body.admixtureKgPerCum) : existing.admixtureKgPerCum,
        waterLitresPerCum: body.waterLitresPerCum !== undefined ? Number(body.waterLitresPerCum) : existing.waterLitresPerCum,
        isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
        updatedAt: nowIso(),
      };
      draft.mixDesigns[idx] = updatedDesign;
    });

    return jsonOk({ mixDesign: updatedDesign });
  } catch (error) {
    return jsonError(error);
  }
}
