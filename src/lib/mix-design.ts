import type { MixDesign, MixDesignType, SalesOrderRequest } from "@/lib/types";

export interface MixDesignRecipe {
  targetSlumpMm: number;
  cementKgPerCum: number;
  ggbsKgPerCum: number;
  flyAshKgPerCum: number;
  sandKgPerCum: number;
  aggregate10mmKgPerCum: number;
  aggregate20mmKgPerCum: number;
  admixtureKgPerCum: number;
  waterLitresPerCum: number;
}

const DEFAULT_RECIPES_BY_STRENGTH: Array<{ maxGrade: number; recipe: MixDesignRecipe }> = [
  {
    maxGrade: 10,
    recipe: {
      targetSlumpMm: 100,
      cementKgPerCum: 220,
      ggbsKgPerCum: 0,
      flyAshKgPerCum: 0,
      sandKgPerCum: 780,
      aggregate10mmKgPerCum: 350,
      aggregate20mmKgPerCum: 780,
      admixtureKgPerCum: 0.6,
      waterLitresPerCum: 180,
    },
  },
  {
    maxGrade: 15,
    recipe: {
      targetSlumpMm: 100,
      cementKgPerCum: 260,
      ggbsKgPerCum: 0,
      flyAshKgPerCum: 0,
      sandKgPerCum: 760,
      aggregate10mmKgPerCum: 360,
      aggregate20mmKgPerCum: 760,
      admixtureKgPerCum: 0.8,
      waterLitresPerCum: 180,
    },
  },
  {
    maxGrade: 20,
    recipe: {
      targetSlumpMm: 100,
      cementKgPerCum: 300,
      ggbsKgPerCum: 0,
      flyAshKgPerCum: 35,
      sandKgPerCum: 730,
      aggregate10mmKgPerCum: 370,
      aggregate20mmKgPerCum: 740,
      admixtureKgPerCum: 1,
      waterLitresPerCum: 170,
    },
  },
  {
    maxGrade: 25,
    recipe: {
      targetSlumpMm: 100,
      cementKgPerCum: 330,
      ggbsKgPerCum: 0,
      flyAshKgPerCum: 50,
      sandKgPerCum: 700,
      aggregate10mmKgPerCum: 380,
      aggregate20mmKgPerCum: 720,
      admixtureKgPerCum: 1.1,
      waterLitresPerCum: 165,
    },
  },
  {
    maxGrade: 30,
    recipe: {
      targetSlumpMm: 100,
      cementKgPerCum: 360,
      ggbsKgPerCum: 0,
      flyAshKgPerCum: 60,
      sandKgPerCum: 680,
      aggregate10mmKgPerCum: 380,
      aggregate20mmKgPerCum: 710,
      admixtureKgPerCum: 1.25,
      waterLitresPerCum: 160,
    },
  },
  {
    maxGrade: 40,
    recipe: {
      targetSlumpMm: 100,
      cementKgPerCum: 410,
      ggbsKgPerCum: 30,
      flyAshKgPerCum: 45,
      sandKgPerCum: 650,
      aggregate10mmKgPerCum: 390,
      aggregate20mmKgPerCum: 700,
      admixtureKgPerCum: 1.6,
      waterLitresPerCum: 155,
    },
  },
];

function getGradeStrength(grade: string) {
  const match = grade.toUpperCase().match(/M\s*(\d+)/);
  return match ? Number(match[1]) : 25;
}

export function getDefaultMixDesignRecipe(grade: string, mixDesignType: MixDesignType): MixDesignRecipe {
  const strength = getGradeStrength(grade);
  const matched = DEFAULT_RECIPES_BY_STRENGTH.find((entry) => strength <= entry.maxGrade);
  const recipe = matched?.recipe ?? DEFAULT_RECIPES_BY_STRENGTH[DEFAULT_RECIPES_BY_STRENGTH.length - 1].recipe;

  if (mixDesignType === "NOMINAL_MIX") {
    return {
      ...recipe,
      ggbsKgPerCum: 0,
      flyAshKgPerCum: 0,
    };
  }

  return recipe;
}

export function parseSlumpMm(value: string | null | undefined, fallback = 100) {
  const match = `${value ?? ""}`.match(/\d+/);
  const parsed = match ? Number(match[0]) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function findMixDesignForOrder(mixDesigns: MixDesign[], order: SalesOrderRequest) {
  if (order.mixDesignId) {
    const linkedDesign = mixDesigns.find((design) => design.id === order.mixDesignId);
    if (linkedDesign) {
      return linkedDesign;
    }
  }

  return (
    mixDesigns.find(
      (design) => design.plantId === order.plantId && design.grade === order.grade.toUpperCase().trim() && design.isActive,
    ) ?? null
  );
}
