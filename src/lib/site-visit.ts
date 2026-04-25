import type {
  ExpectedSupplyWindow,
  LatLng,
  LeadStage,
  SiteLocationVerificationStatus,
  StakeholderContact,
  StakeholderRole,
} from "@/lib/types";

export const STAKEHOLDER_OPTIONS: Array<{ role: StakeholderRole; label: string }> = [
  { role: "SITE_SUPERVISOR", label: "Site supervisor" },
  { role: "SITE_ENGINEER", label: "Site engineer" },
  { role: "CONTRACTOR", label: "Contractor" },
  { role: "OWNER_BUILDER", label: "Owner / builder" },
  { role: "PROJECT_MANAGER", label: "Project manager" },
  { role: "PURCHASE_HEAD", label: "Purchase head" },
  { role: "OTHERS", label: "Others" },
  { role: "FOUND_NO_ONE", label: "Found no one" },
];

export const EXPECTED_SUPPLY_OPTIONS: Array<{ value: ExpectedSupplyWindow; label: string }> = [
  { value: "WITHIN_7_DAYS", label: "Within 7 days" },
  { value: "WITHIN_15_DAYS", label: "Within 15 days" },
  { value: "WITHIN_30_DAYS", label: "Within 30 days" },
  { value: "MORE_THAN_30_DAYS", label: "More than 30 days" },
];

export function getStakeholderLabel(role: StakeholderRole) {
  return STAKEHOLDER_OPTIONS.find((entry) => entry.role === role)?.label ?? role;
}

export function normalizeStakeholderRole(value: string | null | undefined): StakeholderRole {
  const normalized = `${value ?? ""}`.trim().toUpperCase();

  switch (normalized) {
    case "SITE_SUPERVISOR":
      return "SITE_SUPERVISOR";
    case "SITE_ENGINEER":
      return "SITE_ENGINEER";
    case "CONTRACTOR":
      return "CONTRACTOR";
    case "OWNER_BUILDER":
      return "OWNER_BUILDER";
    case "PROJECT_MANAGER":
      return "PROJECT_MANAGER";
    case "PURCHASE_HEAD":
      return "PURCHASE_HEAD";
    case "OTHERS":
      return "OTHERS";
    case "FOUND_NO_ONE":
      return "FOUND_NO_ONE";
    default:
      return "OTHERS";
  }
}

function addDays(baseIso: string, days: number) {
  const baseDate = new Date(baseIso);
  const nextDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return Number.isNaN(nextDate.getTime()) ? new Date().toISOString() : nextDate.toISOString();
}

export function suggestLeadStage(input: {
  expectedSupplyWindow: ExpectedSupplyWindow | null;
  stakeholders: StakeholderContact[];
}) {
  const { expectedSupplyWindow, stakeholders } = input;
  const hasMeaningfulStakeholder = stakeholders.some((entry) => (entry.role ?? "OTHERS") !== "FOUND_NO_ONE" && entry.name.trim());

  if (expectedSupplyWindow === "WITHIN_7_DAYS" && hasMeaningfulStakeholder) {
    return "NEGOTIATING" satisfies LeadStage;
  }

  if (expectedSupplyWindow === "WITHIN_15_DAYS" && hasMeaningfulStakeholder) {
    return "TALKS" satisfies LeadStage;
  }

  if (!hasMeaningfulStakeholder) {
    return "TALKS" satisfies LeadStage;
  }

  return "TALKS" satisfies LeadStage;
}

export function suggestNextFollowUp(input: {
  baseIso?: string | null;
  expectedSupplyWindow: ExpectedSupplyWindow | null;
}) {
  const baseIso = input.baseIso && !Number.isNaN(new Date(input.baseIso).getTime()) ? input.baseIso : new Date().toISOString();

  switch (input.expectedSupplyWindow) {
    case "WITHIN_7_DAYS":
      return addDays(baseIso, 2);
    case "WITHIN_15_DAYS":
      return addDays(baseIso, 5);
    case "WITHIN_30_DAYS":
      return addDays(baseIso, 10);
    case "MORE_THAN_30_DAYS":
      return addDays(baseIso, 20);
    default:
      return addDays(baseIso, 3);
  }
}

export function suggestLeadScore(input: {
  expectedSupplyWindow: ExpectedSupplyWindow | null;
  stakeholders: StakeholderContact[];
  currentSupplier: string;
}) {
  let score = 5;
  const foundNoOne = input.stakeholders.every((entry) => (entry.role ?? "OTHERS") === "FOUND_NO_ONE");

  if (input.expectedSupplyWindow === "WITHIN_7_DAYS") {
    score += 3;
  } else if (input.expectedSupplyWindow === "WITHIN_15_DAYS") {
    score += 2;
  } else if (input.expectedSupplyWindow === "WITHIN_30_DAYS") {
    score += 1;
  }

  if (!foundNoOne) {
    score += 1;
  }

  if (input.currentSupplier.toLowerCase().includes("manual")) {
    score += 1;
  }

  return Math.max(1, Math.min(score, 10));
}

export function distanceMeters(left: LatLng, right: LatLng) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.sin(deltaLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getLocationVerification(input: {
  savedLatLng: LatLng | null;
  detectedLatLng: LatLng | null;
  radiusMeters?: number;
}): {
  status: SiteLocationVerificationStatus;
  distanceMeters: number | null;
  isWithinRange: boolean;
} {
  const radiusMeters = input.radiusMeters ?? 100;

  if (!input.savedLatLng) {
    return {
      status: "SAVED_COORDS_MISSING" satisfies SiteLocationVerificationStatus,
      distanceMeters: null,
      isWithinRange: false,
    };
  }

  if (!input.detectedLatLng) {
    return {
      status: "PHOTO_COORDS_MISSING" satisfies SiteLocationVerificationStatus,
      distanceMeters: null,
      isWithinRange: false,
    };
  }

  const meters = distanceMeters(input.savedLatLng, input.detectedLatLng);
  return {
    status: (meters <= radiusMeters ? "MATCHED" : "OUT_OF_RANGE") satisfies SiteLocationVerificationStatus,
    distanceMeters: Math.round(meters),
    isWithinRange: meters <= radiusMeters,
  };
}
