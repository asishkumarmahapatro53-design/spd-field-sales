import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getApprovalItems, normalizePaymentTerms } from "@/lib/commercial";
import { getFirebaseFirestore, hasFirebaseCredentialShape } from "@/lib/firebase-admin";
import { extractPanFromGstin, getActualCastingType, normalizeCastingType, normalizeGstin } from "@/lib/legal-workflow";
import { hashPassword } from "@/lib/password";
import type { Database, Lead, LeadSite, SiteVisit, StakeholderContact, User } from "@/lib/types";
import { nowIso, toDateKey } from "@/lib/date";
import { getStakeholderLabel } from "@/lib/site-visit";

const dataDir = process.env.NODE_ENV === "production" ? "/tmp/spd-data" : path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "mock-db.json");
const DEFAULT_PLANT_IDS = ["plant-a", "plant-b", "plant-c"] as const;
const DEFAULT_DATABASE_READ_CACHE_MS = 60000;

let databaseReadCache: { database: Database; expiresAt: number } | null = null;
let databaseReadPromise: Promise<Database> | null = null;

function getDatabaseReadCacheMs() {
  const configured = Number(process.env.DATABASE_READ_CACHE_MS ?? DEFAULT_DATABASE_READ_CACHE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_DATABASE_READ_CACHE_MS;
}

function cloneDatabase(database: Database): Database {
  return structuredClone(database);
}

function getCachedDatabase() {
  if (!databaseReadCache || databaseReadCache.expiresAt <= Date.now()) {
    return null;
  }

  return cloneDatabase(databaseReadCache.database);
}

function getStaleCachedDatabase() {
  if (!databaseReadCache) {
    return null;
  }

  return cloneDatabase(databaseReadCache.database);
}

function setDatabaseReadCache(database: Database) {
  const cacheMs = getDatabaseReadCacheMs();

  if (cacheMs <= 0) {
    databaseReadCache = null;
    return;
  }

  databaseReadCache = {
    database: cloneDatabase(database),
    expiresAt: Date.now() + cacheMs,
  };
}

function clearDatabaseReadCache() {
  databaseReadCache = null;
  databaseReadPromise = null;
}

function allowsEphemeralPersistence() {
  return process.env.ALLOW_EPHEMERAL_PERSISTENCE?.trim().toLowerCase() === "true";
}

function canUseLocalDatabaseFallback() {
  return process.env.NODE_ENV !== "production" || allowsEphemeralPersistence();
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim();
}

function requireDurableDatabase(context: string, error?: unknown): never {
  const rootCause = error ? ` Root cause: ${describeError(error)}.` : "";
  throw new Error(
    `${context}: persistent database is unavailable. Configure Firebase Firestore for production instead of using disposable local storage.${rootCause}`,
  );
}

function createUserSeed(
  employeeId: string,
  name: string,
  role: User["role"],
  password: string,
  homePlantId: string | null,
  email: string | null = null,
): User {
  return {
    id: randomUUID(),
    employeeId,
    name,
    role,
    status: "ACTIVE",
    homePlantId,
    email,
    passwordHash: hashPassword(password),
  };
}

function createMixDesignUserSeed(): User {
  return {
    id: "user-mix-design-md5001",
    employeeId: "MD5001",
    name: "Mix Design Engineer",
    role: "MIX_DESIGN",
    status: "ACTIVE",
    homePlantId: DEFAULT_PLANT_IDS[0],
    email: null,
    passwordHash: hashPassword("password123"),
  };
}

function createProductionManagerUserSeed(): User {
  return {
    id: "user-production-manager-pm6001",
    employeeId: "PM6001",
    name: "Production Manager",
    role: "PRODUCTION_MANAGER",
    status: "ACTIVE",
    homePlantId: null,
    email: null,
    passwordHash: hashPassword("password123"),
  };
}

function createPlantSeeds() {
  return [
    {
      id: DEFAULT_PLANT_IDS[0],
      code: "PLANT_A",
      name: "Plant A",
      unitName: "Andharua",
      region: "North Cluster",
      status: "ACTIVE" as const,
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 16,
    },
    {
      id: DEFAULT_PLANT_IDS[1],
      code: "PLANT_B",
      name: "Plant B",
      unitName: "Central",
      region: "Central Cluster",
      status: "WATCH" as const,
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 14,
    },
    {
      id: DEFAULT_PLANT_IDS[2],
      code: "PLANT_C",
      name: "Plant C",
      unitName: "South",
      region: "South Cluster",
      status: "ACTIVE" as const,
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 12,
    },
  ];
}

function createFleetSeed() {
  const now = nowIso();

  return [
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      vehicleCode: "OD-02-AA-1101",
      driverName: "Prakash Jena",
      capacityCum: 6,
      status: "ACTIVE" as const,
      deliveriesToday: 5,
      onTimeRate: 94,
      lastDispatchAt: now,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      vehicleCode: "OD-02-AA-1148",
      driverName: "Madan Rout",
      capacityCum: 7,
      status: "IDLE" as const,
      deliveriesToday: 3,
      onTimeRate: 91,
      lastDispatchAt: now,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      vehicleCode: "OD-02-BB-2041",
      driverName: "Sanjay Das",
      capacityCum: 6,
      status: "ACTIVE" as const,
      deliveriesToday: 6,
      onTimeRate: 89,
      lastDispatchAt: now,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      vehicleCode: "OD-02-BB-2190",
      driverName: "Anil Patel",
      capacityCum: 8,
      status: "SERVICE" as const,
      deliveriesToday: 0,
      onTimeRate: 84,
      lastDispatchAt: null,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      vehicleCode: "OD-02-CC-3058",
      driverName: "Rakesh Sahu",
      capacityCum: 6,
      status: "ACTIVE" as const,
      deliveriesToday: 4,
      onTimeRate: 92,
      lastDispatchAt: now,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      vehicleCode: "OD-02-CC-3177",
      driverName: "Nikhil Barik",
      capacityCum: 6,
      status: "OFF_ROUTE" as const,
      deliveriesToday: 1,
      onTimeRate: 78,
      lastDispatchAt: now,
    },
  ];
}

function createMaterialCostSeeds() {
  const now = nowIso();

  return [
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      effectiveAt: now,
      cementPerTon: 7200,
      ggbsPerTon: 2680,
      flyAshPerTon: 1640,
      aggregatePerTon: 1120,
      sandPerTon: 980,
      dieselPerLitre: 92,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      effectiveAt: now,
      cementPerTon: 7340,
      ggbsPerTon: 2740,
      flyAshPerTon: 1680,
      aggregatePerTon: 1090,
      sandPerTon: 1020,
      dieselPerLitre: 94,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      effectiveAt: now,
      cementPerTon: 7100,
      ggbsPerTon: 2620,
      flyAshPerTon: 1590,
      aggregatePerTon: 1150,
      sandPerTon: 1010,
      dieselPerLitre: 91,
    },
  ];
}

function createPriceBenchmarkSeeds() {
  return [
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[0], grade: "M20", sellingPricePerCum: 4580 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[0], grade: "M25", sellingPricePerCum: 4760 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[0], grade: "M30", sellingPricePerCum: 5020 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[1], grade: "M20", sellingPricePerCum: 4620 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[1], grade: "M25", sellingPricePerCum: 4830 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[1], grade: "M30", sellingPricePerCum: 5110 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[2], grade: "M20", sellingPricePerCum: 4520 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[2], grade: "M25", sellingPricePerCum: 4700 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[2], grade: "M30", sellingPricePerCum: 4970 },
  ];
}

