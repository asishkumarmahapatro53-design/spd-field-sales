import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getApprovalItems, normalizePaymentTerms } from "@/lib/commercial";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase-admin";
import { hashPassword } from "@/lib/password";
import type { Database, Lead, LeadSite, SiteVisit, StakeholderContact, User } from "@/lib/types";
import { nowIso, toDateKey } from "@/lib/date";
import { getStakeholderLabel } from "@/lib/site-visit";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "mock-db.json");
const DEFAULT_PLANT_IDS = ["plant-a", "plant-b", "plant-c"] as const;

function createUserSeed(employeeId: string, name: string, role: User["role"], password: string, homePlantId: string | null): User {
  return {
    id: randomUUID(),
    employeeId,
    name,
    role,
    status: "ACTIVE",
    homePlantId,
    passwordHash: hashPassword(password),
  };
}

function createPlantSeeds() {
  return [
    {
      id: DEFAULT_PLANT_IDS[0],
      code: "PLANT_A",
      name: "Plant A",
      region: "North Cluster",
      status: "ACTIVE" as const,
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 16,
    },
    {
      id: DEFAULT_PLANT_IDS[1],
      code: "PLANT_B",
      name: "Plant B",
      region: "Central Cluster",
      status: "WATCH" as const,
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 14,
    },
    {
      id: DEFAULT_PLANT_IDS[2],
      code: "PLANT_C",
      name: "Plant C",
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
  const now = nowIso();
  const today = toDateKey(now);
  const customerAccounts = createCustomerAccountSeeds();

  return {
    users: [salesAgent, manager, accounting],
    authSessions: [],
    plants,
    workdaySessions: [],
    odometerReadings: [],
    siteVisits: [],
    leads: [],
    leadSites: [],
    approvalRequests: [],
    salesOrderRequests: [],
    reimbursementClaims: [],
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
  database.fleetVehicles ??= createFleetSeed();
  database.materialCostSnapshots ??= createMaterialCostSeeds();
  database.priceBenchmarks ??= createPriceBenchmarkSeeds();
  database.customerAccounts ??= createCustomerAccountSeeds();
  database.customerInvoices ??= createCustomerInvoiceSeeds(database.customerAccounts.map((entry) => entry.id));
  const fallbackPlantId = getFallbackPlantId(database as Database);

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
  });

  (database.leads ?? []).forEach((lead) => {
    const sites = database.leadSites
      .filter((entry) => entry.leadId === lead.id)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    const primarySite = sites[0] ?? null;

    lead.primarySiteId = primarySite?.id ?? null;
    lead.primarySiteLatLng = primarySite?.latLng ?? null;
    lead.siteCount = sites.length;
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
    request.paymentReceivedConfirmed ??= request.paymentType === "NORMAL";
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
  });

  // Normalize new RMC collections (ensure they exist)
  database.mixDesigns ??= [];
  database.dispatchRecords ??= [];
  database.commissionVouchers ??= [];

  database.reimbursementClaims ??= [];
  (database.reimbursementClaims ?? []).forEach((claim) => {
    claim.requestedBy ??= claim.agentId;
    claim.otpCode ??= null;
    claim.otpSentAt ??= null;
    claim.otpExpiresAt ??= null;
    claim.otpVerifiedAt ??= null;
    claim.paidAt ??= null;
    claim.paidBy ??= null;
    claim.rejectedAt ??= null;
    claim.rejectedBy ??= null;
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
  "salesOrderRequests",
  "reimbursementClaims",
  "tasks",
  "helpRequests",
  "targets",
  "auditLogs",
  "fleetVehicles",
  "materialCostSnapshots",
  "priceBenchmarks",
  "customerAccounts",
  "customerInvoices",
  // RMC Phase 1
  "mixDesigns",
  "dispatchRecords",
  "commissionVouchers",
] as const;

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
        batch.set(ref, item);
        opCount++;

        if (opCount >= 490) {
          await batch.commit();
          batch = firestore.batch(); // start a fresh batch after every commit
          opCount = 0;
        }
      }
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }
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

  if (isEmpty) {
    const seed = createSeedDatabase();
    await syncAllToFirebase(seed);
    return seed;
  }

  return normalizeDatabase(dbResult as Database);
}

export async function readDatabase(): Promise<Database> {
  if (await isFirebaseConfigured()) {
    return ensureFirebaseCollections();
  }

  await ensureDatabaseFile();
  const content = await readFile(dbPath, "utf-8");
  return normalizeDatabase(JSON.parse(content) as Database);
}

export async function writeDatabase(database: Database) {
  if (await isFirebaseConfigured()) {
    // Legacy support, updateDatabase should be used for granular diffs
    await syncAllToFirebase(database);
    return;
  }

  await ensureDatabaseFile();
  await writeFile(dbPath, JSON.stringify(database, null, 2), "utf-8");
}

export async function updateDatabase<T>(updater: (database: Database) => Promise<T> | T): Promise<T> {
  if (await isFirebaseConfigured()) {
    // Instead of locking a giant transaction, we read the collections concurrently, run the updater, and then apply isolated diffs.
    // This allows 100 concurrent users to write without Firestore locking errors.
    const database = await ensureFirebaseCollections();
    
    // Create deep clones to diff later
    const originalMaps = new Map<string, Map<string, any>>();
    for (const collectionName of COLLECTION_NAMES) {
      const list = (database[collectionName as keyof Database] || []) as any[];
      const map = new Map<string, any>();
      for (const item of list) {
        if (item.id) map.set(item.id, JSON.stringify(item));
      }
      originalMaps.set(collectionName, map);
    }

    const result = await updater(database);
    
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
          batch.set(refCol.doc(newItem.id), newItem);
          opCount++;
          if (opCount >= 490) {
            await batch.commit();
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
            await batch.commit();
            batch = firestore.batch(); // fresh batch after commit
            opCount = 0;
          }
        }
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    return result;
  }

  const database = await readDatabase();
  const result = await updater(database);
  await writeDatabase(database);
  return result;
}
