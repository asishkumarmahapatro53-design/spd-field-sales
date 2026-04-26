import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { readDatabase, updateDatabase } from "@/lib/db";
import { nowIso } from "@/lib/date";
import type { MixDesign } from "@/lib/types";

/** GET /api/mix-designs?plantId=xxx — List all active mix designs (optionally filtered by plant) */
export async function GET(request: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const plantId = searchParams.get("plantId");

    const db = await readDatabase();
    let designs = db.mixDesigns ?? [];

    if (plantId) {
      designs = designs.filter((d) => d.plantId === plantId);
    }

    // Only return the active (latest) version per grade per plant
    const latestMap = new Map<string, MixDesign>();
    for (const d of designs) {
      const key = `${d.plantId}::${d.grade}`;
      const existing = latestMap.get(key);
      if (!existing || d.version > existing.version) {
        latestMap.set(key, d);
      }
    }

    return jsonOk({ mixDesigns: Array.from(latestMap.values()) });
  } catch (error) {
    return jsonError(error);
  }
}

/** POST /api/mix-designs — Create a new mix design (Manager or Accounting only) */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.role === "SALES_AGENT") {
      throw new ApiError(403, "Only Managers can create Mix Designs.");
    }

    const body = (await request.json()) as Partial<MixDesign>;

    if (!body.plantId || !body.grade) {
      throw new ApiError(400, "plantId and grade are required.");
    }

    const db = await readDatabase();

    // Find current max version for this grade + plant to increment
    const existingVersions = (db.mixDesigns ?? [])
      .filter((d) => d.plantId === body.plantId && d.grade === body.grade)
      .map((d) => d.version);
    const nextVersion = existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1;

    // Deactivate any previous active designs for this grade+plant
    const newDesign: MixDesign = {
      id: randomUUID(),
      plantId: body.plantId,
      grade: body.grade.toUpperCase().trim(),
      version: nextVersion,
      isActive: true,
      mixDesignType: body.mixDesignType ?? "DESIGN_MIX",
      targetSlumpMm: Number(body.targetSlumpMm ?? 100),
      cementKgPerCum: Number(body.cementKgPerCum ?? 0),
      ggbsKgPerCum: Number(body.ggbsKgPerCum ?? 0),
      flyAshKgPerCum: Number(body.flyAshKgPerCum ?? 0),
      sandKgPerCum: Number(body.sandKgPerCum ?? 0),
      aggregate10mmKgPerCum: Number(body.aggregate10mmKgPerCum ?? 0),
      aggregate20mmKgPerCum: Number(body.aggregate20mmKgPerCum ?? 0),
      admixtureKgPerCum: Number(body.admixtureKgPerCum ?? 0),
      waterLitresPerCum: Number(body.waterLitresPerCum ?? 0),
      createdBy: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await updateDatabase((draft) => {
      // Deactivate old versions for the same grade+plant
      (draft.mixDesigns ?? []).forEach((d) => {
        if (d.plantId === newDesign.plantId && d.grade === newDesign.grade) {
          d.isActive = false;
        }
      });
      draft.mixDesigns.push(newDesign);
    });

    return jsonOk({ mixDesign: newDesign });
  } catch (error) {
    return jsonError(error);
  }
}