function createCustomerAccountSeeds() {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      customerName: "JRM Buildcon",
      odooPartnerId: null,
      whatsappNumber: "+919876500111",
      creditLimit: 1200000,
      creditPeriodDays: 30,
      outstandingAmount: 560000,
      riskLevel: "MEDIUM" as const,
      lastPaymentAt: sixtyDaysAgo,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      customerName: "Sai Infra Projects",
      odooPartnerId: null,
      whatsappNumber: "+919876500222",
      creditLimit: 1450000,
      creditPeriodDays: 35,
      outstandingAmount: 910000,
      riskLevel: "HIGH" as const,
      lastPaymentAt: new Date(Date.now() - 41 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      customerName: "Nexus Constructions",
      odooPartnerId: null,
      whatsappNumber: "+919876500333",
      creditLimit: 980000,
      creditPeriodDays: 28,
      outstandingAmount: 320000,
      riskLevel: "LOW" as const,
      lastPaymentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

function createCustomerInvoiceSeeds(accountIds: string[]) {
  const now = Date.now();

  return [
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      accountId: accountIds[0],
      invoiceNumber: "SPA-2401",
      amount: 280000,
      issuedAt: new Date(now - 26 * 24 * 60 * 60 * 1000).toISOString(),
      dueAt: new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString(),
      status: "OPEN" as const,
      paidAt: null,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      accountId: accountIds[1],
      invoiceNumber: "SPB-1841",
      amount: 390000,
      issuedAt: new Date(now - 43 * 24 * 60 * 60 * 1000).toISOString(),
      dueAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: "OVERDUE" as const,
      paidAt: null,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      accountId: accountIds[2],
      invoiceNumber: "SPC-1024",
      amount: 175000,
      issuedAt: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
      dueAt: new Date(now + 13 * 24 * 60 * 60 * 1000).toISOString(),
      status: "PARTIAL" as const,
      paidAt: null,
    },
  ];
}

function createSeedDatabase(): Database {
  const plants = createPlantSeeds();
  const salesAgent = createUserSeed("SA1001", "Ravi Sharma", "SALES_AGENT", "password123", DEFAULT_PLANT_IDS[0]);
  const manager = createUserSeed("MG2001", "Anita Verma", "MANAGER", "password123", null);
  const accounting = createUserSeed("AC3001", "Karan Gupta", "ACCOUNTING", "password123", null);
  const batcher = createUserSeed("BA4001", "Suresh Naik", "BATCHER", "password123", DEFAULT_PLANT_IDS[0]);
  const mixDesignUser = createMixDesignUserSeed();
  const productionManager = createProductionManagerUserSeed();
  const now = nowIso();
  const today = toDateKey(now);
  const customerAccounts = createCustomerAccountSeeds();

  return {
    users: [salesAgent, manager, accounting, batcher, mixDesignUser, productionManager],
    authSessions: [],
    plants,
    workdaySessions: [],
    odometerReadings: [],
    siteVisits: [],
    leads: [],
    leadSites: [],
    approvalRequests: [],
    informalQuotationRequests: [],
    salesOrderRequests: [],
    reimbursementClaims: [],
    reimbursementAdjustments: [],
    tasks: [
      {
        id: randomUUID(),
        plantId: salesAgent.homePlantId ?? DEFAULT_PLANT_IDS[0],
        subject: "Collect dealer introduction",
        explanation: "Visit the newly added project lead and confirm the decision makers.",
        deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: "OPEN",
        assignedTo: salesAgent.id,
        assignedBy: manager.id,
      },
    ],
    helpRequests: [],
    targets: [
      {
        id: randomUUID(),
        userId: salesAgent.id,
        month: today.slice(0, 7),
        quantityTarget: 900,
      },
    ],
    auditLogs: [],
    fleetVehicles: createFleetSeed(),
    materialCostSnapshots: createMaterialCostSeeds(),
    priceBenchmarks: createPriceBenchmarkSeeds(),
    customerAccounts,
    customerInvoices: createCustomerInvoiceSeeds(customerAccounts.map((entry) => entry.id)),
    documentTemplates: [],
    mixDesigns: [],
    dispatchRecords: [],
    commissionVouchers: [],
    customerLedgerEntries: [],
    // MOD additions
    contactVerificationEvents: [],
    stakeholderMasters: [],
    odometerCorrections: [],
    quotationRevisions: [],
    finalApprovals: [],
  };
}

function buildStakeholdersFromLead(lead: Lead): StakeholderContact[] {
  const stakeholders: Array<StakeholderContact | null> = [
    lead.contractorName
      ? {
          label: getStakeholderLabel("CONTRACTOR"),
          role: "CONTRACTOR",
          name: lead.contractorName,
          phone: "",
        }
      : null,
    lead.builderName
      ? {
          label: getStakeholderLabel("OWNER_BUILDER"),
          role: "OWNER_BUILDER",
          name: lead.builderName,
          phone: "",
        }
      : null,
    lead.supervisorName
      ? {
          label: getStakeholderLabel("SITE_SUPERVISOR"),
          role: "SITE_SUPERVISOR",
          name: lead.supervisorName,
          phone: lead.supervisorPhone,
        }
      : null,
  ];

  return stakeholders.filter((entry): entry is StakeholderContact => entry !== null);
}

function buildLeadSiteFromLead(lead: Lead): LeadSite {
  const timestamp = lead.lastVisitedAt || nowIso();

  return {
    id: randomUUID(),
    leadId: lead.id,
    plantId: lead.plantId,
    siteName: lead.siteName,
    siteAddress: lead.siteAddress,
    latLng: lead.primarySiteLatLng ?? null,
    stakeholders: buildStakeholdersFromLead(lead),
    currentSupplier: lead.currentSupplier,
    expectedSupplyWindow: null,
    futureScope: lead.futureScope,
    currentConcreteGrade: lead.currentConcreteGrade,
    currentQuantityCum: lead.currentQuantityCum,
    score: lead.score,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastVisitedAt: timestamp,
  };
}

function buildLeadSiteFromVisit(visit: SiteVisit, lead: Lead): LeadSite {
  return {
    id: randomUUID(),
    leadId: lead.id,
    plantId: lead.plantId,
    siteName: visit.siteName,
    siteAddress: visit.siteAddress,
    latLng: visit.detectedLatLng ?? visit.latLng ?? null,
    stakeholders: visit.stakeholders,
    currentSupplier: visit.currentSupplier,
    expectedSupplyWindow: visit.expectedSupplyWindow ?? null,
    futureScope: visit.futureScope,
    currentConcreteGrade: visit.concreteGrade,
    currentQuantityCum: visit.quantityCum,
    score: visit.score,
    createdAt: visit.visitedAt,
    updatedAt: visit.visitedAt,
    lastVisitedAt: visit.visitedAt,
  };
}

function findMatchingLeadSite(database: Database, visit: SiteVisit) {
  return database.leadSites.find(
    (site) =>
      site.leadId === visit.leadId &&
      site.siteName.trim().toLowerCase() === visit.siteName.trim().toLowerCase() &&
      site.siteAddress.trim().toLowerCase() === visit.siteAddress.trim().toLowerCase(),
  );
}

function getFallbackPlantId(database: Database) {
  return database.plants[0]?.id ?? DEFAULT_PLANT_IDS[0];
}

function normalizeDatabase(rawDatabase: Database) {
  const database = rawDatabase as Database & Partial<Database>;

  database.plants ??= createPlantSeeds();
  database.plants.forEach((plant) => {
    plant.unitName ??= plant.name;
  });
  database.fleetVehicles ??= createFleetSeed();
  database.materialCostSnapshots ??= createMaterialCostSeeds();
  database.priceBenchmarks ??= createPriceBenchmarkSeeds();
  database.customerAccounts ??= createCustomerAccountSeeds();
  database.customerAccounts.forEach((account) => {
    account.odooPartnerId ??= null;
    account.activeOrderExposure ??= 0;
    account.overdueAmount ??= 0;
    account.creditApprovalHistory ??= [];
    if (account.riskLevel !== "LOW" && account.riskLevel !== "MEDIUM" && account.riskLevel !== "HIGH" && account.riskLevel !== "BLOCKED") {
      account.riskLevel = "LOW";
    }
  });
  database.customerInvoices ??= createCustomerInvoiceSeeds(database.customerAccounts.map((entry) => entry.id));
  database.documentTemplates ??= [];
  database.users ??= [];
  if (!database.users.some((entry) => entry.employeeId === "MD5001")) {
    database.users.push(createMixDesignUserSeed());
  }
  if (!database.users.some((entry) => entry.employeeId === "PM6001")) {
    database.users.push(createProductionManagerUserSeed());
  }
  const fallbackPlantId = getFallbackPlantId(database as Database);

  (database.users ?? []).forEach((user) => {
    user.email ??= null;
    user.lastReimbursementClosedDate ??= null;
    if (user.role === "MIX_DESIGN" && !user.homePlantId) {
      user.homePlantId = fallbackPlantId;
    }
  });

  const salesAgents = (database.users ?? []).filter((entry) => entry.role === "SALES_AGENT");
  salesAgents.forEach((user, index) => {
    user.homePlantId ??= database.plants[index % Math.max(database.plants.length, 1)]?.id ?? fallbackPlantId;
  });

  (database.users ?? [])
    .filter((entry) => entry.role !== "SALES_AGENT")
    .forEach((user) => {
      if (user.homePlantId === undefined) {
        user.homePlantId = null;
      }
    });

  (database.workdaySessions ?? []).forEach((session) => {
    session.plantId ??= database.users.find((entry) => entry.id === session.userId)?.homePlantId ?? fallbackPlantId;
  });

  // MOD-001 through MOD-014: Normalize odometer reading fields
  (database.odometerReadings ?? []).forEach((reading) => {
    // MOD-001: Manual reading / OCR comparison / discard flow
    reading.agentEnteredReading ??= null;
    reading.readingDifference ??= null;
    reading.managerFinalReading ??= reading.verifiedBy ? reading.finalValue : null;
    reading.discardedAt ??= null;
    reading.discardedBy ??= null;
    reading.discardReason ??= null;
    reading.discardNote ??= null;
    reading.replacedByReadingId ??= null;
    reading.replacesReadingId ??= null;
    // MOD-002: GPS watermark metadata
    reading.gpsWatermarkText ??= null;
    reading.gpsCapturedDate ??= null;
    reading.gpsCapturedLocation ??= null;
    reading.gpsAccuracy ??= null;
    // MOD-003: Upload metadata
    reading.uploadedBy ??= null;
    reading.uploadDateTime ??= reading.capturedAt;
    reading.uploadSource ??= "LIVE";
    reading.fileSizeBytes ??= null;
    // MOD-004: Duplicate image detection
    reading.imageHash ??= null;
    reading.duplicateOfReadingId ??= null;
    reading.duplicateWarningAcknowledgedBy ??= null;
    reading.duplicateWarningAcknowledgedAt ??= null;
    // MOD-005: Active reading flag
    reading.isActiveReading ??= reading.status !== "DISCARDED";
    // MOD-010: Correction versioning
    reading.correctionVersion ??= 1;
    reading.previousReadingValue ??= null;
    reading.correctionReason ??= null;
    reading.correctionApprovedBy ??= null;
    reading.correctionApprovedAt ??= null;
    // MOD-011: Watermark status
    reading.hasGpsWatermark ??= Boolean(reading.gpsWatermarkText || reading.gpsCapturedDate);
    reading.watermarkStatus ??= reading.hasGpsWatermark ? "PRESENT" : "MISSING";
    // MOD-012: Continuity check
    reading.continuityStatus ??= "OK";
    reading.continuityNote ??= null;
    // MOD-013: Manager review
    reading.reviewReason ??= null;
    reading.managerReviewRequiredAt ??= reading.status === "MANUAL_REVIEW_REQUIRED" ? reading.capturedAt : null;
    reading.managerReviewedAt ??= reading.status === "MANUAL_VERIFIED" && reading.verifiedBy ? reading.capturedAt : null;
    reading.managerRemark ??= reading.verificationNote;
    reading.lockStatus ??= "OPEN";
    reading.reopenedForCorrectionBy ??= null;
    reading.reopenedForCorrectionAt ??= null;
    reading.reopenedForCorrectionReason ??= null;
  });

  (database.leads ?? []).forEach((lead) => {
    lead.plantId ??= database.users.find((entry) => entry.id === lead.agentId)?.homePlantId ?? fallbackPlantId;
  });

  database.leadSites ??= [];
  (database.leads ?? []).forEach((lead) => {
    const existingSites = database.leadSites.filter((site) => site.leadId === lead.id);

    if (!existingSites.length) {
      database.leadSites.push(buildLeadSiteFromLead(lead));
    }
  });

  (database.siteVisits ?? []).forEach((visit) => {
    visit.plantId ??=
      database.leads.find((entry) => entry.id === visit.leadId)?.plantId ??
      database.workdaySessions.find((entry) => entry.id === visit.sessionId)?.plantId ??
      fallbackPlantId;
    visit.siteId ??=
      findMatchingLeadSite(database, visit)?.id ??
      (() => {
        const lead = database.leads.find((entry) => entry.id === visit.leadId);

        if (!lead) {
          return null;
        }

        const createdSite = buildLeadSiteFromVisit(visit, lead);
        database.leadSites.push(createdSite);
        return createdSite.id;
      })();
    visit.detectedLatLng ??= visit.latLng ?? null;
    visit.expectedSupplyWindow ??= null;
    visit.remarksText ??= "";
    visit.remarksVoiceNoteUrl ??= null;
    visit.photoWatermarkAddress ??= visit.siteAddress;
    visit.locationVerificationStatus ??= "NOT_APPLICABLE";
    visit.locationVerificationDistanceMeters ??= null;
    // MOD-015: Captured date mapping
    visit.capturedDate ??= visit.visitedAt ? toDateKey(visit.visitedAt) : null;
    visit.uploadDate ??= null;
    visit.isLateSync ??= false;
    // MOD-016: GPS review status
    visit.gpsReviewStatus ??= visit.latLng || visit.detectedLatLng ? "AUTO_APPROVED" : "PENDING_REVIEW";
    visit.gpsReviewNote ??= null;
    visit.gpsReviewedBy ??= null;
    visit.gpsReviewedAt ??= null;
    // MOD-017: Active visit tracking
    visit.activeVisitStatus ??= "COMPLETED";
    visit.visitStartedAt ??= visit.visitedAt;
    visit.visitCompletedAt ??= visit.visitedAt;
    visit.cancelledAt ??= null;
    visit.cancelReason ??= null;
    // MOD-018: Duplicate detection
    visit.duplicateMatchStrength ??= "NONE";
    visit.duplicateMatchedSiteId ??= null;
    visit.duplicateOverrideReason ??= null;
    // MOD-018: Productivity tag
    visit.productivityTag ??= "PRODUCTIVE";
    visit.arrivalPhotoHash ??= null;
    visit.isPhotoReused ??= false;
    // MOD-019: Edit history
    visit.editHistory ??= [];
    // MOD-021: Contact presence
    visit.contactPresenceStatus ??= visit.stakeholders.some(s => s.role === "FOUND_NO_ONE") ? "FOUND_NO_ONE" : "PRESENT";
    // MOD-018: Follow-up task
    visit.followUpTaskId ??= null;
    visit.managerReviewRequired ??= visit.gpsReviewStatus === "PENDING_REVIEW" || visit.duplicateMatchStrength === "STRONG";
    visit.managerReviewReason ??= null;
  });

  (database.leadSites ?? []).forEach((site) => {
    site.plantId ??=
      database.leads.find((entry) => entry.id === site.leadId)?.plantId ??
      fallbackPlantId;
    site.stakeholders ??= [];
    site.expectedSupplyWindow ??= null;
    site.currentSupplier ??= "";
    site.futureScope ??= "";
    site.currentConcreteGrade ??= "";
    site.currentQuantityCum ??= 0;
    site.score ??= 5;
    site.createdAt ??= nowIso();
    site.updatedAt ??= site.createdAt;
    site.lastVisitedAt ??= site.updatedAt;
    site.latLng ??= null;
    // MOD-022: Site-level status
    site.siteStatus ??= "ACTIVE";
    site.closureReason ??= null;
    site.closureRemarks ??= null;
    site.closedBy ??= null;
    site.closedAt ??= null;
    site.closureApprovedBy ??= null;
    site.closureApprovedAt ??= null;
    site.reopenedBy ??= null;
    site.reopenedAt ??= null;
    site.reopenReason ??= null;
    site.mergedIntoSiteId ??= null;
    // MOD-020: Directions
    site.directionsLastUsedAt ??= null;
    site.directionsUsageCount ??= 0;
    site.lastDirectionsUsedBy ??= null;
  });

  (database.leads ?? []).forEach((lead) => {
    const sites = database.leadSites
      .filter((entry) => entry.leadId === lead.id)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    const primarySite = sites[0] ?? null;

    lead.primarySiteId = primarySite?.id ?? null;
    lead.primarySiteLatLng = primarySite?.latLng ?? null;
    lead.siteCount = sites.length;
    // MOD-019/022: Lead closure
    lead.closureReason ??= null;
    lead.closureRemarks ??= null;
    lead.closedBy ??= null;
    lead.closedAt ??= null;
    lead.closureApprovedBy ??= null;
    lead.closureApprovedAt ??= null;
    lead.reopenedBy ??= null;
    lead.reopenedAt ??= null;
    lead.reopenReason ??= null;
    lead.closureStatus ??= lead.stage === "DEAD" || lead.stage === "LOST" ? "APPROVED_CLOSED" : "OPEN";
    lead.closureRequestedBy ??= null;
    lead.closureRequestedAt ??= null;
  });

  (database.approvalRequests ?? []).forEach((approval) => {
    approval.plantId ??=
      database.leads.find((entry) => entry.id === approval.leadId)?.plantId ??
      database.users.find((entry) => entry.id === approval.createdBy)?.homePlantId ??
      fallbackPlantId;
    const linkedLead = database.leads.find((entry) => entry.id === approval.leadId);
    const linkedSite =
      (approval.siteId ? database.leadSites.find((entry) => entry.id === approval.siteId) : null) ??
      database.leadSites.find((entry) => entry.id === linkedLead?.primarySiteId) ??
      database.leadSites.find((entry) => entry.leadId === approval.leadId) ??
      null;

    approval.siteId ??= linkedSite?.id ?? null;
    approval.siteName ??= linkedSite?.siteName ?? linkedLead?.siteName ?? approval.customerName;
    approval.siteAddress ??= linkedSite?.siteAddress ?? linkedLead?.siteAddress ?? "";
    approval.items = getApprovalItems(approval).map((item, index) => ({
      ...item,
      id: item.id || `${approval.id}-item-${index + 1}`,
    }));
    approval.mixDesignType ??= "DESIGN_MIX";
    approval.oneWayDistanceKm ??= approval.distanceFromPlantKm ?? 0;
    approval.distanceFromPlantKm = approval.oneWayDistanceKm;
    approval.paymentType ??= "NORMAL";
    approval.paymentTerms = normalizePaymentTerms(approval.paymentType, approval.paymentTerms ?? "ADVANCE");
    approval.grade ??= approval.items[0]?.grade ?? "";
    approval.quotedPrice ??= approval.items[0]?.quotedPrice ?? 0;
    approval.linkedQuotationId ??= null;
    approval.linkedQuotationRevisionId ??= null;
    approval.quotationValidityStatus ??= "NOT_LINKED";
    approval.directFinalApprovalReason ??= null;
    approval.routeFeasibilityStatus ??= "NOT_CHECKED";
    approval.variationNotes ??= null;
    approval.minimumRatePerCum ??= null;
    approval.rateValidationStatus ??= "NOT_CHECKED";
    approval.finalApprovalRecordId ??= null;
  });

  database.informalQuotationRequests ??= [];
  (database.informalQuotationRequests ?? []).forEach((request) => {
    const linkedLead = database.leads.find((entry) => entry.id === request.leadId);
    const linkedSite = database.leadSites.find((entry) => entry.id === request.siteId);
    request.plantId ??= linkedSite?.plantId ?? linkedLead?.plantId ?? fallbackPlantId;
    request.customerName ??= linkedLead?.siteName ?? request.siteName ?? "";
    request.siteName ??= linkedSite?.siteName ?? linkedLead?.siteName ?? "";
    request.siteAddress ??= linkedSite?.siteAddress ?? linkedLead?.siteAddress ?? "";
    request.stakeholderLabel ??= request.stakeholderRole ?? "Stakeholder";
    request.stakeholderPhone ??= "";
    request.billingAddress ??= request.siteAddress || linkedSite?.siteAddress || linkedLead?.siteAddress || "";
    request.whatsappNumber ??= request.stakeholderPhone;
    request.priceType ??= "GST_INCLUSIVE";
    request.paymentType = request.priceType === "NON_GST" ? "ADVANCE" : request.paymentType ?? "ADVANCE";
    request.creditDays = request.paymentType === "CREDIT" ? request.creditDays ?? null : null;
    request.items = (request.items ?? []).map((item, index) => ({
      id: item.id || (request.id ? `${request.id}-item-${index + 1}` : randomUUID()),
      grade: item.grade ?? "",
      quantityCum: Number(item.quantityCum ?? 0),
      mixDesignType: item.mixDesignType ?? "NOMINAL_MIX",
      mixRequirement: item.mixRequirement ?? (item.mixDesignType === "DESIGN_MIX" ? "" : "Nominal mix"),
      pricePerCum: Number(item.pricePerCum ?? 0),
    }));
    request.status ??= "PENDING";
    request.decisionNote ??= null;
    request.decidedBy ??= null;
    request.decidedAt ??= null;
    request.quotationRef ??= null;
    request.quotationPdfUrl ??= null;
    request.quotationPdfS3Key ??= null;
    request.pdfStatus ??= request.quotationPdfUrl ? "GENERATED" : "NOT_GENERATED";
    request.pdfGeneratedAt ??= null;
    request.pdfError ??= null;
    request.emailStatus ??= "NOT_SENT";
    request.emailSentAt ??= null;
    request.emailError ??= null;
    request.emailTo ??= null;
    request.emailCc ??= [];
    request.whatsappStatus ??= "NOT_SENT";
    request.whatsappSentAt ??= null;
    request.whatsappError ??= null;
    // MOD-024: Pre-eligibility & validation
    request.eligibilityChecked ??= false;
    request.rateValidationStatus ??= "NOT_CHECKED";
    request.rateValidationNote ??= null;
    request.minimumRatePerCum ??= null;
    request.duplicateOfQuotationId ??= null;
    // MOD-025: Versioning & correction
    request.revisionNumber ??= 1;
    request.previousRevisionId ??= null;
    request.latestRevisionId ??= null;
    request.validityDate ??= null;
    request.isExpired ??= false;
    request.correctionStatus ??= "NONE";
    request.correctionReason ??= null;
    request.correctionRequestedBy ??= null;
    request.correctionRequestedAt ??= null;
    request.creditApprovalRequired ??= request.paymentType === "CREDIT";
    request.creditApprovedBy ??= null;
    request.creditApprovedAt ??= null;
    request.deliveryChannels ??= [];
  });

  database.salesOrderRequests ??= [];
  (database.salesOrderRequests ?? []).forEach((request) => {
    const legacyStatus = request.status as string;
    request.plantId ??=
      database.leads.find((entry) => entry.id === request.leadId)?.plantId ??
      database.users.find((entry) => entry.id === request.createdBy)?.homePlantId ??
      fallbackPlantId;
    const linkedLead = database.leads.find((entry) => entry.id === request.leadId);
    const linkedApproval = request.approvalRequestId
      ? database.approvalRequests.find((entry) => entry.id === request.approvalRequestId)
      : null;
    const linkedSite =
      (request.siteId ? database.leadSites.find((entry) => entry.id === request.siteId) : null) ??
      (linkedApproval?.siteId ? database.leadSites.find((entry) => entry.id === linkedApproval.siteId) : null) ??
      database.leadSites.find((entry) => entry.leadId === request.leadId) ??
      null;

    request.siteId ??= linkedSite?.id ?? linkedApproval?.siteId ?? null;
    request.siteName ??= linkedSite?.siteName ?? linkedApproval?.siteName ?? linkedLead?.siteName ?? request.customerName;
    request.approvedPrice ??= linkedApproval?.quotedPrice ?? 0;
    request.amount ??= Math.round((request.quantity * request.approvedPrice + (request.pumpRequired && request.quantity < 30 ? 8000 : 0)) * 100) / 100;
    request.oneWayDistanceKm ??= linkedApproval?.oneWayDistanceKm ?? linkedApproval?.distanceFromPlantKm ?? 0;
    request.trafficCount ??= linkedApproval?.trafficCount ?? 0;
    request.paymentType ??= linkedApproval?.paymentType ?? "NORMAL";
    request.paymentTerms = normalizePaymentTerms(request.paymentType, request.paymentTerms ?? linkedApproval?.paymentTerms ?? "ADVANCE");
    request.mixDesignType ??= linkedApproval?.mixDesignType ?? "DESIGN_MIX";
    // RMC Phase 1: initialize new fields
    request.mixDesignId ??= null;
    request.remainingQuantity ??= request.quantity;
    request.slump ??= "";
    request.receiverName ??= "";
    request.receiverPhone ??= "";
    request.poDocumentUrl ??= null;
    request.pdcDocumentUrl ??= null;
    request.gstin = request.gstin ? normalizeGstin(request.gstin) : null;
    request.gstPan ??= request.gstin ? extractPanFromGstin(request.gstin) : null;
    request.gstLegalName ??= null;
    request.gstBillingAddress ??= null;
    request.gstCertificateUrl ??= null;
    request.gstVerificationStatus ??= request.gstin || request.gstCertificateUrl ? "PENDING_ACCOUNTS" : "NOT_PROVIDED";
    request.gstVerifiedBy ??= null;
    request.gstVerifiedAt ??= null;
    request.gstVerificationNote ??= null;
    request.agentGstConfirmedAt ??= null;
    request.odooPartnerId ??= null;
    request.odooLedgerSyncStatus ??= request.gstin && request.gstVerificationStatus === "VERIFIED" ? "PENDING" : "NOT_REQUIRED";
    request.odooLedgerSyncError ??= null;
    request.odooLedgerSyncedAt ??= null;
    request.odooSaleOrderId ??= null;
    request.odooSaleOrderName ??= null;
    request.odooSalesOrderSyncStatus ??= request.gstin && request.gstVerificationStatus === "VERIFIED" ? "PENDING" : "NOT_REQUIRED";
    request.odooSalesOrderSyncError ??= null;
    request.odooSalesOrderSyncedAt ??= null;
    request.shippingAddress ??= request.siteAddress ?? linkedSite?.siteAddress ?? "";
    request.plannedCastingType ??= normalizeCastingType(linkedApproval?.castingType ?? (request.pumpRequired ? "Pump" : "Dump"));
    request.pumpDispatchStatus ??= "NOT_DISPATCHED";
    request.actualCastingType ??= getActualCastingType(request.pumpDispatchStatus);
    request.pumpDispatchedBy ??= null;
    request.pumpDispatchedAt ??= null;
    request.pumpVehicleNumber ??= null;
    request.pumpOperatorName ??= null;
    request.pumpOperatorPhone ??= null;
    request.pumpDispatchNote ??= null;
    request.paymentReceivedConfirmed ??= request.paymentType === "NORMAL";
    request.financeChecklist ??= null;
    request.manualPaymentVerification ??= null;
    request.ledgerDecisionStatus ??= request.gstin ? "GST_CLIENT_ODOO_LEDGER" : "NON_GST_INTERNAL_LEDGER";
    request.linkedLedgerCustomerName ??= null;
    request.duplicateLedgerConfidence ??= null;
    request.poPdcExceptionStatus ??= "NOT_REQUIRED";
    request.poPdcExceptionReason ??= null;
    request.poPdcExceptionRequestedBy ??= null;
    request.poPdcExceptionRequestedAt ??= null;
    request.poPdcExceptionDecidedBy ??= null;
    request.poPdcExceptionDecidedAt ??= null;
    request.creditRiskCategory ??= "LOW";
    request.creditLimitAmount ??= null;
    request.creditPeriodDays ??= null;
    request.creditOverrideApprovedBy ??= null;
    request.creditOverrideApprovedAt ??= null;
    request.creditOverrideExpiresAt ??= null;
    request.creditOverrideAmountLimit ??= null;
    request.creditOverrideReason ??= null;
    request.salesOrderFinalChecklist ??= null;
    request.salesOrderPreviewConfirmedBy ??= null;
    request.salesOrderPreviewConfirmedAt ??= null;
    request.salesOrderPreviewHash ??= null;
    request.salesOrderCopyUrl ??= null;
    request.financeReviewedBy ??= null;
    request.financeReviewedAt ??= null;
    request.financeNote ??= null;
    request.scheduleDateTime ??= null;
    request.scheduleReceiverName ??= null;
    request.scheduleReceiverPhone ??= null;
    request.scheduleRequestedAt ??= null;
    request.scheduleDecidedBy ??= null;
    request.scheduleDecidedAt ??= null;
    request.scheduleNote ??= null;
    request.status =
      legacyStatus === "PENDING_FINANCE" ||
      legacyStatus === "FINANCE_VERIFIED" ||
      legacyStatus === "FINANCE_REJECTED" ||
      legacyStatus === "SCHEDULE_PENDING" ||
      legacyStatus === "SCHEDULE_APPROVED" ||
      legacyStatus === "SCHEDULE_REJECTED"
        ? request.status
        : legacyStatus === "APPROVED_FOR_ORDER"
          ? "FINANCE_VERIFIED"
          : legacyStatus === "REJECTED"
            ? "FINANCE_REJECTED"
            : "PENDING_FINANCE";
    // MOD-027: Sales Order Request improvements
    request.sorNumber ??= null;
    request.isDuplicateRequest ??= false;
    request.duplicateOfOrderId ??= null;
    request.financeRejectionReason ??= null;
    request.financeRejectionHistory ??= [];
    request.correctionResubmittedAt ??= null;
    request.correctionResubmittedBy ??= null;
    request.odooPreflight ??= "PENDING";
    request.odooPreflightError ??= null;
    request.preliminaryMixDesignStatus ??= "NOT_REQUIRED";
    request.postFinanceLocked ??= request.status === "FINANCE_VERIFIED" || request.status === "SCHEDULE_APPROVED";
    request.postFinanceLockedAt ??= request.postFinanceLocked && request.financeReviewedAt ? request.financeReviewedAt : null;
    // MOD-028: Sales Order Management
    request.internalReference ??= null;
    request.revisionType ??= "NEW";
    request.deliveryDateValidated ??= false;
    request.isUrgent ??= request.priority === "URGENT";
    request.urgentReason ??= null;
    request.receiverPhoneValidated ??= false;
    request.plantLockedAt ??= null;
    request.plantChangeApprovedBy ??= null;
    request.plantChangeReason ??= null;
    request.orderQuantity ??= request.quantity;
    request.attachmentVersions ??= [];
    // MOD-029: Order continuity & fulfillment
    request.fulfillmentStatus ??= request.remainingQuantity <= 0 ? "FULLY_FULFILLED" : request.remainingQuantity < request.quantity ? "PARTIALLY_FULFILLED" : "OPEN";
    request.isOpenVolume ??= false;
    request.parentOrderId ??= null;
    request.childOrderIds ??= [];
    request.cancelledAt ??= null;
    request.cancelledBy ??= null;
    request.cancellationReason ??= null;
    request.editHistory ??= [];
  });

  // Normalize new RMC collections (ensure they exist)
  database.mixDesigns ??= [];
  database.dispatchRecords ??= [];
  database.dispatchRecords.forEach((record) => {
    const linkedOrder = database.salesOrderRequests.find((entry) => entry.id === record.orderId);
    record.driverPhone ??= "";
    record.challanNumber ??= `CH/${record.id.slice(0, 8).toUpperCase()}`;
    record.documentMode ??= "CHALLAN_ONLY";
    record.invoiceStatus ??= record.documentMode === "CHALLAN_ONLY" ? "NOT_REQUESTED" : "REQUESTED";
    record.invoiceNumber ??= null;
    record.eInvoiceIrn ??= null;
    record.actualCastingType ??= linkedOrder?.actualCastingType ?? "DUMP";
    record.gstin ??= linkedOrder?.gstin ?? null;
    record.pumpDispatchStatus ??= linkedOrder?.pumpDispatchStatus ?? "NOT_DISPATCHED";
  });
  database.commissionVouchers ??= [];
  database.customerLedgerEntries ??= [];
  database.documentTemplates ??= [];

  // MOD additions — normalize new collections
  database.contactVerificationEvents ??= [];
  database.stakeholderMasters ??= [];
  database.stakeholderMasters.forEach((stakeholder) => {
    stakeholder.lastCallVerificationAt ??= null;
    stakeholder.lastWhatsappVerificationAt ??= null;
    stakeholder.lastVerificationError ??= null;
  });
  database.odometerCorrections ??= [];
  database.quotationRevisions ??= [];
  database.finalApprovals ??= [];

  database.reimbursementClaims ??= [];
  (database.reimbursementClaims ?? []).forEach((claim) => {
    if (claim.status === "REQUESTED") {
      claim.status = "CLAIM_REQUESTED";
    }
    if (claim.status === "REJECTED") {
      claim.status = "PAYMENT_REJECTED";
    }
    claim.requestedBy ??= claim.agentId;
    claim.approvedAmount ??= claim.totalAmount;
    claim.paidAmount ??= claim.status === "PAID" ? claim.totalAmount : 0;
    claim.balanceAmount ??= Math.max(0, claim.totalAmount - claim.paidAmount);
    claim.outstandingAmount ??= claim.balanceAmount;
    claim.managerVerifiedBy ??= null;
    claim.managerVerifiedAt ??= null;
    claim.managerVerificationNote ??= null;
    claim.accountsPaymentPendingAt ??= null;
    claim.cashVoucherNumber ??= null;
    claim.cashVoucherCreatedAt ??= null;
    claim.cashVoucherCreatedBy ??= null;
    claim.cashVoucherAmount ??= null;
    claim.otpCode ??= null;
    claim.otpSentAt ??= null;
    claim.otpExpiresAt ??= null;
    claim.otpVerifiedAt ??= null;
    claim.agentReceiptConfirmedAt ??= claim.status === "PAID" ? claim.otpVerifiedAt ?? claim.paidAt : null;
    claim.paidAt ??= null;
    claim.paidBy ??= null;
    claim.rejectedAt ??= null;
    claim.rejectedBy ??= null;
    claim.accountantRemarks ??= null;
    claim.paymentMode ??= null;
    claim.paymentHistory ??= claim.status === "PAID" && claim.paidAt && claim.paidBy
      ? [
          {
            id: randomUUID(),
            amount: claim.totalAmount,
            balanceAmount: 0,
            outstandingAmount: 0,
            paymentMode: "CASH",
            cashVoucherNumber: claim.cashVoucherNumber ?? null,
            referenceNumber: null,
            remarks: claim.note ?? "Legacy paid reimbursement normalized.",
            paidBy: claim.paidBy,
            paidAt: claim.paidAt,
          },
        ]
      : [];
    claim.note ??= null;
  });

  (database.tasks ?? []).forEach((task) => {
    task.plantId ??= database.users.find((entry) => entry.id === task.assignedTo)?.homePlantId ?? fallbackPlantId;
  });

  (database.helpRequests ?? []).forEach((request) => {
    request.plantId ??= database.users.find((entry) => entry.id === request.agentId)?.homePlantId ?? fallbackPlantId;
  });

  return database as Database;
}

async function ensureDatabaseFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dbPath, "utf-8");
  } catch {
    await writeFile(dbPath, JSON.stringify(createSeedDatabase(), null, 2), "utf-8");
  }
}

function getFirebaseRootPath() {
  return process.env.FIREBASE_APP_STATE_COLLECTION?.trim() || "app_state";
}

function getFirebaseLegacyDocId() {
  return process.env.FIREBASE_APP_STATE_DOC?.trim() || "main";
}

const COLLECTION_NAMES = [
  "users",
  "authSessions",
  "plants",
  "workdaySessions",
  "odometerReadings",
  "siteVisits",
  "leads",
  "leadSites",
  "approvalRequests",
  "informalQuotationRequests",
  "salesOrderRequests",
  "reimbursementClaims",
  "reimbursementAdjustments",
  "tasks",
  "helpRequests",
  "targets",
  "auditLogs",
  "fleetVehicles",
  "materialCostSnapshots",
  "priceBenchmarks",
  "customerAccounts",
  "customerInvoices",
  "documentTemplates",
  // RMC Phase 1
  "mixDesigns",
  "dispatchRecords",
  "commissionVouchers",
  "customerLedgerEntries",
  // MOD additions
  "contactVerificationEvents",
  "stakeholderMasters",
  "odometerCorrections",
  "quotationRevisions",
  "finalApprovals",
] as const;

const SINGLETON_DATABASE_KEYS = [] as const;

// Compile-time safety: if a new Database collection is added but not listed above,
// TypeScript fails the build so production never misses Firestore sync wiring.
type CollectionNameCoverage = (typeof COLLECTION_NAMES)[number];
type SingletonDatabaseKey = (typeof SINGLETON_DATABASE_KEYS)[number];
type MissingCollectionNames = Exclude<keyof Database, CollectionNameCoverage | SingletonDatabaseKey>;
type ExtraCollectionNames = Exclude<CollectionNameCoverage, keyof Database>;
type EnsureNever<T extends never> = T;
type _CollectionNamesMustCoverAllDatabaseKeys = EnsureNever<MissingCollectionNames>;
type _CollectionNamesMustNotContainUnknownKeys = EnsureNever<ExtraCollectionNames>;

export type DatabaseCollectionName = (typeof COLLECTION_NAMES)[number];
type DatabaseCollectionItem<K extends DatabaseCollectionName> = Database[K] extends Array<infer Item> ? Item : never;

interface FirestoreCollectionFilter {
  field: string;
  op: FirebaseFirestore.WhereFilterOp;
  value: unknown;
}

interface FirestoreCollectionOrder {
  field: string;
  direction?: FirebaseFirestore.OrderByDirection;
}

interface FirestoreCollectionReadOptions {
  filters?: FirestoreCollectionFilter[];
  orderBy?: FirestoreCollectionOrder[];
  limit?: number;
}

let firebaseUserBootstrapChecked = false;

function getCollectionRef(firestore: FirebaseFirestore.Firestore, collectionName: DatabaseCollectionName) {
  return firestore.collection(getFirebaseRootPath()).doc("collections").collection(collectionName);
}

function getSingletonRef(firestore: FirebaseFirestore.Firestore, singletonName: SingletonDatabaseKey) {
  return firestore.collection(getFirebaseRootPath()).doc("singletons").collection("values").doc(singletonName);
}

async function readFirebaseCollection<K extends DatabaseCollectionName>(
  collectionName: K,
  options: FirestoreCollectionReadOptions = {},
): Promise<Array<DatabaseCollectionItem<K>>> {
  const firestore = await getFirebaseFirestore();
  let query: FirebaseFirestore.Query = getCollectionRef(firestore, collectionName);

  for (const filter of options.filters ?? []) {
    query = query.where(filter.field, filter.op, filter.value);
  }

  for (const order of options.orderBy ?? []) {
    query = query.orderBy(order.field, order.direction ?? "asc");
  }

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as DatabaseCollectionItem<K>);
}

export async function readCollection<K extends DatabaseCollectionName>(
  collectionName: K,
  options: FirestoreCollectionReadOptions = {},
): Promise<Array<DatabaseCollectionItem<K>>> {
  if (hasFirebaseCredentialShape()) {
    try {
      let items = await readFirebaseCollection(collectionName, options);

      if (collectionName === "users" && items.length === 0 && !firebaseUserBootstrapChecked) {
        const database = await ensureFirebaseCollections();
        setDatabaseReadCache(database);
        firebaseUserBootstrapChecked = true;
        items = await readFirebaseCollection(collectionName, options);
      }

      return items;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Firebase collection read failed (${collectionName}): ${message}`);

      if (!canUseLocalDatabaseFallback()) {
        throw new Error(`Firebase collection read failed (${collectionName}): ${message}`);
      }
    }
  }

  const database = await readDatabase();
  return [...((database[collectionName] || []) as Array<DatabaseCollectionItem<K>>)];
}

export async function readCollectionByFieldValues<K extends DatabaseCollectionName>(
  collectionName: K,
  field: string,
  values: string[],
): Promise<Array<DatabaseCollectionItem<K>>> {
  const uniqueValues = [...new Set(values.filter(Boolean))];

  if (!uniqueValues.length) {
    return [];
  }

  const chunks: string[][] = [];
  for (let index = 0; index < uniqueValues.length; index += 30) {
    chunks.push(uniqueValues.slice(index, index + 30));
  }

  const chunkResults = await Promise.all(
    chunks.map((chunk) =>
      readCollection(collectionName, {
        filters: [{ field, op: "in", value: chunk }],
      }),
    ),
  );
  const byId = new Map<string, DatabaseCollectionItem<K>>();

  for (const item of chunkResults.flat()) {
    const id = (item as { id?: string }).id;
    byId.set(id || `${field}:${byId.size}`, item);
  }

  return [...byId.values()];
}

export async function upsertCollectionItem<K extends DatabaseCollectionName>(
  collectionName: K,
  item: DatabaseCollectionItem<K>,
) {
  const itemId = (item as { id?: string }).id;

  if (!itemId) {
    throw new Error(`Cannot upsert ${collectionName} item without an id.`);
  }

  if (hasFirebaseCredentialShape()) {
    try {
      const firestore = await getFirebaseFirestore();
      await getCollectionRef(firestore, collectionName).doc(itemId).set(sanitizeFirestoreValue(item) as FirebaseFirestore.DocumentData);
      clearDatabaseReadCache();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Firebase item upsert failed (${collectionName}/${itemId}): ${message}`);

      if (!canUseLocalDatabaseFallback()) {
        throw new Error(`Firebase item upsert failed (${collectionName}/${itemId}): ${message}`);
      }
    }
  }

  await updateDatabase((database) => {
    const list = database[collectionName] as Array<DatabaseCollectionItem<K>>;
    const index = list.findIndex((entry) => (entry as { id?: string }).id === itemId);

    if (index >= 0) {
      list[index] = item;
    } else {
      list.push(item);
    }
  });
}

export async function patchCollectionItem<K extends DatabaseCollectionName>(
  collectionName: K,
  itemId: string,
  patch: Partial<DatabaseCollectionItem<K>>,
) {
  if (hasFirebaseCredentialShape()) {
    try {
      const firestore = await getFirebaseFirestore();
      await getCollectionRef(firestore, collectionName).doc(itemId).set(sanitizeFirestoreValue(patch), { merge: true });
      clearDatabaseReadCache();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Firebase item patch failed (${collectionName}/${itemId}): ${message}`);

      if (!canUseLocalDatabaseFallback()) {
        throw new Error(`Firebase item patch failed (${collectionName}/${itemId}): ${message}`);
      }
    }
  }

  await updateDatabase((database) => {
    const list = database[collectionName] as Array<DatabaseCollectionItem<K>>;
    const item = list.find((entry) => (entry as { id?: string }).id === itemId);

    if (!item) {
      throw new Error(`${collectionName} item not found.`);
    }

    Object.assign(item as object, patch);
  });
}

export async function deleteCollectionItem<K extends DatabaseCollectionName>(collectionName: K, itemId: string) {
  if (hasFirebaseCredentialShape()) {
    try {
      const firestore = await getFirebaseFirestore();
      await getCollectionRef(firestore, collectionName).doc(itemId).delete();
      clearDatabaseReadCache();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Firebase item delete failed (${collectionName}/${itemId}): ${message}`);

      if (!canUseLocalDatabaseFallback()) {
        throw new Error(`Firebase item delete failed (${collectionName}/${itemId}): ${message}`);
      }
    }
  }

  await updateDatabase((database) => {
    const list = database[collectionName] as Array<DatabaseCollectionItem<K>>;
    const index = list.findIndex((entry) => (entry as { id?: string }).id === itemId);

    if (index >= 0) {
      list.splice(index, 1);
    }
  });
}

async function syncAllToFirebase(database: Database) {
  const firestore = await getFirebaseFirestore();
  const rootCollection = getFirebaseRootPath();
  let batch = firestore.batch();
  let opCount = 0;

  for (const collectionName of COLLECTION_NAMES) {
    const list = (database[collectionName as keyof Database] || []) as any[];
    for (const item of list) {
      if (item.id) {
        const ref = firestore.collection(rootCollection).doc("collections").collection(collectionName).doc(item.id);
        batch.set(ref, sanitizeFirestoreValue(item));
        opCount++;

        if (opCount >= 490) {
          await commitFirebaseBatch(batch, `sync ${collectionName}/${item.id}`);
          batch = firestore.batch(); // start a fresh batch after every commit
          opCount = 0;
        }
      }
    }
  }

  for (const singletonName of SINGLETON_DATABASE_KEYS) {
    const value = database[singletonName];
    if (value !== undefined) {
      batch.set(getSingletonRef(firestore, singletonName), sanitizeFirestoreValue(value));
      opCount++;

      if (opCount >= 490) {
        await commitFirebaseBatch(batch, `sync ${singletonName}`);
        batch = firestore.batch();
        opCount = 0;
      }
    }
  }

  if (opCount > 0) {
    await commitFirebaseBatch(batch, "sync final batch");
  }
}

async function commitFirebaseBatch(batch: FirebaseFirestore.WriteBatch, context: string) {
  try {
    await batch.commit();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${context}: ${message}`);
  }
}

function sanitizeFirestoreValue<T>(value: T): T {
  if (value === undefined) {
    return undefined as T;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : sanitizeFirestoreValue(entry))) as T;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      sanitized[key] = sanitizeFirestoreValue(entry);
    }
  }

  return sanitized as T;
}

function hasExistingAppData(database: Partial<Database>) {
  return COLLECTION_NAMES.some((collectionName) => {
    const list = database[collectionName as keyof Database];
    return Array.isArray(list) && list.length > 0;
  });
}

async function readLegacyFirebaseDocument(): Promise<Database | null> {
  const firestore = await getFirebaseFirestore();
  const rootCollection = getFirebaseRootPath();
  const legacyDocId = getFirebaseLegacyDocId();
  const legacySnap = await firestore.collection(rootCollection).doc(legacyDocId).get();

  if (!legacySnap.exists) {
    return null;
  }

  const legacyDatabase = legacySnap.data() as Partial<Database> | undefined;
  if (!legacyDatabase || !hasExistingAppData(legacyDatabase)) {
    return null;
  }

  return normalizeDatabase(legacyDatabase as Database);
}

async function ensureFirebaseCollections(): Promise<Database> {
  const firestore = await getFirebaseFirestore();
  const rootCollection = getFirebaseRootPath();
  const dbResult: Partial<Database> = {};
  let isEmpty = true;

  // Use parallel fetching for speed
  await Promise.all(
    COLLECTION_NAMES.map(async (collectionName) => {
      const snap = await firestore.collection(rootCollection).doc("collections").collection(collectionName).get();
      const items = snap.docs.map((doc) => doc.data());
      dbResult[collectionName] = items as any;
      if (items.length > 0) isEmpty = false;
    })
  );

  await Promise.all(
    SINGLETON_DATABASE_KEYS.map(async (singletonName) => {
      const snap = await getSingletonRef(firestore, singletonName).get();
      if (snap.exists) {
        (dbResult as any)[singletonName] = snap.data();
        isEmpty = false;
      }
    }),
  );

  if (isEmpty) {
    const legacyDatabase = await readLegacyFirebaseDocument();

    if (legacyDatabase) {
      console.info("Migrating legacy Firebase app_state document into collection storage.");
      await syncAllToFirebase(legacyDatabase);
      return legacyDatabase;
    }

    const seed = createSeedDatabase();
    await syncAllToFirebase(seed);
    return seed;
  }

  return normalizeDatabase(dbResult as Database);
}

async function readDatabaseFresh(): Promise<Database> {
  if (hasFirebaseCredentialShape()) {
    try {
      const database = await ensureFirebaseCollections();
      setDatabaseReadCache(database);
      return database;
    } catch (error) {
      const message = describeError(error);
      console.error(`Firebase read failed: ${message}`);
      const staleDatabase = getStaleCachedDatabase();

      if (staleDatabase) {
        console.warn("Serving stale in-memory database cache after Firebase read failure.");
        return staleDatabase;
      }

      if (!canUseLocalDatabaseFallback()) {
        requireDurableDatabase("Firebase read failed", error);
      }
    }
  }

  if (!canUseLocalDatabaseFallback()) {
    requireDurableDatabase("Firebase is not configured");
  }

  await ensureDatabaseFile();
  const content = await readFile(dbPath, "utf-8");
  const database = normalizeDatabase(JSON.parse(content) as Database);
  setDatabaseReadCache(database);
  return database;
}

export async function readDatabase(): Promise<Database> {
  const cachedDatabase = getCachedDatabase();
  if (cachedDatabase) {
    return cachedDatabase;
  }

  databaseReadPromise ??= readDatabaseFresh().finally(() => {
    databaseReadPromise = null;
  });

  return cloneDatabase(await databaseReadPromise);
}

export async function writeDatabase(database: Database) {
  if (hasFirebaseCredentialShape()) {
    try {
      // Legacy support, updateDatabase should be used for granular diffs
      await syncAllToFirebase(database);
      setDatabaseReadCache(database);
      return;
    } catch (error) {
      const message = describeError(error);
      console.error(`Firebase write failed: ${message}`);
      if (!canUseLocalDatabaseFallback()) {
        requireDurableDatabase("Firebase write failed", error);
      }
    }
  }

  if (!canUseLocalDatabaseFallback()) {
    requireDurableDatabase("Firebase is not configured");
  }

  await ensureDatabaseFile();
  await writeFile(dbPath, JSON.stringify(database, null, 2), "utf-8");
  setDatabaseReadCache(database);
}

export async function updateDatabase<T>(updater: (database: Database) => Promise<T> | T): Promise<T> {
  if (hasFirebaseCredentialShape()) {
    // Instead of locking a giant transaction, we read the collections concurrently, run the updater,
    // and then apply isolated diffs. This allows high-concurrency writes without Firestore lock contention.
    let database: Database | null = null;
    try {
      database = await ensureFirebaseCollections();
    } catch (error) {
      const message = describeError(error);
      console.error(`Firebase update failed while reading collections: ${message}`);
      if (!canUseLocalDatabaseFallback()) {
        requireDurableDatabase("Firebase update failed", error);
      }
    }

    if (database) {
      // Create deep clones to diff later.
      const originalMaps = new Map<string, Map<string, any>>();
      for (const collectionName of COLLECTION_NAMES) {
        const list = (database[collectionName as keyof Database] || []) as any[];
        const map = new Map<string, any>();
        for (const item of list) {
          if (item.id) map.set(item.id, JSON.stringify(item));
        }
        originalMaps.set(collectionName, map);
      }
      const originalSingletons = new Map<SingletonDatabaseKey, string | undefined>();
      for (const singletonName of SINGLETON_DATABASE_KEYS) {
        const value = database[singletonName];
        originalSingletons.set(singletonName, value === undefined ? undefined : JSON.stringify(value));
      }

      // Business/domain errors from updater must bubble up unchanged to the API caller.
      const result = await updater(database);

      try {
      const firestore = await getFirebaseFirestore();
      const rootCollection = getFirebaseRootPath();
      let batch = firestore.batch();
      let opCount = 0;

      for (const collectionName of COLLECTION_NAMES) {
        const list = (database[collectionName as keyof Database] || []) as any[];
        const oldMap = originalMaps.get(collectionName)!;
        const refCol = firestore.collection(rootCollection).doc("collections").collection(collectionName);

        const newIds = new Set<string>();

        for (const newItem of list) {
          if (!newItem.id) continue;
          newIds.add(newItem.id);

          const newStr = JSON.stringify(newItem);
          const oldStr = oldMap.get(newItem.id);

          if (newStr !== oldStr) {
            batch.set(refCol.doc(newItem.id), sanitizeFirestoreValue(newItem));
            opCount++;
            if (opCount >= 490) {
              await commitFirebaseBatch(batch, `update ${collectionName}/${newItem.id}`);
              batch = firestore.batch(); // fresh batch after commit
              opCount = 0;
            }
          }
        }

        // Check for deletions
        for (const [oldId] of oldMap) {
          if (!newIds.has(oldId)) {
            batch.delete(refCol.doc(oldId));
            opCount++;
            if (opCount >= 490) {
              await commitFirebaseBatch(batch, `delete ${collectionName}/${oldId}`);
              batch = firestore.batch(); // fresh batch after commit
              opCount = 0;
            }
          }
        }
      }

      for (const singletonName of SINGLETON_DATABASE_KEYS) {
        const newValue = database[singletonName];
        const newStr = newValue === undefined ? undefined : JSON.stringify(newValue);
        const oldStr = originalSingletons.get(singletonName);

        if (newStr !== oldStr) {
          const ref = getSingletonRef(firestore, singletonName);
          if (newValue === undefined) {
            batch.delete(ref);
          } else {
            batch.set(ref, sanitizeFirestoreValue(newValue));
          }
          opCount++;
          if (opCount >= 490) {
            await commitFirebaseBatch(batch, `update ${singletonName}`);
            batch = firestore.batch();
            opCount = 0;
          }
        }
      }

      if (opCount > 0) {
        await commitFirebaseBatch(batch, "update final batch");
      }

      setDatabaseReadCache(database);
      return result;
      } catch (error) {
        const message = describeError(error);
        console.error(`Firebase update failed while writing diffs: ${message}`);
        if (!canUseLocalDatabaseFallback()) {
          requireDurableDatabase("Firebase update failed", error);
        }
      }
    }
  }

  if (!canUseLocalDatabaseFallback()) {
    requireDurableDatabase("Firebase is not configured");
  }

  const database = await readDatabase();
  const result = await updater(database);
  await writeDatabase(database);
  setDatabaseReadCache(database);
  return result;
}
