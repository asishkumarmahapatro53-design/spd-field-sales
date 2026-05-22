import { createHash, randomInt, randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import {
  buildSalesOrderPreviewHash,
  calculateAvailableCredit,
  getReimbursementOutstanding,
  isFinanceChecklistComplete,
  isManualPaymentVerificationComplete,
  isOpenReimbursementClaim,
  isSalesOrderFinalChecklistComplete,
  normalizeReimbursementStatus,
} from "@/lib/accounts-sales";
import {
  computeSalesOrderAmount,
  getApprovalItemById,
  getApprovalItems,
  normalizePaymentTerms,
  requiresPaymentReceipt,
  requiresPdcUpload,
  requiresPoUpload,
} from "@/lib/commercial";
import {
  buildEffectiveCustomerLedgerEntries,
  createAdvanceReceiptLedgerEntry,
  createCustomerAccountFromSalesOrder,
  findCustomerAccountByName,
  getAdvanceReceiptReferenceId,
  getCustomerLedgerBalance,
  shouldCreateAdvanceReceiptCredit,
} from "@/lib/customer-ledger";
import { compareIsoAsc, nowIso, toDateKey, toMonthKey } from "@/lib/date";
import { buildVerificationMessage, placeCallVerification, sendWhatsappVerification } from "@/lib/contact-verification";
import { readCollection, readCollectionByFieldValues, readDatabase, updateDatabase } from "@/lib/db";
import { sendGmail } from "@/lib/gmail-smtp";
import { generateInformalQuotationPdf } from "@/lib/informal-quotation-pdf";
import { extractPanFromGstin, isValidGstin, normalizeCastingType, normalizeGstin } from "@/lib/legal-workflow";
import { findMixDesignForOrder, getDefaultMixDesignRecipe, parseSlumpMm } from "@/lib/mix-design";
import {
  createOdooSaleOrderForSalesOrder,
  formatOdooError,
  isOdooConfigured,
  shouldSyncSalesOrderToOdoo,
  upsertOdooPartnerForSalesOrder,
} from "@/lib/odoo";
import { ocrService } from "@/lib/ocr";
import { distanceMeters, getLocationVerification, getStakeholderLabel, normalizeStakeholderRole, suggestLeadScore, suggestLeadStage, suggestNextFollowUp } from "@/lib/site-visit";
import { saveGeneratedBuffer } from "@/lib/storage";
import type {
  AccountingDashboardData,
  AgentDashboardData,
  ApprovalRequest,
  ApprovalRequestItem,
  AuditLogEntry,
  BatcherDashboardData,
  Database,
  DocumentTemplateType,
  ContactVerificationEvent,
  ContactVerificationChannel,
  ContactVerificationStatus,
  ExpectedSupplyWindow,
  CreditRiskCategory,
  LedgerDecisionStatus,
  HelpRequest,
  InformalQuotationLineItem,
  InformalQuotationPaymentType,
  InformalQuotationPriceType,
  InformalQuotationRequest,
  InformalQuotationStatus,
  LatLng,
  Lead,
  LeadSite,
  LeadStage,
  ManagerDashboardData,
  MapPinColor,
  MixDesign,
  MixDesignType,
  OdometerReading,
  OdometerContinuityStatus,
  OdometerDaySummary,
  OdometerDiscardReason,
  OdometerLockStatus,
  PaymentTerms,
  PaymentType,
  PaymentVerificationMode,
  ReadingType,
  ReimbursementPaymentMode,
  ReimbursementSummary,
  SalesOrderRequest,
  SiteVisit,
  SiteMapMarker,
  SiteLocationVerificationStatus,
  StakeholderContact,
  StakeholderMaster,
  Target,
  Task,
  User,
  WorkdaySession,
} from "@/lib/types";

export const FUEL_REIMBURSEMENT_RATE = 4.5;
export const LUNCH_AMOUNT = 150;
const OCR_ACCEPTANCE_CONFIDENCE = 0.55;
const OTP_TTL_MS = 10 * 60 * 1000;
const ACCEPTED_OCR_READING_KINDS = new Set(["ODO", "TOTAL", "TRIP"]);
const MAX_ODOMETER_STORED_BYTES = 2 * 1024 * 1024;
const MAX_SITE_VISIT_STORED_BYTES = 5 * 1024 * 1024;
const MAX_SITE_VISIT_VOICE_STORED_BYTES = 10 * 1024 * 1024;
const MAX_AUTO_ODOMETER_DIFF_KM = 1;
const DEFAULT_MAX_REASONABLE_DAY_DISTANCE_KM = 250;
const NEARBY_SITE_STRONG_MATCH_METERS = 75;
const NEARBY_SITE_MODERATE_MATCH_METERS = 200;
const MIN_QUOTATION_VALID_DAYS = 30;

const SITE_VISIT_LOCATION_WARNING_METERS = Number(process.env.SITE_VISIT_LOCATION_WARNING_METERS ?? 100);
const SITE_VISIT_LOCATION_REVIEW_METERS = Number(process.env.SITE_VISIT_LOCATION_REVIEW_METERS ?? 300);
const SITE_VISIT_LOCATION_CRITICAL_METERS = Number(process.env.SITE_VISIT_LOCATION_CRITICAL_METERS ?? 1000);
const SITE_VISIT_HIGH_QUANTITY_CUM = Number(process.env.SITE_VISIT_HIGH_QUANTITY_CUM ?? 500);

const APPROVED_CONCRETE_GRADES = new Set([
  "M5",
  "M7.5",
  "M10",
  "M15",
  "M20",
  "M25",
  "M30",
  "M35",
  "M40",
  "M45",
  "M50",
  "PCC",
  "OTHER",
]);

function normalizeConcreteGradeForVisit(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function getSiteVisitLocationSeverity(distanceMetersValue: number | null) {
  if (distanceMetersValue === null || !Number.isFinite(distanceMetersValue)) {
    return "UNKNOWN";
  }

  if (distanceMetersValue <= SITE_VISIT_LOCATION_WARNING_METERS) {
    return "OK";
  }

  if (distanceMetersValue <= SITE_VISIT_LOCATION_REVIEW_METERS) {
    return "WARNING";
  }

  if (distanceMetersValue <= SITE_VISIT_LOCATION_CRITICAL_METERS) {
    return "REVIEW";
  }

  return "CRITICAL";
}

function isUnusualSiteVisitQuantity(quantityCum: number) {
  return !Number.isFinite(quantityCum) || quantityCum <= 0 || quantityCum > SITE_VISIT_HIGH_QUANTITY_CUM;
}

function normalizeIndianMobile(value?: string | null) {
  return `${value ?? ""}`.replace(/\D/g, "");
}

function isRepeatedDigitPhone(phone: string) {
  return /^(\d)\1{9}$/.test(phone);
}

function isSequentialDummyPhone(phone: string) {
  return ["1234567890", "0123456789", "9876543210"].includes(phone);
}

function validateStakeholderPhoneForSiteVisit(value?: string | null): {
  normalizedPhone: string;
  isValid: boolean;
  reviewRequired: boolean;
  reason: string | null;
} {
  const normalizedPhone = normalizeIndianMobile(value);

  if (!normalizedPhone) {
    return {
      normalizedPhone,
      isValid: false,
      reviewRequired: true,
      reason: "Stakeholder phone number is missing.",
    };
  }

  if (normalizedPhone.length !== 10) {
    return {
      normalizedPhone,
      isValid: false,
      reviewRequired: true,
      reason: `Stakeholder phone must be exactly 10 digits. Received ${normalizedPhone.length} digits.`,
    };
  }

  if (!/^[6-9]/.test(normalizedPhone)) {
    return {
      normalizedPhone,
      isValid: false,
      reviewRequired: true,
      reason: `Stakeholder phone ${normalizedPhone} does not start with 6, 7, 8, or 9.`,
    };
  }

  if (isRepeatedDigitPhone(normalizedPhone)) {
    return {
      normalizedPhone,
      isValid: false,
      reviewRequired: true,
      reason: `Stakeholder phone ${normalizedPhone} appears to be a repeated dummy number.`,
    };
  }

  if (isSequentialDummyPhone(normalizedPhone)) {
    return {
      normalizedPhone,
      isValid: false,
      reviewRequired: true,
      reason: `Stakeholder phone ${normalizedPhone} appears to be a common dummy sequence.`,
    };
  }

  return {
    normalizedPhone,
    isValid: true,
    reviewRequired: false,
    reason: null,
  };
}

function getStakeholderPhoneValue(stakeholder: {
  phone?: string | null;
  phoneNumber?: string | null;
  mobile?: string | null;
  stakeholderPhone?: string | null;
  contactPhone?: string | null;
}) {
  return (
    stakeholder.phone ??
    stakeholder.phoneNumber ??
    stakeholder.mobile ??
    stakeholder.stakeholderPhone ??
    stakeholder.contactPhone ??
    null
  );
}

function getInitialWhatsAppAvailabilityStatus() {
  return {
    whatsappCheckStatus: "NOT_CHECKED",
    whatsappCheckMethod: "NO_MESSAGE_SENT",
    whatsappCheckNote:
      "WhatsApp availability has not been checked. The system must not send a WhatsApp message for silent availability verification.",
  };
}

// TODO: Actual WhatsApp availability and missed-call verification must be implemented
// through approved providers only. This backend must not send WhatsApp messages for
// availability checks. Until provider integration is added, the app stores only
// UNVERIFIED / INVALID and NOT_CHECKED statuses.

function normalizePhoneForDuplicateCheck(value?: string | null) {
  return `${value ?? ""}`.replace(/\D/g, "");
}

function normalizePhoneDigitsForMatch(value?: string | null) {
  const digits = `${value ?? ""}`.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function getVisitStakeholderPhones(
  stakeholders: Array<{
    phone?: string | null;
    phoneNumber?: string | null;
    mobile?: string | null;
    stakeholderPhone?: string | null;
    contactPhone?: string | null;
  }>,
) {
  return Array.from(
    new Set(
      stakeholders
        .map((stakeholder) =>
          normalizePhoneForDuplicateCheck(
            stakeholder.phone ??
              stakeholder.phoneNumber ??
              stakeholder.mobile ??
              stakeholder.stakeholderPhone ??
              stakeholder.contactPhone ??
              null,
          ),
        )
        .filter((phone) => phone.length === 10),
    ),
  );
}

function getSiteVisitDateKey(value?: string | null) {
  return toDateKey(value ?? nowIso());
}

function getConfiguredMaxDailyDistanceKm() {
  const configured = Number(
    process.env.ODOMETER_MAX_DAILY_DISTANCE_KM ?? DEFAULT_MAX_REASONABLE_DAY_DISTANCE_KM,
  );

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_REASONABLE_DAY_DISTANCE_KM;
  }

  return configured;
}

function shouldZeroDistanceRequireManagerReview() {
  return process.env.ODOMETER_ZERO_DISTANCE_REQUIRES_MANAGER_REVIEW?.trim().toLowerCase() !== "false";
}

const INVALID_PHONE_PATTERNS = new Set([
  "0000000000",
  "1111111111",
  "2222222222",
  "3333333333",
  "4444444444",
  "5555555555",
  "6666666666",
  "7777777777",
  "8888888888",
  "9999999999",
  "1234567890",
  "0123456789",
]);

function ensureAutoMixDesignForSalesOrder(database: Database, request: SalesOrderRequest, actor: User) {
  const existingDesign = findMixDesignForOrder(database.mixDesigns ?? [], request);
  if (existingDesign) {
    request.mixDesignId = existingDesign.id;
    return { design: existingDesign, created: false };
  }

  const grade = request.grade.toUpperCase().trim();
  const versions = (database.mixDesigns ?? [])
    .filter((design) => design.plantId === request.plantId && design.grade === grade)
    .map((design) => design.version);
  const recipe = {
    ...getDefaultMixDesignRecipe(grade, request.mixDesignType),
    targetSlumpMm: parseSlumpMm(request.slump),
  };
  const now = nowIso();
  const design: MixDesign = {
    id: randomUUID(),
    plantId: request.plantId,
    grade,
    version: versions.length ? Math.max(...versions) + 1 : 1,
    isActive: true,
    mixDesignType: request.mixDesignType,
    ...recipe,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };

  database.mixDesigns ??= [];
  database.mixDesigns.push(design);
  request.mixDesignId = design.id;
  logAudit(
    database,
    actor,
    "MixDesign",
    design.id,
    "AUTO_CREATE",
    `Auto-created ${design.mixDesignType.replaceAll("_", " ").toLowerCase()} recipe for ${request.grade} at ${request.siteName}. QC can edit it before dispatch if required.`,
  );

  return { design, created: true };
}

function assertRole(user: User, allowed: User["role"][]) {
  if (!allowed.includes(user.role)) {
    throw new Error("You do not have access to perform this action.");
  }
}

function getOpenSession(database: Database, userId: string, dateKey = toDateKey(nowIso())) {
  return database.workdaySessions.find(
    (session) => session.userId === userId && session.date === dateKey && session.status === "OPEN",
  );
}

function logAudit(database: Database, actor: User, entityType: string, entityId: string, action: string, detail: string) {
  const entry: AuditLogEntry = {
    id: randomUUID(),
    actorId: actor.id,
    actorRole: actor.role,
    entityType,
    entityId,
    action,
    detail,
    createdAt: nowIso(),
  };

  database.auditLogs.unshift(entry);
}

async function patchOdooSyncFields(
  actor: User,
  requestId: string,
  patch: Partial<SalesOrderRequest>,
  action: string,
  detail: string,
) {
  await updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);
    if (!request) {
      return;
    }

    Object.assign(request, patch);

    if (typeof patch.odooPartnerId === "number") {
      const account = findCustomerAccountByName(database.customerAccounts ?? [], request.customerName);
      if (account) {
        account.odooPartnerId = patch.odooPartnerId;
      }
    }

    logAudit(database, actor, "SalesOrderRequest", request.id, action, detail);
  });
}

async function syncOdooLedgerAfterFinanceReview(actor: User, request: SalesOrderRequest) {
  if (!shouldSyncSalesOrderToOdoo(request)) {
    return request;
  }

  if (!isOdooConfigured()) {
    const patch: Partial<SalesOrderRequest> = {
      odooLedgerSyncStatus: "SKIPPED",
      odooLedgerSyncError: "Odoo is not configured. Add ODOO_URL, ODOO_DB, ODOO_USERNAME, and ODOO_API_KEY.",
      odooLedgerSyncedAt: null,
    };
    Object.assign(request, patch);
    await patchOdooSyncFields(
      actor,
      request.id,
      patch,
      "ODOO_LEDGER_SYNC_SKIPPED",
      "Skipped Odoo ledger sync because Odoo is not configured.",
    );
    return request;
  }

  try {
    const result = await upsertOdooPartnerForSalesOrder(request);
    const syncedAt = nowIso();
    const patch: Partial<SalesOrderRequest> = {
      odooPartnerId: result.partnerId,
      odooLedgerSyncStatus: "SYNCED",
      odooLedgerSyncError: null,
      odooLedgerSyncedAt: syncedAt,
    };
    Object.assign(request, patch);
    await patchOdooSyncFields(
      actor,
      request.id,
      patch,
      "ODOO_LEDGER_SYNCED",
      `Synced Odoo customer ledger base with partner #${result.partnerId}.`,
    );
  } catch (error) {
    const patch: Partial<SalesOrderRequest> = {
      odooLedgerSyncStatus: "FAILED",
      odooLedgerSyncError: formatOdooError(error),
      odooLedgerSyncedAt: null,
    };
    Object.assign(request, patch);
    await patchOdooSyncFields(
      actor,
      request.id,
      patch,
      "ODOO_LEDGER_SYNC_FAILED",
      `Odoo ledger sync failed: ${patch.odooLedgerSyncError}`,
    );
  }

  return request;
}

async function syncOdooSalesOrderAfterCreation(actor: User, request: SalesOrderRequest) {
  if (!shouldSyncSalesOrderToOdoo(request)) {
    return request;
  }

  if (!isOdooConfigured()) {
    const patch: Partial<SalesOrderRequest> = {
      odooSalesOrderSyncStatus: "SKIPPED",
      odooSalesOrderSyncError: "Odoo is not configured. Add ODOO_URL, ODOO_DB, ODOO_USERNAME, and ODOO_API_KEY.",
      odooSalesOrderSyncedAt: null,
    };
    Object.assign(request, patch);
    await patchOdooSyncFields(
      actor,
      request.id,
      patch,
      "ODOO_SALES_ORDER_SYNC_SKIPPED",
      "Skipped Odoo sales order sync because Odoo is not configured.",
    );
    return request;
  }

  try {
    const result = await createOdooSaleOrderForSalesOrder(request);
    const syncedAt = nowIso();
    const patch: Partial<SalesOrderRequest> = {
      odooPartnerId: result.partnerId,
      odooSaleOrderId: result.saleOrderId,
      odooSaleOrderName: result.saleOrderName,
      odooSalesOrderSyncStatus: "SYNCED",
      odooSalesOrderSyncError: null,
      odooSalesOrderSyncedAt: syncedAt,
      odooLedgerSyncStatus: "SYNCED",
      odooLedgerSyncError: null,
      odooLedgerSyncedAt: request.odooLedgerSyncedAt ?? syncedAt,
    };
    Object.assign(request, patch);
    await patchOdooSyncFields(
      actor,
      request.id,
      patch,
      "ODOO_SALES_ORDER_SYNCED",
      `Synced Odoo sales order ${result.saleOrderName} (#${result.saleOrderId}).`,
    );
  } catch (error) {
    const patch: Partial<SalesOrderRequest> = {
      odooSalesOrderSyncStatus: "FAILED",
      odooSalesOrderSyncError: formatOdooError(error),
      odooSalesOrderSyncedAt: null,
    };
    Object.assign(request, patch);
    await patchOdooSyncFields(
      actor,
      request.id,
      patch,
      "ODOO_SALES_ORDER_SYNC_FAILED",
      `Odoo sales order sync failed: ${patch.odooSalesOrderSyncError}`,
    );
  }

  return request;
}

function sortLeads(leads: Lead[]) {
  return [...leads].sort((left, right) => {
    const followUpDiff = new Date(left.nextFollowUpAt).getTime() - new Date(right.nextFollowUpAt).getTime();
    if (followUpDiff !== 0) {
      return followUpDiff;
    }

    return right.score - left.score;
  });
}

function sortLeadSites(sites: LeadSite[]) {
  return [...sites].sort((left, right) => {
    const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    return left.siteName.localeCompare(right.siteName);
  });
}

function getLeadSites(database: Database, leadId: string) {
  return sortLeadSites(database.leadSites.filter((entry) => entry.leadId === leadId));
}

function getPrimaryLeadSite(database: Database, leadId: string) {
  return getLeadSites(database, leadId)[0] ?? null;
}

function findUser(database: Database, userId: string) {
  const user = database.users.find((entry) => entry.id === userId);

  if (!user) {
    throw new Error("User not found.");
  }

  return user;
}

function getFallbackPlantId(database: Database) {
  const plantId = database.plants[0]?.id;

  if (!plantId) {
    throw new Error("No plants are configured.");
  }

  return plantId;
}

function getUserPlantId(database: Database, userId: string) {
  return findUser(database, userId).homePlantId ?? getFallbackPlantId(database);
}

function requireLeadForUser(database: Database, user: User, leadId: string) {
  const lead = database.leads.find((entry) => entry.id === leadId);

  if (!lead) {
    throw new Error("Lead not found.");
  }

  if (user.role === "SALES_AGENT" && lead.agentId !== user.id) {
    throw new Error("You can only use your own leads.");
  }

  return lead;
}

function requireLeadSite(database: Database, leadId: string, siteId: string | null | undefined) {
  if (!siteId) {
    return getPrimaryLeadSite(database, leadId);
  }

  return database.leadSites.find((entry) => entry.id === siteId && entry.leadId === leadId) ?? null;
}

function normalizeGradeKeyForApproval(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function buildApprovalVariationReasons(
  approvalItems: ApprovalRequestItem[],
  quotation: InformalQuotationRequest | null,
  input: CreateApprovalRequestInput,
) {
  if (!quotation) {
    return ["No approved informal quotation is linked to this final approval request."];
  }

  const reasons: string[] = [];

  const quotationItemsByGrade = new Map(
    quotation.items.map((item) => [normalizeGradeKeyForApproval(item.grade), item]),
  );

  for (const approvalItem of approvalItems) {
    const gradeKey = normalizeGradeKeyForApproval(approvalItem.grade);
    const quotedItem = quotationItemsByGrade.get(gradeKey);

    if (!quotedItem) {
      reasons.push(`Grade ${approvalItem.grade} is not present in the linked quotation.`);
      continue;
    }

    if (Number(approvalItem.quotedPrice) !== Number(quotedItem.pricePerCum)) {
      reasons.push(
        `Rate variation for ${approvalItem.grade}: quotation rate ${quotedItem.pricePerCum}, final approval rate ${approvalItem.quotedPrice}.`,
      );
    }
  }

  const approvalGrades = new Set(approvalItems.map((item) => normalizeGradeKeyForApproval(item.grade)));
  const extraQuotedGrades = quotation.items
    .filter((item) => !approvalGrades.has(normalizeGradeKeyForApproval(item.grade)))
    .map((item) => item.grade);

  if (extraQuotedGrades.length) {
    reasons.push(`Linked quotation contains additional grade(s) not included in approval: ${extraQuotedGrades.join(", ")}.`);
  }

  if (quotation.paymentType && quotation.paymentType !== input.paymentType) {
    reasons.push(`Payment type changed from quotation ${quotation.paymentType} to approval ${input.paymentType}.`);
  }

  if (Math.abs(Number(quotation.oneWayDistanceKm) - Number(input.oneWayDistanceKm)) > 0.5) {
    reasons.push(
      `Distance changed from quotation ${quotation.oneWayDistanceKm} km to approval ${input.oneWayDistanceKm} km.`,
    );
  }

  if (Number(quotation.trafficPostCount) !== Number(input.trafficCount)) {
    reasons.push(
      `Traffic post count changed from quotation ${quotation.trafficPostCount} to approval ${input.trafficCount}.`,
    );
  }

  return reasons;
}

function findOpenFinalApprovalForSite(
  database: Database,
  siteId: string,
  approvalItems: ApprovalRequestItem[],
) {
  const gradeSet = new Set(approvalItems.map((item) => normalizeGradeKeyForApproval(item.grade)));

  return database.approvalRequests.find((entry) => {
    if (entry.siteId !== siteId) {
      return false;
    }

    if (entry.status === "REJECTED") {
      return false;
    }

    const entryGradeSet = new Set(entry.items.map((item) => normalizeGradeKeyForApproval(item.grade)));
    const hasCommonGrade = [...gradeSet].some((grade) => entryGradeSet.has(grade));

    return hasCommonGrade && (entry.status === "PENDING" || entry.status === "APPROVED");
  });
}

function finalApprovalDecisionNeedsManagerNote(approval: ApprovalRequest) {
  return Boolean(
    approval.rateValidationStatus === "BELOW_MINIMUM" ||
      approval.routeFeasibilityStatus === "MARGINAL" ||
      approval.routeFeasibilityStatus === "NOT_FEASIBLE" ||
      approval.quotationValidityStatus === "NOT_LINKED" ||
      approval.directFinalApprovalReason ||
      approval.variationNotes,
  );
}

function summarizeApprovalLineItems(items: ApprovalRequestItem[]) {
  const normalizedItems = items
    .map((item) => ({
      id: item.id || randomUUID(),
      grade: item.grade.trim().toUpperCase(),
      quotedPrice: Math.round(item.quotedPrice * 100) / 100,
    }))
    .filter((item) => item.grade && Number.isFinite(item.quotedPrice) && item.quotedPrice > 0)
    .slice(0, 3);

  if (!normalizedItems.length) {
    throw new Error("Add at least one valid grade and price for approval.");
  }

  return normalizedItems;
}

function createApprovalAuditSummary(approval: ApprovalRequest) {
  const itemSummary = getApprovalItems(approval)
    .map((item) => `${item.grade} @ ${item.quotedPrice}`)
    .join(", ");
  return `${approval.customerName} | ${itemSummary} | ${approval.paymentType}/${approval.paymentTerms}`;
}

function getReadingStatus(confirmedStart: number | null, confirmedEnd: number | null, readings: OdometerReading[]) {
  if (readings.some((entry) => entry.status === "MANUAL_VERIFIED")) {
    return "MANUAL_VERIFIED" as const;
  }

  if (confirmedStart !== null && confirmedEnd !== null) {
    return "CONFIRMED" as const;
  }

  if (readings.length > 0) {
    return "PENDING" as const;
  }

  return "OPEN" as const;
}

function getLastPaidThroughDate(database: Database, agentId: string) {
  const paidThroughClaimDate = database.reimbursementClaims
    .filter((claim) => claim.agentId === agentId && claim.status === "PAID")
    .reduce<string | null>((latestDate, claim) => {
      if (!latestDate || claim.periodEnd > latestDate) {
        return claim.periodEnd;
      }

      return latestDate;
    }, null);
  const storedClosedDate = database.users.find((entry) => entry.id === agentId)?.lastReimbursementClosedDate ?? null;

  if (paidThroughClaimDate && storedClosedDate) {
    return paidThroughClaimDate > storedClosedDate ? paidThroughClaimDate : storedClosedDate;
  }

  return paidThroughClaimDate ?? storedClosedDate;
}

function getClaimIdForSession(database: Database, sessionId: string) {
  return (
    database.reimbursementClaims.find(
      (claim) => normalizeReimbursementStatus(claim.status) !== "PAYMENT_REJECTED" && claim.lineItems.some((lineItem) => lineItem.sessionId === sessionId),
    )?.id ?? null
  );
}

function isClaimableSummary(summary: ReimbursementSummary) {
  return (
    summary.claimId === null &&
    summary.totalDistance !== null &&
    summary.startReading !== null &&
    summary.endReading !== null &&
    (summary.status === "CONFIRMED" || summary.status === "MANUAL_VERIFIED")
  );
}

function getEligibleClaimSummaries(database: Database, agentId: string) {
  const lastPaidThroughDate = getLastPaidThroughDate(database, agentId);

  return computeReimbursementSummaries(database, agentId).filter(
    (summary) => isClaimableSummary(summary) && (!lastPaidThroughDate || summary.date > lastPaidThroughDate),
  );
}

export function computeReimbursementSummaries(database: Database, userId?: string) {
  const relevantSessions = database.workdaySessions.filter((session) => (userId ? session.userId === userId : true));

  return relevantSessions
    .map<ReimbursementSummary>((session) => {
      const user = findUser(database, session.userId);
      const readings = database.odometerReadings
        .filter((entry) => entry.sessionId === session.id && entry.status !== "DISCARDED" && entry.isActiveReading !== false)
        .sort((left, right) => compareIsoAsc(left.capturedAt, right.capturedAt));
      const visits = database.siteVisits
        .filter((entry) => entry.sessionId === session.id)
        .sort((left, right) => compareIsoAsc(left.visitedAt, right.visitedAt));
      const startReading = readings.find((entry) => entry.type === "START" && entry.finalValue !== null);
      const endReading = [...readings].reverse().find((entry) => entry.type === "END" && entry.finalValue !== null);
      const totalDistance =
        startReading?.finalValue !== null &&
        startReading?.finalValue !== undefined &&
        endReading?.finalValue !== null &&
        endReading?.finalValue !== undefined
          ? Math.max(endReading.finalValue - startReading.finalValue, 0)
          : null;
      const fuelAmount = totalDistance === null ? null : Math.round(totalDistance * FUEL_REIMBURSEMENT_RATE * 100) / 100;

      return {
        sessionId: session.id,
        userId: session.userId,
        agentName: user.name,
        date: session.date,
        officeInTime: session.loginAt,
        siteVisitStartTime: visits[0]?.visitedAt ?? null,
        startReading: startReading?.finalValue ?? null,
        endReading: endReading?.finalValue ?? null,
        siteVisitEndTime: visits.at(-1)?.visitedAt ?? null,
        officeOutTime: session.logoutAt,
        totalDistance,
        totalSiteVisits: visits.length,
        lunchAmount: LUNCH_AMOUNT,
        fuelAmount,
        totalAmount: fuelAmount === null ? null : fuelAmount + LUNCH_AMOUNT,
        claimId: getClaimIdForSession(database, session.id),
        status: getReadingStatus(startReading?.finalValue ?? null, endReading?.finalValue ?? null, readings),
      };
    })
    .sort((left, right) => (left.date === right.date ? left.agentName.localeCompare(right.agentName) : right.date.localeCompare(left.date)));
}

export async function createReimbursementClaim(user: User) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const openClaim = database.reimbursementClaims.find((claim) => claim.agentId === user.id && isOpenReimbursementClaim(claim));

    if (openClaim) {
      throw new Error("A reimbursement claim is already pending for this agent.");
    }

    const summaries = getEligibleClaimSummaries(database, user.id).sort((left, right) => left.date.localeCompare(right.date));

    if (!summaries.length) {
      throw new Error("No verified unpaid reimbursement days are available for claim.");
    }

    const lineItems = summaries.map((summary) => {
      const distanceKm = summary.totalDistance ?? 0;
      const fuelAmount = summary.fuelAmount ?? 0;

      return {
        sessionId: summary.sessionId,
        date: summary.date,
        startReading: summary.startReading ?? 0,
        endReading: summary.endReading ?? 0,
        distanceKm,
        siteVisits: summary.totalSiteVisits,
        fuelAmount,
        lunchAmount: summary.lunchAmount,
        totalAmount: fuelAmount + summary.lunchAmount,
      };
    });
    const totalDistanceKm = lineItems.reduce((sum, lineItem) => sum + lineItem.distanceKm, 0);
    const fuelAmount = lineItems.reduce((sum, lineItem) => sum + lineItem.fuelAmount, 0);
    const lunchAmount = lineItems.reduce((sum, lineItem) => sum + lineItem.lunchAmount, 0);
    const totalAmount = lineItems.reduce((sum, lineItem) => sum + lineItem.totalAmount, 0);
    const claim = {
      id: randomUUID(),
      agentId: user.id,
      requestedBy: user.id,
      status: "CLAIM_REQUESTED" as const,
      periodStart: lineItems[0]?.date ?? summaries[0]?.date ?? toDateKey(nowIso()),
      periodEnd: lineItems.at(-1)?.date ?? summaries.at(-1)?.date ?? toDateKey(nowIso()),
      lineItems,
      totalDistanceKm,
      fuelAmount,
      lunchAmount,
      totalAmount,
      approvedAmount: totalAmount,
      paidAmount: 0,
      balanceAmount: totalAmount,
      outstandingAmount: totalAmount,
      requestedAt: nowIso(),
      managerVerifiedBy: null,
      managerVerifiedAt: null,
      managerVerificationNote: null,
      accountsPaymentPendingAt: null,
      cashVoucherNumber: null,
      cashVoucherCreatedAt: null,
      cashVoucherCreatedBy: null,
      cashVoucherAmount: null,
      otpCode: null,
      otpSentAt: null,
      otpExpiresAt: null,
      otpVerifiedAt: null,
      agentReceiptConfirmedAt: null,
      paidAt: null,
      paidBy: null,
      rejectedAt: null,
      rejectedBy: null,
      accountantRemarks: null,
      paymentMode: null,
      paymentHistory: [],
      note: null,
    };

    database.reimbursementClaims.unshift(claim);
    logAudit(database, user, "ReimbursementClaim", claim.id, "CLAIM_REQUEST", `Requested reimbursement for ${lineItems.length} day(s).`);
    return claim;
  });
}

export async function verifyReimbursementClaimByManager(user: User, claimId: string, note: string) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const claim = database.reimbursementClaims.find((entry) => entry.id === claimId);

    if (!claim) {
      throw new Error("Reimbursement claim not found.");
    }

    if (normalizeReimbursementStatus(claim.status) !== "CLAIM_REQUESTED") {
      throw new Error("Only newly requested claims can be manager verified.");
    }

    const now = nowIso();
    claim.status = "ACCOUNTS_PAYMENT_PENDING";
    claim.managerVerifiedBy = user.id;
    claim.managerVerifiedAt = now;
    claim.managerVerificationNote = note.trim() || "Manager verified the reimbursement claim.";
    claim.accountsPaymentPendingAt = now;
    claim.approvedAmount ??= claim.totalAmount;
    claim.paidAmount ??= 0;
    claim.balanceAmount = Math.max(0, (claim.approvedAmount ?? claim.totalAmount) - (claim.paidAmount ?? 0));
    claim.outstandingAmount = claim.balanceAmount;
    claim.note = claim.managerVerificationNote;
    logAudit(database, user, "ReimbursementClaim", claim.id, "MANAGER_VERIFIED", claim.managerVerificationNote);
    return claim;
  });
}

export async function createReimbursementCashVoucher(
  user: User,
  claimId: string,
  input: {
    cashVoucherNumber: string;
    amount: number;
    remarks: string;
  },
) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const claim = database.reimbursementClaims.find((entry) => entry.id === claimId);

    if (!claim) {
      throw new Error("Reimbursement claim not found.");
    }

    const status = normalizeReimbursementStatus(claim.status);
    if (status !== "ACCOUNTS_PAYMENT_PENDING" && status !== "PAYMENT_HOLD" && status !== "PARTIAL_PAYMENT" && status !== "BALANCE_OUTSTANDING") {
      throw new Error("Manager verification is required before Accounts can create a cash voucher.");
    }

    const cashVoucherNumber = input.cashVoucherNumber.trim();
    if (!cashVoucherNumber) {
      throw new Error("Cash voucher number is required before OTP.");
    }

    const amount = Number(input.amount);
    const outstanding = getReimbursementOutstanding(claim);
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) {
      throw new Error(`Voucher amount must be greater than zero and not exceed outstanding amount Rs.${outstanding}.`);
    }

    if (!input.remarks.trim()) {
      throw new Error("Accountant remarks are required for cash voucher creation.");
    }

    const now = nowIso();
    claim.status = "CASH_VOUCHER_CREATED";
    claim.cashVoucherNumber = cashVoucherNumber;
    claim.cashVoucherCreatedAt = now;
    claim.cashVoucherCreatedBy = user.id;
    claim.cashVoucherAmount = amount;
    claim.accountantRemarks = input.remarks.trim();
    claim.note = input.remarks.trim();
    logAudit(database, user, "ReimbursementClaim", claim.id, "CASH_VOUCHER_CREATED", `Cash voucher ${cashVoucherNumber} created for Rs.${amount}. ${input.remarks.trim()}`);
    return claim;
  });
}

export async function sendReimbursementClaimOtp(user: User, claimId: string) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const claim = database.reimbursementClaims.find((entry) => entry.id === claimId);

    if (!claim) {
      throw new Error("Reimbursement claim not found.");
    }

    const status = normalizeReimbursementStatus(claim.status);
    if (status !== "CASH_VOUCHER_CREATED" && status !== "OTP_SENT") {
      throw new Error("Create a cash voucher before sending reimbursement OTP.");
    }

    if (!claim.cashVoucherNumber) {
      throw new Error("Cash voucher number is required before OTP.");
    }

    const now = nowIso();
    claim.status = "OTP_SENT";
    claim.otpCode = String(randomInt(100000, 1000000));
    claim.otpSentAt = now;
    claim.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    claim.note = "OTP sent to sales agent in the app.";
    logAudit(database, user, "ReimbursementClaim", claim.id, "OTP_SENT", `OTP sent for reimbursement claim ${claim.id}.`);
    return claim;
  });
}

export async function verifyReimbursementClaimOtp(user: User, claimId: string, otpCode: string) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const claim = database.reimbursementClaims.find((entry) => entry.id === claimId);

    if (!claim) {
      throw new Error("Reimbursement claim not found.");
    }

    if (claim.status !== "OTP_SENT") {
      throw new Error("Send OTP before verifying this reimbursement claim.");
    }

    if (!claim.otpCode || claim.otpCode !== otpCode.trim()) {
      throw new Error("Invalid OTP for this reimbursement claim.");
    }

    if (!claim.otpExpiresAt || new Date(claim.otpExpiresAt).getTime() < Date.now()) {
      throw new Error("OTP expired. Send a fresh OTP.");
    }

    const now = nowIso();
    claim.status = "AGENT_RECEIPT_CONFIRMED";
    claim.otpVerifiedAt = now;
    claim.agentReceiptConfirmedAt = now;
    claim.note = "Agent receipt confirmed by OTP.";
    logAudit(database, user, "ReimbursementClaim", claim.id, "AGENT_RECEIPT_CONFIRMED", `Agent receipt confirmed by OTP for voucher ${claim.cashVoucherNumber ?? claim.id}.`);
    return claim;
  });
}

export async function recordReimbursementClaimPayment(
  user: User,
  claimId: string,
  input: {
    action: "FULL" | "PARTIAL" | "HOLD" | "REJECT";
    amount?: number;
    paymentMode?: ReimbursementPaymentMode;
    referenceNumber?: string;
    remarks: string;
  },
) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const claim = database.reimbursementClaims.find((entry) => entry.id === claimId);

    if (!claim) {
      throw new Error("Reimbursement claim not found.");
    }

    const remarks = input.remarks.trim();
    if (!remarks) {
      throw new Error("Accountant remarks are required.");
    }

    const status = normalizeReimbursementStatus(claim.status);
    const now = nowIso();

    if (input.action === "HOLD") {
      if (status === "PAID" || status === "PAYMENT_REJECTED") {
        throw new Error("Closed reimbursement claims cannot be put on hold.");
      }
      claim.status = "PAYMENT_HOLD";
      claim.accountantRemarks = remarks;
      claim.note = remarks;
      logAudit(database, user, "ReimbursementClaim", claim.id, "PAYMENT_HOLD", remarks);
      return claim;
    }

    if (input.action === "REJECT") {
      if (status === "PAID") {
        throw new Error("Paid reimbursement claims cannot be rejected.");
      }
      claim.status = "PAYMENT_REJECTED";
      claim.rejectedAt = now;
      claim.rejectedBy = user.id;
      claim.accountantRemarks = remarks;
      claim.note = remarks;
      logAudit(database, user, "ReimbursementClaim", claim.id, "PAYMENT_REJECTED", remarks);
      return claim;
    }

    if (status !== "AGENT_RECEIPT_CONFIRMED") {
      throw new Error("Verify the agent receipt OTP before recording full or partial payment.");
    }

    const outstandingBefore = getReimbursementOutstanding(claim);
    const requestedAmount = input.action === "FULL" ? outstandingBefore : Number(input.amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > outstandingBefore) {
      throw new Error(`Payment amount must be greater than zero and not exceed outstanding amount Rs.${outstandingBefore}.`);
    }

    const paymentMode = input.paymentMode ?? "CASH";
    const paidAmount = (claim.paidAmount ?? 0) + requestedAmount;
    const outstandingAmount = Math.max(0, (claim.approvedAmount ?? claim.totalAmount) - paidAmount);
    claim.paidAmount = paidAmount;
    claim.balanceAmount = outstandingAmount;
    claim.outstandingAmount = outstandingAmount;
    claim.paymentMode = paymentMode;
    claim.accountantRemarks = remarks;
    claim.paymentHistory ??= [];
    claim.paymentHistory.push({
      id: randomUUID(),
      amount: requestedAmount,
      balanceAmount: outstandingAmount,
      outstandingAmount,
      paymentMode,
      cashVoucherNumber: claim.cashVoucherNumber ?? null,
      referenceNumber: input.referenceNumber?.trim() || null,
      remarks,
      paidBy: user.id,
      paidAt: now,
    });

    if (outstandingAmount > 0) {
      claim.status = "PARTIAL_PAYMENT";
      claim.paidAt = null;
      claim.paidBy = null;
      claim.note = `Partial payment recorded. Balance outstanding Rs.${outstandingAmount}. ${remarks}`;
      logAudit(database, user, "ReimbursementClaim", claim.id, "PARTIAL_PAYMENT", claim.note);
      return claim;
    }

    claim.status = "PAID";
    claim.paidAt = now;
    claim.paidBy = user.id;
    claim.note = remarks;
    const agent = database.users.find((entry) => entry.id === claim.agentId);
    if (agent && (!agent.lastReimbursementClosedDate || claim.periodEnd > agent.lastReimbursementClosedDate)) {
      agent.lastReimbursementClosedDate = claim.periodEnd;
    }
    claim.lineItems.forEach((lineItem) => {
      database.odometerReadings
        .filter((reading) => reading.sessionId === lineItem.sessionId)
        .forEach((reading) => {
          reading.lockStatus = "PAID_LOCKED";
        });
    });
    logAudit(database, user, "ReimbursementClaim", claim.id, "PAID", `Paid reimbursement claim for Rs.${paidAmount}. ${remarks}`);
    return claim;
  });
}

export async function startWorkdaySession(user: User, latLng: LatLng | null) {
  assertRole(user, ["SALES_AGENT"]);
  const today = toDateKey(nowIso());

  return updateDatabase((database) => {
    let session = getOpenSession(database, user.id, today);

    if (!session) {
      session = {
        id: randomUUID(),
        userId: user.id,
        plantId: getUserPlantId(database, user.id),
        date: today,
        loginAt: nowIso(),
        logoutAt: null,
        loginLatLng: latLng,
        logoutLatLng: null,
        status: "OPEN",
      };
      database.workdaySessions.push(session);
      logAudit(database, user, "WorkdaySession", session.id, "START", "Workday session started.");
    } else if (!session.loginLatLng && latLng) {
      session.loginLatLng = latLng;
    }

    return session;
  });
}

export async function endWorkdaySession(user: User, latLng: LatLng | null) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const session = getOpenSession(database, user.id);

    if (!session) {
      throw new Error("No open workday session found.");
    }

    session.logoutAt = nowIso();
    session.logoutLatLng = latLng;
    session.status = "CLOSED";
    logAudit(database, user, "WorkdaySession", session.id, "END", "Workday session closed.");

    return session;
  });
}

function getClaimBlockingReadingDate(database: Database, agentId: string, dateKey: string) {
  return database.reimbursementClaims.find((claim) => {
    if (claim.agentId !== agentId || normalizeReimbursementStatus(claim.status) === "PAYMENT_REJECTED") {
      return false;
    }

    return (
      claim.lineItems.some((lineItem) => lineItem.date === dateKey) ||
      (dateKey >= claim.periodStart && dateKey <= claim.periodEnd)
    );
  });
}

function getOdometerLockStatus(database: Database, agentId: string, dateKey: string): {
  status: OdometerLockStatus;
  claimId: string | null;
  message: string | null;
} {
  const lastPaidThroughDate = getLastPaidThroughDate(database, agentId);

  if (lastPaidThroughDate && dateKey <= lastPaidThroughDate) {
    return {
      status: "PAID_LOCKED",
      claimId: null,
      message: `This date is already covered by paid reimbursement through ${lastPaidThroughDate}. Original paid claims cannot be modified directly.`,
    };
  }

  const blockingClaim = getClaimBlockingReadingDate(database, agentId, dateKey);
  if (blockingClaim) {
    return {
      status: "CLAIMED",
      claimId: blockingClaim.id,
      message: "This date is already claimed or closed for reimbursement. New odometer readings cannot be uploaded directly.",
    };
  }

  return { status: "OPEN", claimId: null, message: null };
}

function assertOdometerDateUnlocked(database: Database, agentId: string, dateKey: string) {
  const lock = getOdometerLockStatus(database, agentId, dateKey);

  if (lock.status !== "OPEN" && lock.status !== "REOPENED_FOR_CORRECTION") {
    throw new Error(lock.message ?? "This odometer date is locked.");
  }
}

function assertReadingDateIsClaimable(database: Database, agentId: string, dateKey: string) {
  const lock = getOdometerLockStatus(database, agentId, dateKey);

  if (lock.status !== "OPEN") {
    throw new Error(lock.message ?? `This photo is dated ${dateKey}, which is already locked for reimbursement.`);
  }
}

function findSessionForDate(database: Database, userId: string, dateKey: string) {
  return database.workdaySessions
    .filter((session) => session.userId === userId && session.date === dateKey)
    .sort((left, right) => compareIsoAsc(right.loginAt, left.loginAt))[0] ?? null;
}

function getOrCreateReadingSession(
  database: Database,
  user: User,
  dateKey: string,
  capturedAt: string,
  latLng: LatLng | null,
  readingType: ReadingType,
  hasExtractedTimestamp: boolean,
) {
  const todayKey = toDateKey(nowIso());
  let session: WorkdaySession | null = findSessionForDate(database, user.id, dateKey);

  if (!session && dateKey === todayKey && !hasExtractedTimestamp) {
    session = getOpenSession(database, user.id, dateKey) ?? null;
  }

  if (!session) {
    if (dateKey === todayKey && !hasExtractedTimestamp) {
      throw new Error("Start the workday before uploading odometer readings.");
    }

    session = {
      id: randomUUID(),
      userId: user.id,
      plantId: getUserPlantId(database, user.id),
      date: dateKey,
      loginAt: capturedAt,
      logoutAt: dateKey === todayKey ? null : capturedAt,
      loginLatLng: latLng,
      logoutLatLng: readingType === "END" ? latLng : null,
      status: dateKey === todayKey ? "OPEN" : "CLOSED",
    };
    database.workdaySessions.push(session);
    logAudit(database, user, "WorkdaySession", session.id, "PAST_UPLOAD", `Created workday session from odometer photo timestamp ${dateKey}.`);
    return session;
  }

  if (compareIsoAsc(capturedAt, session.loginAt) < 0) {
    session.loginAt = capturedAt;
    session.loginLatLng = latLng ?? session.loginLatLng;
  }

  if (readingType === "END" && (!session.logoutAt || compareIsoAsc(session.logoutAt, capturedAt) < 0)) {
    session.logoutAt = capturedAt;
    session.logoutLatLng = latLng ?? session.logoutLatLng;
    if (dateKey !== todayKey) {
      session.status = "CLOSED";
    }
  }

  return session;
}

function getOrCreateSiteVisitSession(
  database: Database,
  user: User,
  dateKey: string,
  visitedAt: string,
  latLng: LatLng | null,
) {
  const todayKey = toDateKey(nowIso());
  let session: WorkdaySession | null =
    dateKey === todayKey ? getOpenSession(database, user.id, dateKey) ?? null : findSessionForDate(database, user.id, dateKey);

  if (!session && dateKey === todayKey) {
    throw new Error("Start the workday before creating site visits.");
  }

  if (!session) {
    session = {
      id: randomUUID(),
      userId: user.id,
      plantId: getUserPlantId(database, user.id),
      date: dateKey,
      loginAt: visitedAt,
      logoutAt: visitedAt,
      loginLatLng: latLng,
      logoutLatLng: latLng,
      status: "CLOSED",
    };
    database.workdaySessions.push(session);
    logAudit(database, user, "WorkdaySession", session.id, "PAST_UPLOAD", `Created workday session from site visit photo timestamp ${dateKey}.`);
    return session;
  }

  if (compareIsoAsc(visitedAt, session.loginAt) < 0) {
    session.loginAt = visitedAt;
    session.loginLatLng = latLng ?? session.loginLatLng;
  }

  if (dateKey !== todayKey) {
    if (!session.logoutAt || compareIsoAsc(session.logoutAt, visitedAt) < 0) {
      session.logoutAt = visitedAt;
      session.logoutLatLng = latLng ?? session.logoutLatLng;
    }
    session.status = "CLOSED";
  }

  return session;
}

type OdometerReadingInput = {
  type: ReadingType;
  latLng: LatLng | null;
  agentEnteredReading: number;
  batchConfirmation?: string | null;
} & (
  | {
      file: File;
      uploadedObject?: never;
    }
  | {
      file?: never;
      uploadedObject: {
        s3Key: string;
        originalFileName: string;
        mimeType: string | null;
        sizeBytes?: number | null;
      };
    }
);

type UploadedS3ObjectInput = {
  s3Key: string;
  originalFileName: string;
  mimeType: string | null;
  sizeBytes?: number | null;
};

export async function createOdometerReading(user: User, input: OdometerReadingInput) {
  assertRole(user, ["SALES_AGENT"]);
  const { fileBuffer, upload, mimeType } = await prepareOdometerUpload(input);
  const ocr = await ocrService.extractOdometerValue({
    fileName: upload.originalFileName,
    localAbsolutePath: upload.localAbsolutePath,
    photoUrl: upload.photoUrl,
    inlineBytesBase64: fileBuffer.toString("base64"),
    mimeType,
  });
  const hasExtractedTimestamp = Boolean(ocr.capturedAt);
  const capturedAt = ocr.capturedAt ?? nowIso();
  const capturedDate = new Date(capturedAt);

  if (Number.isNaN(capturedDate.getTime())) {
    throw new Error("The dashboard photo timestamp could not be read.");
  }

  if (capturedDate.getTime() > Date.now() + 10 * 60 * 1000) {
    throw new Error("The dashboard photo timestamp is in the future. Upload a valid dashboard photo.");
  }

  // MOD-004: Compute image hash for duplicate detection
  const { createHash } = await import("node:crypto");
  const imageHash = createHash("sha256").update(fileBuffer).digest("hex");

  // MOD-002: Extract GPS watermark info from OCR metadata
  const gpsWatermarkText = (ocr as any).gpsWatermark ?? null;
  const gpsCapturedDate = hasExtractedTimestamp ? toDateKey(capturedAt) : null;
  const gpsCapturedLocation = (ocr as any).gpsLocation ?? null;
  const agentEnteredReading = Math.round(input.agentEnteredReading * 10) / 10;

  if (!Number.isFinite(agentEnteredReading) || agentEnteredReading < 0) {
    throw new Error("Agent-entered odometer reading is required.");
  }

  return updateDatabase((database) => {
    const readingDateKey = toDateKey(capturedAt);
    assertReadingDateIsClaimable(database, user.id, readingDateKey);
    const session = getOrCreateReadingSession(
      database,
      user,
      readingDateKey,
      capturedAt,
      input.latLng,
      input.type,
      hasExtractedTimestamp,
    );

    // MOD-004: Check for duplicate images (same hash already uploaded)
    const duplicateReading = database.odometerReadings.find(
      (entry) => entry.imageHash === imageHash && entry.status !== "DISCARDED" && entry.isActiveReading !== false,
    );

    // MOD-005: Block accidental second START/END for the same captured workday.
    const existingActiveReading = database.odometerReadings.find(
      (entry) =>
        entry.sessionId === session.id &&
        entry.type === input.type &&
        entry.isActiveReading !== false &&
        entry.status !== "DISCARDED",
    );
    if (existingActiveReading) {
      throw new Error(
        `${input.type} reading already exists for ${readingDateKey}. Discard the incorrect pending reading before final submission, or ask manager to reopen/correct the locked reading.`,
      );
    }

    const hasRecognizedMeterReading = ocr.value !== null && ACCEPTED_OCR_READING_KINDS.has(ocr.kind);
    const hasReliableReading = hasRecognizedMeterReading && ocr.confidence >= OCR_ACCEPTANCE_CONFIDENCE;
    const readingDifference = ocr.value !== null ? Math.abs(agentEnteredReading - ocr.value) : null;
    const isWithinAgentOcrTolerance = readingDifference !== null && readingDifference <= MAX_AUTO_ODOMETER_DIFF_KM;
    const confidencePercent = Math.round(ocr.confidence * 100);
    const meterLabel = ocr.kind === "UNKNOWN" ? "meter" : ocr.kind;

    // MOD-011: Determine watermark status
    const hasGpsWatermark = Boolean(gpsWatermarkText || gpsCapturedDate || input.latLng);
    const watermarkStatus = hasGpsWatermark
      ? ("PRESENT" as const)
      : gpsWatermarkText === null && !input.latLng
        ? ("MISSING" as const)
        : ("UNREADABLE" as const);

    // MOD-012: Continuity check against previous day's END reading
    const continuity = checkOdometerContinuity(database, user.id, readingDateKey, input.type, agentEnteredReading);

    // MOD-013: Determine upload source
    const todayKey = toDateKey(nowIso());
    const uploadSource = readingDateKey !== todayKey ? "PAST" : "LIVE";
    const reviewReasons = [
      !hasRecognizedMeterReading ? "OCR could not read an odometer value" : null,
      hasRecognizedMeterReading && !hasReliableReading ? `Low OCR confidence (${confidencePercent}%)` : null,
      readingDifference !== null && readingDifference > MAX_AUTO_ODOMETER_DIFF_KM
        ? `Agent/OCR mismatch ${readingDifference.toFixed(1)} km`
        : null,
      !hasExtractedTimestamp && !input.latLng ? "Captured date/GPS watermark missing" : null,
      watermarkStatus !== "PRESENT" ? `GPS watermark ${watermarkStatus.toLowerCase()}` : null,
      duplicateReading ? `Duplicate image of reading ${duplicateReading.id.slice(0, 8)}` : null,
      continuity.status !== "OK" ? `Odometer continuity ${continuity.status}` : null,
    ].filter((reason): reason is string => Boolean(reason));
    const requiresManagerReview = reviewReasons.length > 0;
    const verificationNote = requiresManagerReview
      ? [
          "Manager review required.",
          `Agent entered ${agentEnteredReading}.`,
          ocr.value === null ? "OCR value was not found." : `OCR read ${ocr.value}; difference ${readingDifference?.toFixed(1) ?? "N/A"} km.`,
          `${ocr.note} Dashboard date mapped to ${readingDateKey}.`,
          ...reviewReasons,
        ].join(" ")
      : [
          `Auto-approved agent-entered reading ${agentEnteredReading}.`,
          `OCR read ${ocr.value}; difference ${readingDifference?.toFixed(1) ?? "0.0"} km.`,
          `${ocr.note} Dashboard timestamp mapped to ${readingDateKey}.`,
        ].join(" ");

    const reading: OdometerReading = {
      id: randomUUID(),
      sessionId: session.id,
      type: input.type,
      photoUrl: upload.photoUrl,
      originalFileName: upload.originalFileName,
      capturedAt,
      capturedLatLng: input.latLng,
      ocrValue: ocr.value,
      finalValue: requiresManagerReview ? null : agentEnteredReading,
      ocrConfidence: ocr.confidence,
      status: requiresManagerReview ? "MANUAL_REVIEW_REQUIRED" : "CONFIRMED",
      verifiedBy: null,
      verificationNote,
      // MOD-001: Agent manual reading / OCR comparison
      agentEnteredReading,
      readingDifference,
      managerFinalReading: null,
      // MOD-001: Discard flow
      discardedAt: null,
      discardedBy: null,
      discardReason: null,
      discardNote: null,
      replacedByReadingId: null,
      replacesReadingId: null,
      // MOD-002: GPS watermark metadata
      gpsWatermarkText,
      gpsCapturedDate,
      gpsCapturedLocation,
      gpsAccuracy: null,
      // MOD-003: Upload metadata
      uploadedBy: user.id,
      uploadDateTime: nowIso(),
      uploadSource,
      fileSizeBytes: fileBuffer.length,
      // MOD-004: Duplicate image detection
      imageHash,
      duplicateOfReadingId: duplicateReading?.id ?? null,
      duplicateWarningAcknowledgedBy: null,
      duplicateWarningAcknowledgedAt: null,
      // MOD-005: Active reading flag
      isActiveReading: true,
      // MOD-010: Correction versioning
      correctionVersion: 1,
      previousReadingValue: null,
      correctionReason: null,
      correctionApprovedBy: null,
      correctionApprovedAt: null,
      // MOD-011: Watermark status
      hasGpsWatermark,
      watermarkStatus,
      // MOD-012: Continuity
      continuityStatus: continuity.status,
      continuityNote: continuity.note,
      // MOD-013: Manager review
      reviewReason: reviewReasons.join("; ") || null,
      managerReviewRequiredAt: requiresManagerReview ? nowIso() : null,
      managerReviewedAt: null,
      managerRemark: null,
      lockStatus: "OPEN",
      reopenedForCorrectionBy: null,
      reopenedForCorrectionAt: null,
      reopenedForCorrectionReason: null,
    };

    database.odometerReadings.unshift(reading);
    logAudit(
      database,
      user,
      "OdometerReading",
      reading.id,
      "CREATE",
      `Uploaded ${input.type.toLowerCase()} odometer reading. Agent ${agentEnteredReading}, OCR ${ocr.value ?? "N/A"}, confidence ${ocr.confidence}.${requiresManagerReview ? ` Manager review: ${reviewReasons.join("; ")}.` : " Auto-approved within tolerance."}`,
    );

    return reading;
  });
}

async function prepareOdometerUpload(input: OdometerReadingInput) {
  if (input.file) {
    const { readUploadedFileBuffer, saveUploadedFile } = await import("@/lib/storage");
    const fileBuffer = await readUploadedFileBuffer(input.file);
    const upload = await saveUploadedFile(input.file, fileBuffer);

    return {
      fileBuffer,
      upload,
      mimeType: input.file.type || null,
    };
  }

  const { buildS3PublicUrl, readS3ObjectBuffer } = await import("@/lib/storage");
  const uploadedObject = input.uploadedObject;
  const object = await readS3ObjectBuffer(uploadedObject.s3Key, { maxBytes: MAX_ODOMETER_STORED_BYTES });

  if (object.buffer.length > MAX_ODOMETER_STORED_BYTES) {
    throw new Error("The odometer photo is too large. Please retake it closer to the dashboard.");
  }

  return {
    fileBuffer: object.buffer,
    upload: {
      photoUrl: buildS3PublicUrl(uploadedObject.s3Key),
      originalFileName: uploadedObject.originalFileName || uploadedObject.s3Key.split("/").at(-1) || "odometer.webp",
      localAbsolutePath: null,
    },
    mimeType: uploadedObject.mimeType || object.contentType,
  };
}

export async function confirmOdometerReading(user: User, readingId: string) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session || session.userId !== user.id) {
      throw new Error("You can only confirm your own readings.");
    }

    assertOdometerDateUnlocked(database, user.id, toDateKey(reading.capturedAt));

    if (reading.status !== "AWAITING_CONFIRMATION") {
      throw new Error("Only readings waiting for agent confirmation can be confirmed.");
    }

    const finalValue = reading.agentEnteredReading ?? reading.ocrValue;
    if (finalValue === null || finalValue === undefined || !Number.isFinite(finalValue)) {
      throw new Error("A manual or OCR reading value is required before confirmation.");
    }

    reading.status = "CONFIRMED";
    reading.finalValue = finalValue;
    reading.lockStatus = "OPEN";
    logAudit(database, user, "OdometerReading", reading.id, "CONFIRM", `Agent confirmed final reading ${finalValue}.`);
    return reading;
  });
}

export async function rejectOdometerReading(user: User, readingId: string, note: string) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session || session.userId !== user.id) {
      throw new Error("You can only reject your own readings.");
    }

    assertOdometerDateUnlocked(database, user.id, toDateKey(reading.capturedAt));

    if (reading.status !== "AWAITING_CONFIRMATION") {
      throw new Error("Only readings waiting for agent confirmation can be sent for review.");
    }

    reading.status = "MANUAL_REVIEW_REQUIRED";
    reading.finalValue = null;
    reading.verificationNote = note || "Agent rejected OCR result.";
    logAudit(database, user, "OdometerReading", reading.id, "REJECT", reading.verificationNote);
    return reading;
  });
}

// MOD-012/014: Continuity check — previous END <= current START <= current END.

function checkOdometerContinuity(
  database: Database,
  userId: string,
  dateKey: string,
  readingType: ReadingType,
  proposedValue: number | null,
): { status: OdometerContinuityStatus; note: string | null } {
  if (proposedValue === null) {
    return { status: "OK", note: null };
  }

  if (readingType === "END") {
    const sameDaySessionIds = database.workdaySessions
      .filter((session) => session.userId === userId && session.date === dateKey)
      .map((session) => session.id);
    const startReading = [...database.odometerReadings]
      .filter(
        (entry) =>
          sameDaySessionIds.includes(entry.sessionId) &&
          entry.type === "START" &&
          entry.finalValue !== null &&
          entry.isActiveReading !== false &&
          entry.status !== "DISCARDED",
      )
      .sort((left, right) => compareIsoAsc(right.capturedAt, left.capturedAt))[0];

    if (startReading?.finalValue !== null && startReading?.finalValue !== undefined) {
      const dayDistance = Math.round((proposedValue - startReading.finalValue) * 10) / 10;
      const maxDailyDistanceKm = getConfiguredMaxDailyDistanceKm();

      if (dayDistance < 0) {
        return {
          status: "REVERSAL",
          note: `END reading (${proposedValue}) is less than START reading (${startReading.finalValue}) for ${dateKey}. Negative same-day distance is not allowed.`,
        };
      }

      if (dayDistance === 0 && shouldZeroDistanceRequireManagerReview()) {
        return {
          status: "GAP",
          note: `Same-day distance is 0 km for ${dateKey}. Manager review and a valid no-travel remark are required before reimbursement.`,
        };
      }

      if (dayDistance > maxDailyDistanceKm) {
        return {
          status: "GAP",
          note: `Same-day distance ${dayDistance} km is above the configured normal field threshold of ${maxDailyDistanceKm} km. Manager review required.`,
        };
      }
    }
    return { status: "OK", note: null };
  }

  const allSessions = database.workdaySessions
    .filter((session) => session.userId === userId && session.date < dateKey)
    .sort((left, right) => right.date.localeCompare(left.date));

  if (!allSessions.length) {
    return { status: "OK", note: null };
  }

  const previousSession = allSessions[0];
  if (!previousSession) {
    return { status: "OK", note: null };
  }

  const previousEndReading = [...database.odometerReadings]
    .filter(
      (entry) =>
        entry.sessionId === previousSession.id &&
        entry.type === "END" &&
        entry.finalValue !== null &&
        entry.isActiveReading !== false &&
        entry.status !== "DISCARDED",
    )
    .sort((left, right) => compareIsoAsc(right.capturedAt, left.capturedAt))[0];

  if (previousEndReading?.finalValue === null || previousEndReading?.finalValue === undefined) {
    return { status: "OK", note: null };
  }

  const diff = Math.round((proposedValue - previousEndReading.finalValue) * 10) / 10;
  const maxDailyDistanceKm = getConfiguredMaxDailyDistanceKm();

  if (diff < 0) {
    return {
      status: "REVERSAL",
      note: `START reading (${proposedValue}) is less than previous END reading (${previousEndReading.finalValue}) from ${previousSession.date}. Possible odometer reversal, wrong image, wrong vehicle, or old photo.`,
    };
  }

  if (diff > maxDailyDistanceKm) {
    return {
      status: "GAP",
      note: `Gap of ${diff} km between previous END (${previousEndReading.finalValue}) on ${previousSession.date} and current START (${proposedValue}) is above the configured threshold of ${maxDailyDistanceKm} km. Manager review required.`,
    };
  }

  return { status: "OK", note: null };
}

// MOD-001: Agent discards an odometer reading (never deleted, just marked DISCARDED)
export async function discardOdometerReading(
  user: User,
  readingId: string,
  input: { reason: OdometerDiscardReason; note: string },
) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session || session.userId !== user.id) {
      throw new Error("You can only discard your own readings.");
    }

    if (reading.status === "DISCARDED") {
      throw new Error("This reading has already been discarded.");
    }

    // MOD-008: Prevent discard if this date is already claimed
    const readingDateKey = toDateKey(reading.capturedAt);
    assertOdometerDateUnlocked(database, user.id, readingDateKey);

    const now = nowIso();
    reading.status = "DISCARDED";
    reading.isActiveReading = false;
    reading.discardedAt = now;
    reading.discardedBy = user.id;
    reading.discardReason = input.reason;
    reading.discardNote = input.note.trim() || null;
    reading.finalValue = null;
    logAudit(
      database,
      user,
      "OdometerReading",
      reading.id,
      "DISCARDED",
      `Agent discarded reading: ${input.reason}. ${input.note.trim()}`,
    );
    return reading;
  });
}

// MOD-001: Agent manually enters an odometer reading value and system computes difference
export async function submitAgentManualReading(user: User, readingId: string, manualValue: number) {
  assertRole(user, ["SALES_AGENT"]);

  if (!Number.isFinite(manualValue) || manualValue < 0) {
    throw new Error("Manual reading must be a non-negative number.");
  }

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session || session.userId !== user.id) {
      throw new Error("You can only update your own readings.");
    }

    assertOdometerDateUnlocked(database, user.id, toDateKey(reading.capturedAt));

    reading.agentEnteredReading = manualValue;
    reading.readingDifference = reading.ocrValue !== null ? Math.abs(manualValue - reading.ocrValue) : null;

    if (
      reading.ocrValue !== null &&
      reading.readingDifference !== null &&
      reading.readingDifference <= MAX_AUTO_ODOMETER_DIFF_KM &&
      reading.status === "AWAITING_CONFIRMATION"
    ) {
      reading.finalValue = manualValue;
      reading.status = "CONFIRMED";
      reading.verificationNote = `Agent entered manual reading: ${manualValue}. OCR was: ${reading.ocrValue ?? "N/A"}. Difference: ${reading.readingDifference ?? "N/A"}.`;
    } else if (reading.status === "MANUAL_REVIEW_REQUIRED" || reading.status === "AWAITING_CONFIRMATION") {
      reading.finalValue = null;
      reading.status = "MANUAL_REVIEW_REQUIRED";
      reading.reviewReason = `Agent/OCR mismatch ${reading.readingDifference ?? "N/A"} km or OCR missing.`;
      reading.managerReviewRequiredAt = nowIso();
      reading.verificationNote = `Agent entered manual reading: ${manualValue}. OCR was: ${reading.ocrValue ?? "N/A"}. Difference: ${reading.readingDifference ?? "N/A"}. Manager review required.`;
    }

    logAudit(
      database,
      user,
      "OdometerReading",
      reading.id,
      "AGENT_MANUAL_ENTRY",
      `Agent entered manual reading: ${manualValue}. OCR value: ${reading.ocrValue}. Difference: ${reading.readingDifference}.`,
    );
    return reading;
  });
}

// MOD-009 / MOD-012: Manager-only scoped reopen for claimed odometer dates.
// This does not unlock all old dates. It only reopens one selected reading/date/type.
export async function reopenOdometerReadingForCorrection(
  user: User,
  readingId: string,
  reason: string,
) {
  assertRole(user, ["MANAGER"]);

  const reopenReason = reason.trim();
  if (!reopenReason) {
    throw new Error("Reopen reason is required.");
  }

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    if (reading.status === "DISCARDED") {
      throw new Error("Discarded readings cannot be reopened for correction.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session) {
      throw new Error("Workday session for this odometer reading was not found.");
    }

    const workdayDate = session.date ?? toDateKey(reading.capturedAt);
    const lock = getOdometerLockStatus(database, session.userId, workdayDate);

    if (lock.status === "PAID_LOCKED") {
      throw new Error("Paid reimbursement dates cannot be reopened directly. Use paid correction adjustment instead.");
    }

    const sameDayReadings = database.odometerReadings.filter(
      (entry) =>
        entry.sessionId === session.id &&
        entry.isActiveReading !== false &&
        entry.status !== "DISCARDED",
    );

    const startReading = sameDayReadings.find((entry) => entry.type === "START") ?? null;
    const endReading = sameDayReadings.find((entry) => entry.type === "END") ?? null;
    const now = nowIso();

    reading.lockStatus = "REOPENED_FOR_CORRECTION";
    reading.reopenedForCorrectionBy = user.id;
    reading.reopenedForCorrectionAt = now;
    reading.reopenedForCorrectionReason = reopenReason;

    database.odometerCorrections ??= [];
    const reopenEntry = {
      id: randomUUID(),
      readingId: reading.id,
      version: reading.correctionVersion ?? 1,
      type: "REOPEN" as const,
      oldValue: reading.finalValue,
      newValue: null,
      reason: reopenReason,
      approvedBy: user.id,
      approvedAt: now,
      createdBy: user.id,
      createdAt: now,
      linkedClaimId: lock.claimId,
      dateKey: workdayDate,
      status: "REOPENED" as const,

      agentId: session.userId,
      workdayDate,
      readingType: reading.type,
      reopenScope: "SINGLE_DATE_SINGLE_TYPE" as const,
      reopenedBy: user.id,
      reopenedAt: now,

      oldStartReadingId: startReading?.id ?? null,
      oldEndReadingId: endReading?.id ?? null,
      oldStartValue: startReading?.finalValue ?? null,
      oldEndValue: endReading?.finalValue ?? null,

      selectedReadingId: reading.id,
      newReadingId: null,
    };

    database.odometerCorrections.unshift(reopenEntry);

    logAudit(
      database,
      user,
      "OdometerReading",
      reading.id,
      "REOPEN_FOR_CORRECTION",
      `Manager reopened ${reading.type} reading for ${workdayDate}. Reason: ${reopenReason}.`,
    );

    return {
      reading,
      reopenEntry,
    };
  });
}

// MOD-010 / MOD-012: Correct an odometer reading using immutable versioning.
// Old reading becomes inactive. New corrected reading becomes active.
// Paid claims are still handled through createPaidOdometerCorrectionAdjustment().
export async function correctOdometerReading(
  user: User,
  readingId: string,
  input: { newValue: number; reason: string },
) {
  assertRole(user, ["MANAGER"]);

  if (!Number.isFinite(input.newValue) || input.newValue < 0) {
    throw new Error("Corrected reading must be a non-negative number.");
  }

  const correctionReason = input.reason.trim();
  if (!correctionReason) {
    throw new Error("Correction reason is required.");
  }

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    if (reading.status === "DISCARDED") {
      throw new Error("Cannot correct a discarded reading.");
    }

    if (reading.isActiveReading === false) {
      throw new Error("This reading is already inactive. Correct the current active reading instead.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session) {
      throw new Error("Workday session for this odometer reading was not found.");
    }

    const readingDateKey = session.date ?? toDateKey(reading.capturedAt);
    const lock = getOdometerLockStatus(database, session.userId, readingDateKey);

    if (lock.status === "PAID_LOCKED") {
      throw new Error("Paid reimbursement dates cannot be directly modified. Create a paid reimbursement adjustment instead.");
    }

    if (lock.status === "CLAIMED" && reading.lockStatus !== "REOPENED_FOR_CORRECTION") {
      throw new Error("This claimed date must be reopened by manager before correction.");
    }

    const now = nowIso();
    const previousValue = reading.finalValue;
    const previousVersion = reading.correctionVersion ?? 1;

    const newReading: OdometerReading = {
      ...reading,
      id: randomUUID(),

      finalValue: Math.round(input.newValue * 10) / 10,
      managerFinalReading: Math.round(input.newValue * 10) / 10,
      agentEnteredReading: reading.agentEnteredReading ?? null,

      previousReadingValue: previousValue,
      correctionVersion: previousVersion + 1,
      correctionReason,
      correctionApprovedBy: user.id,
      correctionApprovedAt: now,

      status: "MANUAL_VERIFIED",
      verifiedBy: user.id,
      verificationNote: `Manager correction version ${previousVersion + 1}. Previous value: ${previousValue ?? "N/A"}. New value: ${input.newValue}. Reason: ${correctionReason}.`,
      managerReviewedAt: now,
      managerRemark: correctionReason,
      reviewReason: null,

      lockStatus: "OPEN",
      reopenedForCorrectionBy: reading.reopenedForCorrectionBy,
      reopenedForCorrectionAt: reading.reopenedForCorrectionAt,
      reopenedForCorrectionReason: reading.reopenedForCorrectionReason,

      replacesReadingId: reading.id,
      replacedByReadingId: null,
      isActiveReading: true,
    };

    reading.isActiveReading = false;
    reading.replacedByReadingId = newReading.id;
    reading.lockStatus = "REOPENED_FOR_CORRECTION";

    database.odometerReadings.unshift(newReading);

    database.odometerCorrections ??= [];
    database.odometerCorrections.unshift({
      id: randomUUID(),
      readingId: reading.id,
      version: previousVersion,
      type: "READING_UPDATE",
      oldValue: previousValue,
      newValue: newReading.finalValue,
      reason: correctionReason,
      approvedBy: user.id,
      approvedAt: now,
      createdBy: user.id,
      createdAt: now,
      linkedClaimId: lock.claimId,
      dateKey: readingDateKey,
      status: "APPLIED",

      agentId: session.userId,
      workdayDate: readingDateKey,
      readingType: reading.type,
      reopenScope: "SINGLE_DATE_SINGLE_TYPE",
      reopenedBy: reading.reopenedForCorrectionBy ?? user.id,
      reopenedAt: reading.reopenedForCorrectionAt ?? now,

      oldStartReadingId: reading.type === "START" ? reading.id : null,
      oldEndReadingId: reading.type === "END" ? reading.id : null,
      oldStartValue: reading.type === "START" ? previousValue : null,
      oldEndValue: reading.type === "END" ? previousValue : null,

      selectedReadingId: reading.id,
      newReadingId: newReading.id,
    });

    logAudit(
      database,
      user,
      "OdometerReading",
      newReading.id,
      "CORRECTION_VERSION_CREATED",
      `Manager corrected ${reading.type} reading for ${readingDateKey}. Old reading ${reading.id} inactive, new reading ${newReading.id} active. Previous value: ${previousValue}. New value: ${newReading.finalValue}. Reason: ${correctionReason}.`,
    );

    return newReading;
  });
}

// MOD-010: Paid odometer correction workflow. Paid claims are not edited directly;
// a separate reimbursement adjustment entry is created for accounting approval/settlement.
export async function createPaidOdometerCorrectionAdjustment(
  user: User,
  readingId: string,
  input: { newValue: number; reason: string },
) {
  assertRole(user, ["MANAGER"]);

  if (!Number.isFinite(input.newValue) || input.newValue < 0) {
    throw new Error("Corrected reading must be a non-negative number.");
  }

  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Correction reason is required.");
  }

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);
    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session) {
      throw new Error("The workday session for this reading could not be found.");
    }

    const workdayDate = session.date ?? toDateKey(reading.capturedAt);
    const paidClaim = database.reimbursementClaims.find(
      (claim) =>
        claim.agentId === session.userId &&
        claim.status === "PAID" &&
        claim.lineItems.some((line) => line.date === workdayDate),
    );

    if (!paidClaim) {
      throw new Error("No paid reimbursement claim was found for this reading date. Use normal manager correction before payment.");
    }

    const line = paidClaim.lineItems.find((entry) => entry.date === workdayDate);
    if (!line) {
      throw new Error("The paid claim line item for this reading date could not be found.");
    }

    const correctedStart = reading.type === "START" ? input.newValue : line.startReading;
    const correctedEnd = reading.type === "END" ? input.newValue : line.endReading;
    const correctedDistanceKm = Math.round((correctedEnd - correctedStart) * 10) / 10;

    if (correctedDistanceKm < 0) {
      throw new Error("Corrected paid claim distance cannot be negative. Manager review must fix START/END pairing first.");
    }

    const originalDistanceKm = line.distanceKm;
    const distanceDifferenceKm = Math.round((correctedDistanceKm - originalDistanceKm) * 10) / 10;
    const originalAmount = Math.round(line.fuelAmount * 100) / 100;
    const correctedAmount = Math.round(correctedDistanceKm * FUEL_REIMBURSEMENT_RATE * 100) / 100;
    const adjustmentAmount = Math.round((correctedAmount - originalAmount) * 100) / 100;
    const now = nowIso();
    const correctionRequestId = randomUUID();

    database.odometerCorrections ??= [];
    database.odometerCorrections.unshift({
      id: correctionRequestId,
      readingId: reading.id,
      version: reading.correctionVersion ?? 1,
      type: "REIMBURSEMENT_ADJUSTMENT",
      oldValue: reading.finalValue,
      newValue: input.newValue,
      reason,
      approvedBy: null,
      approvedAt: null,
      createdBy: user.id,
      createdAt: now,
      linkedClaimId: paidClaim.id,
      dateKey: workdayDate,
      status: "PENDING_MANAGER_REOPEN",
    });

    database.reimbursementAdjustments ??= [];
    const adjustment = {
      id: randomUUID(),
      agentId: session.userId,
      workdayDate,
      originalClaimId: paidClaim.id,
      correctionRequestId,
      readingId: reading.id,
      readingType: reading.type,
      originalDistanceKm,
      correctedDistanceKm,
      distanceDifferenceKm,
      originalAmount,
      correctedAmount,
      adjustmentAmount,
      adjustmentType: adjustmentAmount >= 0 ? ("EXTRA_PAYABLE" as const) : ("RECOVERY" as const),
      status: "PENDING_ACCOUNTING_APPROVAL" as const,
      reason,
      requestedBy: user.id,
      requestedAt: now,
      approvedBy: null,
      approvedAt: null,
      settledInClaimId: null,
      settledBy: null,
      settledAt: null,
      remark: null,
    };
    database.reimbursementAdjustments.unshift(adjustment);

    reading.lockStatus = "PAID_LOCKED";
    reading.correctionReason = reason;
    reading.reopenedForCorrectionBy = user.id;
    reading.reopenedForCorrectionAt = now;
    reading.reopenedForCorrectionReason = reason;

    logAudit(
      database,
      user,
      "ReimbursementAdjustment",
      adjustment.id,
      "CREATE",
      `Created paid odometer correction adjustment for ${workdayDate}: distance ${originalDistanceKm} -> ${correctedDistanceKm}, amount adjustment ${adjustmentAmount}.`,
    );

    return adjustment;
  });
}

export async function decideReimbursementAdjustment(
  user: User,
  adjustmentId: string,
  decision: "APPROVED" | "REJECTED",
  remark: string,
) {
  assertRole(user, ["ACCOUNTING", "MANAGER"]);

  return updateDatabase((database) => {
    const adjustment = (database.reimbursementAdjustments ?? []).find((entry) => entry.id === adjustmentId);
    if (!adjustment) {
      throw new Error("Reimbursement adjustment not found.");
    }
    if (adjustment.status !== "PENDING_ACCOUNTING_APPROVAL") {
      throw new Error("Only pending reimbursement adjustments can be approved or rejected.");
    }

    const now = nowIso();
    adjustment.status = decision;
    adjustment.approvedBy = decision === "APPROVED" ? user.id : null;
    adjustment.approvedAt = decision === "APPROVED" ? now : null;
    adjustment.remark = remark.trim() || null;

    logAudit(database, user, "ReimbursementAdjustment", adjustment.id, decision, remark.trim() || decision);
    return adjustment;
  });
}

export async function settleReimbursementAdjustment(
  user: User,
  adjustmentId: string,
  input: { settledInClaimId?: string | null; remark?: string | null },
) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const adjustment = (database.reimbursementAdjustments ?? []).find((entry) => entry.id === adjustmentId);
    if (!adjustment) {
      throw new Error("Reimbursement adjustment not found.");
    }
    if (adjustment.status !== "APPROVED") {
      throw new Error("Only approved reimbursement adjustments can be settled.");
    }

    adjustment.status = "SETTLED";
    adjustment.settledInClaimId = input.settledInClaimId?.trim() || null;
    adjustment.settledBy = user.id;
    adjustment.settledAt = nowIso();
    adjustment.remark = input.remark?.trim() || adjustment.remark;

    logAudit(database, user, "ReimbursementAdjustment", adjustment.id, "SETTLED", adjustment.remark || "Adjustment settled.");
    return adjustment;
  });
}

// MOD-004: Acknowledge duplicate image warning
export async function acknowledgeDuplicateOdometerWarning(user: User, readingId: string) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    if (!reading.duplicateOfReadingId) {
      throw new Error("This reading does not have a duplicate warning.");
    }

    const now = nowIso();
    reading.duplicateWarningAcknowledgedBy = user.id;
    reading.duplicateWarningAcknowledgedAt = now;
    logAudit(
      database,
      user,
      "OdometerReading",
      reading.id,
      "DUPLICATE_ACKNOWLEDGED",
      `Manager acknowledged duplicate image warning for reading ${reading.duplicateOfReadingId.slice(0, 8)}.`,
    );
    return reading;
  });
}

// MOD-013 (enhanced): Manager verifies an odometer reading with structured reason
export async function managerVerifyOdometerReading(
  user: User,
  readingId: string,
  input: { value: number; remark: string },
) {
  assertRole(user, ["MANAGER"]);

  if (!Number.isFinite(input.value) || input.value < 0) {
    throw new Error("Verified reading must be a non-negative number.");
  }

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    if (reading.status !== "MANUAL_REVIEW_REQUIRED") {
      throw new Error("Only readings pending manual review can be verified by manager.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (session) {
      const lock = getOdometerLockStatus(database, session.userId, session.date);
      if (lock.status === "PAID_LOCKED") {
        throw new Error("Paid reimbursement dates cannot be directly modified. Create an adjustment request outside the original paid claim.");
      }
    }

    const now = nowIso();
    reading.finalValue = input.value;
    reading.managerFinalReading = input.value;
    reading.status = "MANUAL_VERIFIED";
    reading.verifiedBy = user.id;
    reading.managerReviewedAt = now;
    reading.managerRemark = input.remark.trim() || "Manager verified reading.";
    reading.verificationNote = `Manager verified. Value set to ${input.value}. ${input.remark.trim()}`;
    reading.reviewReason = null;

    logAudit(
      database,
      user,
      "OdometerReading",
      reading.id,
      "MANAGER_VERIFIED",
      `Manager set final value to ${input.value}. ${input.remark.trim()}`,
    );
    return reading;
  });
}

// MOD-007/013: Compute daily summary for an agent
export function computeOdometerDaySummary(database: Database, agentId: string, dateKey: string): OdometerDaySummary {
  const agent = database.users.find((entry) => entry.id === agentId);
  const session = database.workdaySessions.find(
    (entry) => entry.userId === agentId && entry.date === dateKey,
  );
  const readings = database.odometerReadings.filter(
    (entry) =>
      entry.sessionId === session?.id &&
      entry.isActiveReading !== false &&
      entry.status !== "DISCARDED",
  );
  const startReading = readings.find((entry) => entry.type === "START" && entry.finalValue !== null);
  const endReading = [...readings].reverse().find((entry) => entry.type === "END" && entry.finalValue !== null);
  const visits = database.siteVisits.filter((entry) => entry.sessionId === session?.id);
  const corrections = database.odometerCorrections?.filter(
    (entry) => readings.some((reading) => reading.id === entry.readingId),
  ).length ?? 0;
  const totalKm =
    startReading?.finalValue != null && endReading?.finalValue != null
      ? Math.max(endReading.finalValue - startReading.finalValue, 0)
      : null;
  const hasStart = startReading?.finalValue != null;
  const hasEnd = endReading?.finalValue != null;
  const dayStatus = hasStart && hasEnd
    ? "COMPLETE"
    : hasStart
      ? "INCOMPLETE_END"
      : hasEnd
        ? "INCOMPLETE_START"
        : "INCOMPLETE_BOTH";
  const continuityIssues = readings.filter((entry) => entry.continuityStatus && entry.continuityStatus !== "OK");
  const missingProofs: string[] = [];
  if (!hasStart) missingProofs.push("START reading");
  if (!hasEnd) missingProofs.push("END reading");
  readings.forEach((reading) => {
    if (reading.watermarkStatus === "MISSING") missingProofs.push(`GPS watermark on ${reading.type}`);
  });
  const claimId = getClaimIdForSession(database, session?.id ?? "");

  return {
    date: dateKey,
    agentId,
    agentName: agent?.name ?? "Unknown",
    startReading: startReading?.finalValue ?? null,
    endReading: endReading?.finalValue ?? null,
    totalKm,
    siteVisits: visits.length,
    dayStatus,
    continuityStatus: continuityIssues.length > 0 ? continuityIssues[0]?.continuityStatus ?? "OK" : "OK",
    missingProofs,
    corrections,
    claimStatus: claimId ? "CLAIMED" : null,
    hasLateUpload: readings.some((entry) => entry.uploadSource === "PAST"),
  };
}

// MOD-022: Close a site
export async function closeSite(
  user: User,
  siteId: string,
  input: { reason: string; remarks: string },
) {
  assertRole(user, ["SALES_AGENT", "MANAGER"]);

  return updateDatabase((database) => {
    const site = database.leadSites.find((entry) => entry.id === siteId);
    if (!site) {
      throw new Error("Site not found.");
    }
    if (site.siteStatus === "DEAD" || site.siteStatus === "LOST") {
      throw new Error("Site is already closed.");
    }

    const now = nowIso();
    site.closureReason = input.reason.trim();
    site.closureRemarks = input.remarks.trim() || null;

    if (user.role === "MANAGER") {
      site.siteStatus = input.reason === "LOST" ? "LOST" : "DEAD";
      site.closedBy = user.id;
      site.closedAt = now;
      site.closureApprovedBy = user.id;
      site.closureApprovedAt = now;
      logAudit(database, user, "LeadSite", site.id, "SITE_CLOSED", `Site closed: ${input.reason}. ${input.remarks.trim()}`);
    } else {
      site.closedBy = null;
      site.closedAt = null;
      site.closureApprovedBy = null;
      site.closureApprovedAt = null;
      logAudit(database, user, "LeadSite", site.id, "SITE_CLOSURE_REQUESTED", `Agent requested site closure: ${input.reason}. ${input.remarks.trim()}`);
    }

    return site;
  });
}

// MOD-022: Reopen a closed site
export async function reopenSite(
  user: User,
  siteId: string,
  reason: string,
) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const site = database.leadSites.find((entry) => entry.id === siteId);
    if (!site) {
      throw new Error("Site not found.");
    }
    if (site.siteStatus === "ACTIVE") {
      throw new Error("Site is already active.");
    }

    const now = nowIso();
    site.siteStatus = "ACTIVE";
    site.reopenedBy = user.id;
    site.reopenedAt = now;
    site.reopenReason = reason.trim() || "Manager reopened site.";
    // Clear closure fields
    site.closedBy = null;
    site.closedAt = null;
    site.closureApprovedBy = null;
    site.closureApprovedAt = null;

    logAudit(database, user, "LeadSite", site.id, "SITE_REOPENED", `Site reopened: ${reason.trim()}`);
    return site;
  });
}

// MOD-022: Close a lead (all sites)
export async function closeLead(
  user: User,
  leadId: string,
  input: { reason: string; remarks: string },
) {
  assertRole(user, ["SALES_AGENT", "MANAGER"]);

  return updateDatabase((database) => {
    const lead = database.leads.find((entry) => entry.id === leadId);
    if (!lead) {
      throw new Error("Lead not found.");
    }

    if (user.role === "SALES_AGENT" && lead.agentId !== user.id) {
      throw new Error("You can only close your own leads.");
    }

    const now = nowIso();
    lead.closureReason = input.reason.trim();
    lead.closureRemarks = input.remarks.trim() || null;
    lead.closureRequestedBy = lead.closureRequestedBy ?? user.id;
    lead.closureRequestedAt = lead.closureRequestedAt ?? now;

    if (user.role === "MANAGER") {
      lead.stage = input.reason === "LOST" ? "LOST" : "DEAD";
      lead.closedBy = user.id;
      lead.closedAt = now;
      lead.closureApprovedBy = user.id;
      lead.closureApprovedAt = now;
      lead.closureStatus = "APPROVED_CLOSED";

      // Close all active sites for this lead only after manager approval.
      database.leadSites
        .filter((site) => site.leadId === leadId && site.siteStatus === "ACTIVE")
        .forEach((site) => {
          site.siteStatus = lead.stage === "LOST" ? "LOST" : "DEAD";
          site.closureReason = input.reason.trim();
          site.closedBy = user.id;
          site.closedAt = now;
          site.closureApprovedBy = user.id;
          site.closureApprovedAt = now;
        });

      logAudit(database, user, "Lead", lead.id, "LEAD_CLOSED", `Lead closed: ${input.reason}. ${input.remarks.trim()}`);
    } else {
      lead.closureApprovedBy = null;
      lead.closureApprovedAt = null;
      lead.closedBy = null;
      lead.closedAt = null;
      lead.closureStatus = "PENDING_MANAGER_APPROVAL";
      logAudit(database, user, "Lead", lead.id, "LEAD_CLOSURE_REQUESTED", `Agent requested lead closure: ${input.reason}. ${input.remarks.trim()}`);
    }
    return lead;
  });
}

export async function rejectLeadClosure(
  user: User,
  leadId: string,
  reason: string,
) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const lead = database.leads.find((entry) => entry.id === leadId);
    if (!lead) {
      throw new Error("Lead not found.");
    }

    if (lead.closureStatus !== "PENDING_MANAGER_APPROVAL") {
      throw new Error("Only pending lead closure requests can be rejected.");
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new Error("Manager rejection reason is required.");
    }

    lead.closureStatus = "REJECTED";
    lead.closureApprovedBy = user.id;
    lead.closureApprovedAt = nowIso();
    lead.closedBy = null;
    lead.closedAt = null;
    lead.reopenReason = trimmedReason;
    logAudit(database, user, "Lead", lead.id, "LEAD_CLOSURE_REJECTED", trimmedReason);
    return lead;
  });
}

export async function reopenLead(
  user: User,
  leadId: string,
  reason: string,
) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const lead = database.leads.find((entry) => entry.id === leadId);
    if (!lead) {
      throw new Error("Lead not found.");
    }

    const now = nowIso();
    lead.stage = "TALKS";
    lead.closureReason = null;
    lead.closureRemarks = null;
    lead.closedBy = null;
    lead.closedAt = null;
    lead.closureApprovedBy = null;
    lead.closureApprovedAt = null;
    lead.reopenedBy = user.id;
    lead.reopenedAt = now;
    lead.reopenReason = reason.trim() || "Manager reopened lead.";
    lead.closureStatus = "OPEN";
    database.leadSites
      .filter((site) => site.leadId === leadId && (site.siteStatus === "DEAD" || site.siteStatus === "LOST"))
      .forEach((site) => {
        site.siteStatus = "ACTIVE";
        site.reopenedBy = user.id;
        site.reopenedAt = now;
        site.reopenReason = lead.reopenReason;
      });
    logAudit(database, user, "Lead", lead.id, "LEAD_REOPENED", lead.reopenReason);
    return lead;
  });
}

export async function recordSiteDirectionUse(user: User, siteId: string) {
  assertRole(user, ["SALES_AGENT", "MANAGER"]);

  return updateDatabase((database) => {
    const site = database.leadSites.find((entry) => entry.id === siteId);
    if (!site) {
      throw new Error("Site not found.");
    }

    const lead = database.leads.find((entry) => entry.id === site.leadId);
    if (user.role === "SALES_AGENT" && lead?.agentId !== user.id) {
      throw new Error("You can only open directions for your own sites.");
    }

    const locationCorrectionInfo = getSiteLocationCorrectionInfo(site);

    if (!site.latLng && !site.siteAddress?.trim()) {
      throw new Error("This site has no coordinates or address. Update site location before opening Mappls directions.");
    }

    site.directionsUsageCount = (site.directionsUsageCount ?? 0) + 1;
    site.directionsLastUsedAt = nowIso();
    site.lastDirectionsUsedBy = user.id;

    logAudit(
      database,
      user,
      "LeadSite",
      site.id,
      "DIRECTIONS_OPENED",
      `Opened Mappls directions for ${site.siteName}. ${
        locationCorrectionInfo.locationCorrectionRequired
          ? locationCorrectionInfo.locationCorrectionReason
          : "Coordinates available."
      }`,
    );
    return site;
  });
}

function getSiteLocationCorrectionInfo(site: Pick<LeadSite, "latLng" | "siteAddress">) {
  if (site.latLng) {
    return {
      locationCorrectionRequired: false,
      locationCorrectionReason: null,
    };
  }

  if (site.siteAddress?.trim()) {
    return {
      locationCorrectionRequired: true,
      locationCorrectionReason:
        "Site coordinates are missing. Mappls directions may use address fallback, but site GPS location should be corrected.",
    };
  }

  return {
    locationCorrectionRequired: true,
    locationCorrectionReason:
      "Both site coordinates and address are missing. This site needs location correction before reliable map usage.",
  };
}

function getLeadStagePinColor(stage: LeadStage): MapPinColor {
  if (stage === "FINALIZED") {
    return "GREEN";
  }

  if (stage === "NEGOTIATING") {
    return "YELLOW";
  }

  if (stage === "MISSED") {
    return "ORANGE";
  }

  if (stage === "DEAD") {
    return "GRAY";
  }

  if (stage === "LOST") {
    return "RED";
  }

  return "BLUE";
}

function buildSiteMapMarkers(database: Database, user: User): SiteMapMarker[] {
  const visibleLeads = database.leads.filter((lead) => user.role !== "SALES_AGENT" || lead.agentId === user.id);
  const visibleLeadIds = new Set(visibleLeads.map((lead) => lead.id));

  return database.leadSites
    .filter((site) => visibleLeadIds.has(site.leadId))
    .map((site) => {
      const lead = visibleLeads.find((entry) => entry.id === site.leadId);
      const leadStage = lead?.stage ?? "TALKS";
      const primaryStakeholder = site.stakeholders.find((stakeholder) => stakeholder.role !== "FOUND_NO_ONE" && stakeholder.name.trim()) ?? null;
      const locationCorrectionInfo = getSiteLocationCorrectionInfo(site);
      return {
        siteId: site.id,
        leadId: site.leadId,
        plantId: site.plantId,
        siteName: site.siteName,
        siteAddress: site.siteAddress,
        siteStatus: site.siteStatus ?? "ACTIVE",
        leadStage,
        pinColor: getLeadStagePinColor(leadStage),
        latLng: site.latLng,
        stakeholderMasterId: primaryStakeholder?.stakeholderMasterId ?? null,
        stakeholderName: primaryStakeholder?.name ?? null,
        stakeholderPhone: primaryStakeholder?.phone ?? null,
        phoneVerificationStatus: primaryStakeholder?.phoneVerificationStatus ?? null,
        grade: site.currentConcreteGrade,
        quantityCum: site.currentQuantityCum,
        lastVisitedAt: site.lastVisitedAt,
        missingLocation: !site.latLng,
        locationCorrectionRequired: locationCorrectionInfo.locationCorrectionRequired,
        locationCorrectionReason: locationCorrectionInfo.locationCorrectionReason,
        directionsUsageCount: site.directionsUsageCount ?? 0,
        directionsLastUsedAt: site.directionsLastUsedAt ?? null,
      } satisfies SiteMapMarker;
    })
    .sort((left, right) => compareIsoAsc(right.lastVisitedAt, left.lastVisitedAt));
}

export async function getSiteMapMarkersForUser(user: User): Promise<SiteMapMarker[]> {
  assertRole(user, ["SALES_AGENT", "MANAGER", "PRODUCTION_MANAGER"]);
  const database =
    user.role === "SALES_AGENT"
      ? await getAgentScopedDashboardDatabase(user, { sections: ["leads"] })
      : await getManagerScopedDashboardDatabase();

  return buildSiteMapMarkers(database, user);
}

function normalizeStakeholders(input: string) {
  const normalized = input.trim();

  if (!normalized) {
    return [] as StakeholderContact[];
  }

  try {
    const parsed = JSON.parse(normalized) as Array<{
      role?: string;
      label?: string;
      name?: string;
      phone?: string;
    }>;

    if (Array.isArray(parsed)) {
      return parsed
        .map<StakeholderContact | null>((entry) => {
          const role = normalizeStakeholderRole(entry.role);
          const name = `${entry.name ?? ""}`.trim();
          const phone = normalizeStakeholderPhone(`${entry.phone ?? ""}`, role);
          const label = `${entry.label ?? ""}`.trim() || getStakeholderLabel(role);

          if (role !== "FOUND_NO_ONE" && !name) {
            return null;
          }

          return {
            label,
            name,
            phone,
            role,
          };
        })
        .filter((entry): entry is StakeholderContact => Boolean(entry));
    }
  } catch {
    // Fall back to the older newline format so existing submissions still work.
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map<StakeholderContact>((line, index) => {
      const legacyRoles: Array<StakeholderContact["role"]> = ["CONTRACTOR", "OWNER_BUILDER", "SITE_SUPERVISOR"];
      const role = legacyRoles[index] ?? "OTHERS";
      const [name = "", rawPhone = ""] = line.split(",").map((part) => part.trim());
      const phone = normalizeStakeholderPhone(rawPhone, role);

      return {
        label: getStakeholderLabel(role),
        name,
        phone,
        role,
      };
    });
}

function normalizeStakeholderPhone(value: string, role: StakeholderContact["role"]) {
  const digits = value.replace(/\D/g, "").slice(-10);

  if (role === "FOUND_NO_ONE") {
    return digits;
  }

  if (digits.length !== 10 || INVALID_PHONE_PATTERNS.has(digits) || !/^[6-9]/.test(digits)) {
    throw new Error("Stakeholder phone must be a valid 10 digit Indian mobile number starting with 6, 7, 8, or 9.");
  }

  return digits;
}

function hasMeaningfulStakeholder(stakeholders: StakeholderContact[]) {
  return stakeholders.some((entry) => entry.role !== "FOUND_NO_ONE" && entry.name.trim() && entry.phone.trim());
}

function dedupeStakeholders(stakeholders: StakeholderContact[]) {
  const seen = new Set<string>();

  return stakeholders.filter((entry) => {
    const key = `${entry.role ?? entry.label}:${entry.name.toLowerCase()}:${entry.phone}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function upsertStakeholderMasters(
  database: Database,
  user: User,
  stakeholders: StakeholderContact[],
  leadId: string,
  siteId: string,
  now: string,
) {
  database.stakeholderMasters ??= [];

  return stakeholders.map((stakeholder) => {
    if (stakeholder.role === "FOUND_NO_ONE" || !stakeholder.name.trim() || !stakeholder.phone.trim()) {
      return stakeholder;
    }

    const role = normalizeStakeholderRole(stakeholder.role);
    const existing = database.stakeholderMasters.find((entry) => entry.phone === stakeholder.phone) ?? null;
    const master: StakeholderMaster =
      existing ??
      {
        id: randomUUID(),
        name: stakeholder.name.trim(),
        phone: stakeholder.phone,
        role,
        phoneVerificationStatus: "UNVERIFIED",
        phoneVerifiedAt: null,
        lastCallVerificationAt: null,
        lastWhatsappVerificationAt: null,
        lastVerificationError: null,
        linkedSiteIds: [],
        linkedLeadIds: [],
        billingResponsibility: role === "CONTRACTOR" ? "CONTRACTOR" : role === "OWNER_BUILDER" ? "BUILDER" : "NOT_SET",
        materialScope: "",
        gstin: null,
        pan: null,
        billingAddress: null,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      };

    master.name = stakeholder.name.trim();
    master.role = role;
    master.updatedAt = now;
    if (!master.linkedSiteIds.includes(siteId)) {
      master.linkedSiteIds.push(siteId);
    }
    if (!master.linkedLeadIds.includes(leadId)) {
      master.linkedLeadIds.push(leadId);
    }
    if (!existing) {
      database.stakeholderMasters.push(master);
      logAudit(database, user, "StakeholderMaster", master.id, "CREATE", `Created stakeholder ${master.name} for site ${siteId.slice(0, 8)}.`);
    }

    return {
      ...stakeholder,
      role,
      phoneVerificationStatus: stakeholder.phoneVerificationStatus ?? master.phoneVerificationStatus,
      phoneVerifiedAt: stakeholder.phoneVerifiedAt ?? master.phoneVerifiedAt,
      stakeholderMasterId: master.id,
      contactPresence: stakeholder.contactPresence ?? "PRESENT",
    };
  });
}

function canVerifyStakeholder(user: User, database: Database, stakeholder: StakeholderMaster) {
  if (user.role !== "SALES_AGENT") {
    return true;
  }

  return stakeholder.linkedLeadIds.some((leadId) => database.leads.some((lead) => lead.id === leadId && lead.agentId === user.id));
}

function getStakeholderPrimaryContext(database: Database, stakeholder: StakeholderMaster) {
  const site =
    stakeholder.linkedSiteIds
      .map((siteId) => database.leadSites.find((entry) => entry.id === siteId))
      .find((entry): entry is LeadSite => Boolean(entry)) ?? null;
  const lead = site ? database.leads.find((entry) => entry.id === site.leadId) ?? null : null;

  return {
    site,
    lead,
    siteName: site?.siteName ?? lead?.siteName ?? "",
  };
}

function syncStakeholderContactVerification(database: Database, stakeholder: StakeholderMaster) {
  for (const site of database.leadSites) {
    site.stakeholders = site.stakeholders.map((contact) => {
      const sameMaster = contact.stakeholderMasterId && contact.stakeholderMasterId === stakeholder.id;
      const samePhone = contact.phone === stakeholder.phone;
      if (!sameMaster && !samePhone) {
        return contact;
      }

      return {
        ...contact,
        stakeholderMasterId: stakeholder.id,
        phoneVerificationStatus: stakeholder.phoneVerificationStatus,
        phoneVerifiedAt: stakeholder.phoneVerifiedAt,
      };
    });
  }

  for (const visit of database.siteVisits) {
    visit.stakeholders = visit.stakeholders.map((contact) => {
      const sameMaster = contact.stakeholderMasterId && contact.stakeholderMasterId === stakeholder.id;
      const samePhone = contact.phone === stakeholder.phone;
      if (!sameMaster && !samePhone) {
        return contact;
      }

      return {
        ...contact,
        stakeholderMasterId: stakeholder.id,
        phoneVerificationStatus: stakeholder.phoneVerificationStatus,
        phoneVerifiedAt: stakeholder.phoneVerifiedAt,
      };
    });
  }
}

export async function requestStakeholderContactVerification(user: User, stakeholderMasterId: string, channel: ContactVerificationChannel) {
  assertRole(user, ["SALES_AGENT", "MANAGER"]);

  const { stakeholder, message, siteId, leadId } = await updateDatabase((database) => {
    database.contactVerificationEvents ??= [];
    database.stakeholderMasters ??= [];
    const target = database.stakeholderMasters.find((entry) => entry.id === stakeholderMasterId);
    if (!target) {
      throw new Error("Stakeholder was not found.");
    }
    if (!canVerifyStakeholder(user, database, target)) {
      throw new Error("You can only verify stakeholders linked to your own leads.");
    }

    const context = getStakeholderPrimaryContext(database, target);
    return {
      stakeholder: { ...target },
      message: buildVerificationMessage(channel, target.name, context.siteName),
      siteId: context.site?.id ?? null,
      leadId: context.lead?.id ?? context.site?.leadId ?? null,
    };
  });

  const result = channel === "CALL"
    ? await placeCallVerification(stakeholder.phone, message)
    : await sendWhatsappVerification(stakeholder.phone, message);

  return updateDatabase((database) => {
    database.contactVerificationEvents ??= [];
    const target = database.stakeholderMasters.find((entry) => entry.id === stakeholderMasterId);
    if (!target) {
      throw new Error("Stakeholder was not found.");
    }
    if (!canVerifyStakeholder(user, database, target)) {
      throw new Error("You can only verify stakeholders linked to your own leads.");
    }

    const now = nowIso();
    const eventStatus: ContactVerificationStatus =
      channel === "WHATSAPP" && result.status === "SENT" ? "VERIFIED" : result.status;
    const event: ContactVerificationEvent = {
      id: randomUUID(),
      stakeholderMasterId: target.id,
      leadId,
      siteId,
      phone: target.phone,
      channel,
      provider: result.provider,
      status: eventStatus,
      providerMessageId: result.providerMessageId,
      error: result.error,
      requestedBy: user.id,
      requestedAt: now,
      verifiedAt: eventStatus === "VERIFIED" ? now : null,
      metadata: result.metadata,
    };

    database.contactVerificationEvents.unshift(event);
    target.updatedAt = now;
    target.lastVerificationError = eventStatus === "VERIFIED" ? null : result.error;

    if (channel === "CALL") {
      target.lastCallVerificationAt = now;
      target.phoneVerificationStatus = result.status === "SENT" ? "CALL_INITIATED" : result.status === "FAILED" ? "FAILED" : target.phoneVerificationStatus;
    } else {
      target.lastWhatsappVerificationAt = now;
      target.phoneVerificationStatus =
        result.status === "SENT" ? "VERIFIED" : result.status === "FAILED" ? "FAILED" : target.phoneVerificationStatus;
      target.phoneVerifiedAt = result.status === "SENT" ? now : target.phoneVerifiedAt;
    }

    syncStakeholderContactVerification(database, target);
    logAudit(
      database,
      user,
      "StakeholderMaster",
      target.id,
      `${channel}_VERIFICATION_${result.status}`,
      `${channel === "CALL" ? "Call" : "WhatsApp"} verification ${eventStatus.toLowerCase()} for ${target.name}.`,
    );

    return { stakeholder: target, event };
  });
}

export async function markStakeholderContactVerified(user: User, stakeholderMasterId: string, channel: ContactVerificationChannel) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    database.contactVerificationEvents ??= [];
    const target = database.stakeholderMasters.find((entry) => entry.id === stakeholderMasterId);
    if (!target) {
      throw new Error("Stakeholder was not found.");
    }

    const now = nowIso();
    target.phoneVerificationStatus = channel === "WHATSAPP" ? "VERIFIED" : "CALL_VERIFIED";
    target.phoneVerifiedAt = now;
    target.updatedAt = now;
    target.lastVerificationError = null;
    syncStakeholderContactVerification(database, target);

    database.contactVerificationEvents.unshift({
      id: randomUUID(),
      stakeholderMasterId: target.id,
      leadId: target.linkedLeadIds[0] ?? null,
      siteId: target.linkedSiteIds[0] ?? null,
      phone: target.phone,
      channel,
      provider: "manual",
      status: "VERIFIED",
      providerMessageId: null,
      error: null,
      requestedBy: user.id,
      requestedAt: now,
      verifiedAt: now,
    });

    logAudit(database, user, "StakeholderMaster", target.id, `${channel}_VERIFIED`, `Marked ${target.name} as verified by ${channel.toLowerCase()}.`);
    return target;
  });
}

export async function recordWhatsappVerificationReply(input: {
  phone: string;
  text: string;
  provider: string;
  providerMessageId?: string | null;
  verified: boolean;
  metadata?: Record<string, unknown>;
}) {
  const phone = input.phone.replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return { matched: false, verified: false, reason: "Invalid phone number." };
  }

  return updateDatabase((database) => {
    database.contactVerificationEvents ??= [];
    database.stakeholderMasters ??= [];
    const target = database.stakeholderMasters.find((entry) => entry.phone === phone);
    if (!target) {
      return { matched: false, verified: false, reason: "No stakeholder matched this WhatsApp number." };
    }

    const now = nowIso();
    const latestSentEvent = database.contactVerificationEvents.find(
      (entry) => entry.stakeholderMasterId === target.id && entry.channel === "WHATSAPP" && entry.status === "SENT",
    );

    database.contactVerificationEvents.unshift({
      id: randomUUID(),
      stakeholderMasterId: target.id,
      leadId: target.linkedLeadIds[0] ?? null,
      siteId: target.linkedSiteIds[0] ?? null,
      phone: target.phone,
      channel: "WHATSAPP",
      provider: input.provider,
      status: input.verified ? "VERIFIED" : "RECEIVED",
      providerMessageId: input.providerMessageId ?? null,
      error: input.verified ? null : `Received WhatsApp reply "${input.text.slice(0, 80)}" without confirmation keyword.`,
      requestedBy: "whatsapp-webhook",
      requestedAt: now,
      verifiedAt: input.verified ? now : null,
      metadata: input.metadata,
    });

    if (input.verified) {
      target.phoneVerificationStatus = "VERIFIED";
      target.phoneVerifiedAt = now;
      target.lastWhatsappVerificationAt = now;
      target.lastVerificationError = null;
      if (latestSentEvent) {
        latestSentEvent.status = "VERIFIED";
        latestSentEvent.verifiedAt = now;
        latestSentEvent.error = null;
      }
      logAudit(database, { id: "whatsapp-webhook", role: "MANAGER" } as User, "StakeholderMaster", target.id, "WHATSAPP_VERIFIED", `WhatsApp reply verified ${target.name}.`);
    } else {
      target.lastWhatsappVerificationAt = now;
      target.lastVerificationError = `Received WhatsApp reply without confirmation keyword: ${input.text.slice(0, 80)}`;
      logAudit(database, { id: "whatsapp-webhook", role: "MANAGER" } as User, "StakeholderMaster", target.id, "WHATSAPP_REPLY_RECEIVED", `Received WhatsApp reply from ${target.name}.`);
    }

    target.updatedAt = now;
    syncStakeholderContactVerification(database, target);
    return { matched: true, verified: input.verified, stakeholder: target };
  });
}

function getDuplicateSiteMatch(database: Database, site: Pick<LeadSite, "id" | "leadId" | "latLng" | "siteName" | "stakeholders">) {
  const siteName = site.siteName.trim().toLowerCase();
  const stakeholderPhones = new Set(site.stakeholders.map((entry) => entry.phone).filter(Boolean));
  let strongest: { site: LeadSite; strength: "WEAK" | "MODERATE" | "STRONG"; distance: number | null } | null = null;

  for (const candidate of database.leadSites) {
    if (candidate.id === site.id) {
      continue;
    }

    const candidatePhones = new Set(candidate.stakeholders.map((entry) => entry.phone).filter(Boolean));
    const sharesPhone = [...stakeholderPhones].some((phone) => candidatePhones.has(phone));
    const sameName = siteName && candidate.siteName.trim().toLowerCase() === siteName;
    const meters = site.latLng && candidate.latLng ? Math.round(distanceMeters(site.latLng, candidate.latLng)) : null;
    const strength =
      sharesPhone || (sameName && meters !== null && meters <= NEARBY_SITE_STRONG_MATCH_METERS)
        ? "STRONG"
        : meters !== null && meters <= NEARBY_SITE_MODERATE_MATCH_METERS
          ? "MODERATE"
          : sameName
            ? "WEAK"
            : null;

    if (!strength) {
      continue;
    }

    if (!strongest || strength === "STRONG" || (strength === "MODERATE" && strongest.strength === "WEAK")) {
      strongest = { site: candidate, strength, distance: meters };
    }
  }

  return strongest;
}

function getLeadContactSummary(stakeholders: StakeholderContact[]) {
  const contractor = stakeholders.find((entry) => entry.role === "CONTRACTOR" && entry.name.trim());
  const ownerBuilder = stakeholders.find((entry) => entry.role === "OWNER_BUILDER" && entry.name.trim());
  const supervisor =
    stakeholders.find((entry) => entry.role === "SITE_SUPERVISOR" && entry.name.trim()) ??
    stakeholders.find((entry) => entry.role === "SITE_ENGINEER" && entry.name.trim());

  return {
    contractorName: contractor?.name ?? "",
    builderName: ownerBuilder?.name ?? "",
    supervisorName: supervisor?.name ?? "",
    supervisorPhone: supervisor?.phone ?? "",
  };
}

function normalizeCurrentSupplier(input: string) {
  return input
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(" | ");
}

function syncLeadSummaryFromSite(
  lead: Lead,
  site: LeadSite,
  visit: Pick<SiteVisit, "visitedAt" | "leadStage" | "nextFollowUpAt" | "score" | "futureScope">,
) {
  const shouldRefreshSummary = !lead.lastVisitedAt || compareIsoAsc(lead.lastVisitedAt, visit.visitedAt) <= 0;
  if (!shouldRefreshSummary) {
    return;
  }

  const contactSummary = getLeadContactSummary(site.stakeholders);

  lead.siteName = site.siteName;
  lead.siteAddress = site.siteAddress;
  lead.score = visit.score;
  lead.stage = visit.leadStage;
  lead.nextFollowUpAt = visit.nextFollowUpAt;
  lead.lastVisitedAt = visit.visitedAt;
  lead.currentSupplier = site.currentSupplier;
  lead.futureScope = visit.futureScope;
  lead.currentConcreteGrade = site.currentConcreteGrade;
  lead.currentQuantityCum = site.currentQuantityCum;
  lead.contractorName = contactSummary.contractorName;
  lead.builderName = contactSummary.builderName;
  lead.supervisorName = contactSummary.supervisorName;
  lead.supervisorPhone = contactSummary.supervisorPhone;
  lead.primarySiteId = site.id;
  lead.primarySiteLatLng = site.latLng;
}

function isSiteMetadataMissingError(input: {
  siteId: string | null;
  siteAddress: string;
}) {
  return !input.siteId && !input.siteAddress.trim();
}

export async function createSiteVisit(
  user: User,
  input: {
    file?: File;
    uploadedObject?: UploadedS3ObjectInput;
    leadId?: string | null;
    siteId?: string | null;
    siteName: string;
    siteAddress: string;
    stakeholders: string;
    concreteGrade: string;
    quantityCum: number;
    stageOfWork: string;
    futureScope: string;
    currentSupplier: string;
    priceExpectation?: string;
    expectedSupplyWindow: ExpectedSupplyWindow | null;
    score?: number | null;
    leadStage?: LeadStage | null;
    nextFollowUpAt?: string | null;
    latLng: LatLng | null;
    detectedLatLng: LatLng | null;
    photoWatermarkAddress: string;
    photoCapturedAt: string | null;
    remarksText: string;
    remarksTranscriptText?: string;
    remarksVoiceNoteFile?: File | null;
    remarksVoiceNoteObject?: UploadedS3ObjectInput | null;
  },
) {
  assertRole(user, ["SALES_AGENT"]);
  const upload = await prepareSiteVisitUpload(input);
  const baseStakeholders = dedupeStakeholders(normalizeStakeholders(input.stakeholders));

  const stakeholderPhoneValidations = (baseStakeholders as any[]).map((stakeholder) => {
    const rawPhone = getStakeholderPhoneValue(stakeholder);
    return {
      stakeholder,
      ...validateStakeholderPhoneForSiteVisit(rawPhone),
    };
  });

  const invalidStakeholderPhoneReasons = stakeholderPhoneValidations
    .filter((entry) => entry.reviewRequired)
    .map((entry) => entry.reason)
    .filter((reason): reason is string => Boolean(reason));

  const stakeholdersWithNormalizedPhones = (baseStakeholders as any[]).map((stakeholder) => {
    const validation = validateStakeholderPhoneForSiteVisit(getStakeholderPhoneValue(stakeholder));
    const whatsappStatus = getInitialWhatsAppAvailabilityStatus();

    return {
      ...stakeholder,
      phone: validation.normalizedPhone || stakeholder.phone,
      phoneVerificationStatus: validation.isValid ? "UNVERIFIED" : "INVALID",
      phoneVerificationReason: validation.reason,
      whatsappCheckStatus: validation.isValid ? whatsappStatus.whatsappCheckStatus : "NOT_AVAILABLE",
      whatsappCheckMethod: whatsappStatus.whatsappCheckMethod,
      whatsappCheckNote: whatsappStatus.whatsappCheckNote,
      callVerificationStatus: "NOT_STARTED",
    };
  });

  const stakeholders = stakeholdersWithNormalizedPhones as any;
  const metadataFallback =
    !input.photoWatermarkAddress.trim() || !input.photoCapturedAt || !input.detectedLatLng
      ? await ocrService.extractSiteVisitMetadata({
          fileName: upload.originalFileName,
          localAbsolutePath: upload.localAbsolutePath,
          photoUrl: upload.photoUrl,
          inlineBytesBase64: upload.fileBuffer?.toString("base64"),
          mimeType: upload.mimeType,
        })
      : null;
  const remarksVoiceNoteUpload = await prepareSiteVisitVoiceNoteUpload(input);
  const transcript = remarksVoiceNoteUpload && !input.remarksTranscriptText?.trim()
    ? await ocrService.transcribeVoiceNote({
        fileName: remarksVoiceNoteUpload.originalFileName || "voice-note",
        localAbsolutePath: remarksVoiceNoteUpload.localAbsolutePath,
        photoUrl: remarksVoiceNoteUpload.photoUrl,
        inlineBytesBase64: remarksVoiceNoteUpload.fileBuffer?.toString("base64"),
        mimeType: remarksVoiceNoteUpload.mimeType,
      })
    : null;
  const typedRemarksText = input.remarksText.trim();
  const transcriptText = input.remarksTranscriptText?.trim() || transcript?.text?.trim() || "";
  const remarksText =
    transcriptText && typedRemarksText.toLowerCase().includes(transcriptText.toLowerCase())
      ? typedRemarksText
      : [typedRemarksText, transcriptText].filter(Boolean).join("\n\n");
  const resolvedSiteAddress = `${input.siteAddress || metadataFallback?.siteAddress || input.photoWatermarkAddress || ""}`.trim();
  const detectedLatLng = input.detectedLatLng ?? metadataFallback?.latLng ?? null;
  const detectedAddress = `${input.photoWatermarkAddress || metadataFallback?.siteAddress || resolvedSiteAddress}`.trim();
  const visitedAt = input.photoCapturedAt ?? metadataFallback?.capturedAt ?? nowIso();
  // MOD-016/018: lead stage must be backend-calculated, not trusted from agent input.
  const resolvedLeadStage = suggestLeadStage({
    expectedSupplyWindow: input.expectedSupplyWindow,
    stakeholders,
  });
  const resolvedNextFollowUpAt =
    input.nextFollowUpAt ??
    suggestNextFollowUp({
      baseIso: visitedAt,
      expectedSupplyWindow: input.expectedSupplyWindow,
    });
  const resolvedCurrentSupplier = normalizeCurrentSupplier(input.currentSupplier);
  const normalizedConcreteGrade = normalizeConcreteGradeForVisit(input.concreteGrade);
  // MOD-016/018: lead score must be backend-calculated, not trusted from agent input.
  const resolvedScore = suggestLeadScore({
    expectedSupplyWindow: input.expectedSupplyWindow,
    stakeholders,
    currentSupplier: resolvedCurrentSupplier,
  });
  const arrivalPhotoHash = upload.fileBuffer
    ? createHash("sha256").update(upload.fileBuffer).digest("hex")
    : upload.photoUrl;

  if (isSiteMetadataMissingError({ siteId: input.siteId ?? null, siteAddress: resolvedSiteAddress })) {
    throw new Error("The site address could not be read from the GPS watermark. Upload a clearer GPS camera photo or choose an existing site.");
  }

  return updateDatabase((database) => {
    const visitDateKey = toDateKey(visitedAt);
    const session = getOrCreateSiteVisitSession(
      database,
      user,
      visitDateKey,
      visitedAt,
      input.latLng ?? detectedLatLng ?? null,
    );

    const leadId = input.leadId?.trim() || randomUUID();
    let lead = database.leads.find((entry) => entry.id === leadId);

    if (!lead) {
      lead = {
        id: leadId,
        agentId: user.id,
        plantId: session.plantId,
        siteName: input.siteName,
        siteAddress: resolvedSiteAddress,
        score: resolvedScore,
        stage: resolvedLeadStage,
        nextFollowUpAt: resolvedNextFollowUpAt,
        lastVisitedAt: visitedAt,
        currentSupplier: resolvedCurrentSupplier,
        priceExpectation: input.priceExpectation?.trim() || "",
        futureScope: input.futureScope,
        contractorName: "",
        builderName: "",
        supervisorName: "",
        supervisorPhone: "",
        currentConcreteGrade: normalizedConcreteGrade,
        currentQuantityCum: input.quantityCum,
        primarySiteId: null,
        primarySiteLatLng: null,
        siteCount: 0,
      };
      database.leads.push(lead);
    }

    let site =
      input.siteId?.trim()
        ? database.leadSites.find((entry) => entry.id === input.siteId && entry.leadId === lead.id)
        : null;

    const isNewSite = !site;
    const savedLatLngBeforeVisit = site?.latLng ?? null;

    if (!site) {
      site = {
        id: randomUUID(),
        leadId: lead.id,
        plantId: lead.plantId,
        siteName: input.siteName,
        siteAddress: resolvedSiteAddress,
        latLng: detectedLatLng ?? input.latLng ?? null,
        stakeholders,
        currentSupplier: resolvedCurrentSupplier,
        expectedSupplyWindow: input.expectedSupplyWindow,
        futureScope: input.futureScope,
        currentConcreteGrade: normalizedConcreteGrade,
        currentQuantityCum: input.quantityCum,
        score: resolvedScore,
        createdAt: visitedAt,
        updatedAt: visitedAt,
        lastVisitedAt: visitedAt,
        siteStatus: "ACTIVE",
        closureReason: null,
        closureRemarks: null,
        closedBy: null,
        closedAt: null,
        closureApprovedBy: null,
        closureApprovedAt: null,
        reopenedBy: null,
        reopenedAt: null,
        reopenReason: null,
        mergedIntoSiteId: null,
        directionsLastUsedAt: null,
        directionsUsageCount: 0,
        lastDirectionsUsedBy: null,
      };
      database.leadSites.push(site);
    } else {
      if (site.siteStatus === "DEAD" || site.siteStatus === "LOST" || site.siteStatus === "MERGED") {
        throw new Error("This site is inactive. Ask manager to reopen or choose another active site.");
      }

      site.siteName = input.siteName.trim() || site.siteName;
      site.siteAddress = resolvedSiteAddress || site.siteAddress;
      site.latLng = detectedLatLng ?? input.latLng ?? site.latLng ?? null;
      site.stakeholders = dedupeStakeholders([...site.stakeholders, ...stakeholders]);
      site.expectedSupplyWindow = input.expectedSupplyWindow;
      site.futureScope = input.futureScope;
      site.currentConcreteGrade = normalizedConcreteGrade;
      site.currentQuantityCum = input.quantityCum;
      site.score = resolvedScore;
      if (compareIsoAsc(site.lastVisitedAt, visitedAt) < 0) {
        site.lastVisitedAt = visitedAt;
      }
      site.updatedAt = nowIso();

      if (resolvedCurrentSupplier) {
        site.currentSupplier = resolvedCurrentSupplier;
      }
    }

    const now = nowIso();
    site.stakeholders = upsertStakeholderMasters(database, user, dedupeStakeholders(site.stakeholders), lead.id, site.id, now);
    const duplicateMatch = getDuplicateSiteMatch(database, site);

    const sameDaySessionIds = database.workdaySessions
      .filter((entry) => entry.userId === user.id && entry.date === visitDateKey)
      .map((entry) => entry.id);
    const existingActiveVisit = database.siteVisits.find(
      (entry) =>
        sameDaySessionIds.includes(entry.sessionId) &&
        entry.siteId === site.id &&
        entry.activeVisitStatus !== "CANCELLED",
    );
    if (existingActiveVisit) {
      throw new Error("A site visit for this agent, site, and captured date already exists. Add a manager-approved revisit reason instead of creating a duplicate visit.");
    }

    const foundNoOneRepeatCount = database.siteVisits.filter((entry) => {
      if (entry.siteId !== site.id || entry.contactPresenceStatus !== "FOUND_NO_ONE") {
        return false;
      }

      const entrySession = database.workdaySessions.find((sessionEntry) => sessionEntry.id === entry.sessionId);
      return entrySession?.userId === user.id;
    }).length;

    const verification: { status: SiteLocationVerificationStatus; distanceMeters: number | null } =
      isNewSite || !input.siteId
        ? {
            status: "NOT_APPLICABLE" as SiteLocationVerificationStatus,
            distanceMeters: null,
          }
        : getLocationVerification({
            savedLatLng: savedLatLngBeforeVisit,
            detectedLatLng,
          });
    const gpsReviewStatus =
      verification.status === "MATCHED" || verification.status === "NOT_APPLICABLE"
        ? "AUTO_APPROVED"
        : "PENDING_REVIEW";

    const photoReused = database.siteVisits.some(
      (entry) => entry.arrivalPhotoHash && entry.arrivalPhotoHash === arrivalPhotoHash,
    );
    const locationSeverity = getSiteVisitLocationSeverity(verification.distanceMeters);
    const gradeRequiresReview =
      !APPROVED_CONCRETE_GRADES.has(normalizedConcreteGrade) || normalizedConcreteGrade === "OTHER";
    const quantityRequiresReview = isUnusualSiteVisitQuantity(input.quantityCum);
    const missingGpsProof =
      !detectedLatLng || !visitedAt || !detectedAddress || !input.photoCapturedAt;

    const stakeholderPhonesForDuplicateCheck = getVisitStakeholderPhones(stakeholders as any);

    const duplicatePhoneMatches = stakeholderPhonesForDuplicateCheck.flatMap((phone) => {
      const matches: string[] = [];

      for (const existingVisit of database.siteVisits) {
        const existingStakeholders = Array.isArray((existingVisit as any).stakeholders)
          ? ((existingVisit as any).stakeholders as any[])
          : [];

        const existingPhones = getVisitStakeholderPhones(existingStakeholders);

        if (existingPhones.includes(phone)) {
          matches.push(`Phone ${phone} already used in site visit ${existingVisit.id}`);
        }
      }

      for (const existingSite of database.leadSites ?? []) {
        const sitePhone = normalizePhoneForDuplicateCheck(
          (existingSite as any).stakeholderPhone ??
            (existingSite as any).phone ??
            (existingSite as any).contactPhone ??
            (existingSite as any).primaryStakeholderPhone ??
            null,
        );

        if (sitePhone === phone) {
          matches.push(
            `Phone ${phone} already linked with site ${
              (existingSite as any).siteName ?? existingSite.id
            }`,
          );
        }
      }

      for (const existingLead of database.leads ?? []) {
        const leadPhone = normalizePhoneForDuplicateCheck(
          (existingLead as any).stakeholderPhone ??
            (existingLead as any).phone ??
            (existingLead as any).contactPhone ??
            (existingLead as any).primaryStakeholderPhone ??
            null,
        );

        if (leadPhone === phone) {
          matches.push(
            `Phone ${phone} already linked with lead ${
              (existingLead as any).leadName ?? (existingLead as any).name ?? existingLead.id
            }`,
          );
        }
      }

      return matches;
    });

    const revisitDateKey = getSiteVisitDateKey(visitedAt ?? input.photoCapturedAt ?? null);

    const hasRevisitReason = Boolean((input as any).revisitReason?.trim?.());

    const sameAgentSiteDateVisit = database.siteVisits.find((existingVisit) => {
      if (existingVisit.siteId !== site.id) {
        return false;
      }

      const existingStatus = `${(existingVisit as any).status ?? ""}`.toUpperCase();
      if (existingStatus === "DISCARDED" || existingStatus === "REJECTED") {
        return false;
      }

      const existingSession = database.workdaySessions.find(
        (session) => session.id === existingVisit.sessionId,
      );

      if (existingSession?.userId !== user.id) {
        return false;
      }

      const existingVisitDate = getSiteVisitDateKey(
        (existingVisit as any).visitedAt ?? (existingVisit as any).createdAt ?? null,
      );

      return existingVisitDate === revisitDateKey;
    });

    const isNewSiteUnderExistingLead = Boolean((input as any).leadId) && !(input as any).siteId;

    const nearbySameLeadSite =
      isNewSiteUnderExistingLead && detectedLatLng
        ? (database.leadSites ?? []).find((existingSite) => {
            if (existingSite.leadId !== (input as any).leadId || existingSite.id === site.id) {
              return false;
            }

            const existingLat = Number(
              (existingSite as any).latitude ??
                (existingSite as any).lat ??
                (existingSite as any).siteLat ??
                (existingSite as any).gpsLat,
            );

            const existingLng = Number(
              (existingSite as any).longitude ??
                (existingSite as any).lng ??
                (existingSite as any).siteLng ??
                (existingSite as any).gpsLng,
            );

            if (!Number.isFinite(existingLat) || !Number.isFinite(existingLng)) {
              return false;
            }

            const distance = distanceMeters(
              { lat: detectedLatLng.lat, lng: detectedLatLng.lng },
              { lat: existingLat, lng: existingLng }
            );

            return distance <= 300;
          })
        : null;

    const managerReviewReasons = [
      missingGpsProof ? "GPS/date/location proof is missing or unreadable from site visit photo" : null,
      gpsReviewStatus === "PENDING_REVIEW" ? `GPS ${verification.status}` : null,
      locationSeverity === "REVIEW" ? `Location mismatch is ${verification.distanceMeters} meters and requires manager review` : null,
      locationSeverity === "CRITICAL" ? `Critical location mismatch is ${verification.distanceMeters} meters and requires manager approval` : null,
      sameAgentSiteDateVisit && !hasRevisitReason
        ? `A site visit already exists for this agent/site on ${revisitDateKey}; manager review or revisit reason required`
        : null,
      duplicatePhoneMatches.length
        ? `Stakeholder phone already exists elsewhere: ${duplicatePhoneMatches.slice(0, 3).join("; ")}`
        : null,
      nearbySameLeadSite
        ? `New site under existing lead is near existing site ${
            (nearbySameLeadSite as any).siteName ?? nearbySameLeadSite.id
          }; manager approval required`
        : null,
      invalidStakeholderPhoneReasons.length
        ? `Stakeholder phone validation issue: ${invalidStakeholderPhoneReasons.slice(0, 3).join("; ")}`
        : null,
      duplicateMatch?.strength === "STRONG" ? `Strong duplicate candidate ${duplicateMatch.site.siteName}` : null,
      duplicateMatch?.strength === "MODERATE" ? `Possible duplicate site near ${duplicateMatch.site.siteName}` : null,
      photoReused ? "Possible reused site visit photo detected" : null,
      !hasMeaningfulStakeholder(stakeholders) ? "No meaningful stakeholder met" : null,
      foundNoOneRepeatCount >= 2 ? "Repeated Found No One entries for this site need manager review" : null,
      gradeRequiresReview ? `Concrete grade ${normalizedConcreteGrade} needs manager review` : null,
      quantityRequiresReview ? `Quantity ${input.quantityCum} cum is unusual and needs manager review` : null,
    ].filter((reason): reason is string => Boolean(reason));
    const followUpTaskId = resolvedNextFollowUpAt
      ? randomUUID()
      : null;

    // TODO: Google Contacts sync status fields are not present in SiteVisit type. Actual sync should be added only after OAuth design.
    const visit: SiteVisit = {
      id: randomUUID(),
      sessionId: session.id,
      leadId: lead.id,
      siteId: site.id,
      plantId: lead.plantId,
      siteName: site.siteName,
      siteAddress: site.siteAddress,
      arrivalPhotoUrl: upload.photoUrl,
      visitedAt,
      latLng: input.latLng,
      detectedLatLng,
      stakeholders,
      concreteGrade: normalizedConcreteGrade,
      quantityCum: input.quantityCum,
      stageOfWork: input.stageOfWork,
      futureScope: input.futureScope,
      currentSupplier: site.currentSupplier,
      expectedSupplyWindow: input.expectedSupplyWindow,
      priceExpectation: input.priceExpectation?.trim() || lead.priceExpectation,
      score: resolvedScore,
      leadStage: resolvedLeadStage,
      nextFollowUpAt: resolvedNextFollowUpAt,
      remarksText,
      remarksVoiceNoteUrl: remarksVoiceNoteUpload?.photoUrl ?? null,
      photoWatermarkAddress: detectedAddress || null,
      locationVerificationStatus: verification.status,
      locationVerificationDistanceMeters: verification.distanceMeters,
      capturedDate: toDateKey(visitedAt),
      uploadDate: toDateKey(now),
      isLateSync: toDateKey(visitedAt) !== toDateKey(now),
      gpsReviewStatus,
      gpsReviewNote: managerReviewReasons.join("; ") || null,
      gpsReviewedBy: null,
      gpsReviewedAt: null,
      activeVisitStatus: "COMPLETED",
      visitStartedAt: visitedAt,
      visitCompletedAt: visitedAt,
      cancelledAt: null,
      cancelReason: null,
      duplicateMatchStrength: duplicateMatch?.strength ?? "NONE",
      duplicateMatchedSiteId: duplicateMatch?.site.id ?? null,
      duplicateOverrideReason: null,
      productivityTag: photoReused || locationSeverity === "CRITICAL" || locationSeverity === "REVIEW"
        ? "SUSPICIOUS"
        : !hasMeaningfulStakeholder(stakeholders)
          ? "LOW_QUALITY"
          : resolvedNextFollowUpAt
            ? "FOLLOW_UP_NEEDED"
            : "PRODUCTIVE",
      arrivalPhotoHash,
      isPhotoReused: photoReused,
      editHistory: [],
      contactPresenceStatus: hasMeaningfulStakeholder(stakeholders) ? "PRESENT" : "FOUND_NO_ONE",
      followUpTaskId,
      managerReviewRequired: managerReviewReasons.length > 0,
      managerReviewReason: managerReviewReasons.join("; ") || null,
    };

    lead.priceExpectation = input.priceExpectation?.trim() || lead.priceExpectation;
    syncLeadSummaryFromSite(lead, site, visit);
    lead.siteCount = database.leadSites.filter((entry) => entry.leadId === lead.id).length;

    database.siteVisits.unshift(visit);
    if (followUpTaskId) {
      database.tasks.unshift({
        id: followUpTaskId,
        plantId: lead.plantId,
        subject: `Follow up: ${site.siteName}`,
        explanation: `Auto follow-up from site visit on ${toDateKey(visitedAt)}. ${remarksText.slice(0, 160)}`,
        deadline: resolvedNextFollowUpAt,
        status: "OPEN",
        assignedTo: user.id,
        assignedBy: user.id,
      });
    }
    logAudit(database, user, "SiteVisit", visit.id, "CREATE", `Recorded site visit for ${site.siteName}.`);
    return visit;
  });
}

export async function updateSiteVisit(
  user: User,
  visitId: string,
  input: {
    stageOfWork?: string;
    futureScope?: string;
    concreteGrade?: string;
    quantityCum?: number;
    leadStage?: LeadStage;
    nextFollowUpAt?: string;
    expectedSupplyWindow?: ExpectedSupplyWindow | null;
    remarksText?: string;
  },
) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const visit = database.siteVisits.find((entry) => entry.id === visitId);

    if (!visit) {
      throw new Error("Site visit not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === visit.sessionId);
    if (!session || session.userId !== user.id) {
      throw new Error("You can only edit your own site visit reports.");
    }

    const phoneEditFields = ["phone", "phoneNumber", "mobile", "stakeholderPhone", "contactPhone"];

    const attemptedPhoneEditFields = phoneEditFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(input as any, field),
    );

    if (attemptedPhoneEditFields.length > 0) {
      visit.editHistory ??= [];

      visit.editHistory.push({
        id: randomUUID(),
        field: "REMARKS",
        oldValue: "",
        newValue: attemptedPhoneEditFields.join(", "),
        editedBy: user.id,
        editedAt: nowIso(),
        reason: "Attempted stakeholder phone edit requires manager review and cannot be silently applied.",
      });

      visit.managerReviewRequired = true;
      visit.managerReviewReason = [
        visit.managerReviewReason,
        `Stakeholder phone edit attempted for fields: ${attemptedPhoneEditFields.join(", ")}. Manager review required.`,
      ]
        .filter(Boolean)
        .join("; ");
    }

    const lockedProofFields = [
      "arrivalPhotoUrl",
      "arrivalPhotoHash",
      "arrivalPhotoName",
      "photoCapturedAt",
      "capturedAt",
      "visitedAt",
      "detectedLatLng",
      "capturedLat",
      "capturedLng",
      "latitude",
      "longitude",
      "gpsVerificationStatus",
      "locationVerificationStatus",
      "managerReviewRequired",
      "managerReviewReason",
      "managerApprovalStatus",
      "sessionId",
      "agentId",
      "createdBy",
      "createdAt",
    ];

    const attemptedLockedProofEdits = lockedProofFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(input as any, field),
    );

    if (attemptedLockedProofEdits.length > 0) {
      visit.editHistory ??= [];

      visit.editHistory.push({
        id: randomUUID(),
        field: "REMARKS",
        oldValue: "",
        newValue: attemptedLockedProofEdits.join(", "),
        editedBy: user.id,
        editedAt: nowIso(),
        reason: "Attempted edit of locked proof fields was blocked by backend.",
      });

      throw new Error(
        `Critical proof fields cannot be edited after submission: ${attemptedLockedProofEdits.join(", ")}`,
      );
    }

    visit.editHistory ??= [];
    const appendVisitEdit = (field: "REMARKS" | "STAGE" | "FOLLOW_UP" | "GRADE" | "QUANTITY", oldValue: string, newValue: string) => {
      if (oldValue === newValue) {
        return;
      }
      visit.editHistory?.push({
        id: randomUUID(),
        field,
        oldValue,
        newValue,
        editedBy: user.id,
        editedAt: nowIso(),
        reason: "Agent updated submitted site visit.",
      });
    };

    if (typeof input.stageOfWork === "string") {
      const value = input.stageOfWork.trim();
      if (!value) {
        throw new Error("Stage of work cannot be empty.");
      }
      appendVisitEdit("STAGE", visit.stageOfWork, value);
      visit.stageOfWork = value;
    }

    if (typeof input.futureScope === "string") {
      const value = input.futureScope.trim();
      if (!value) {
        throw new Error("Future scope cannot be empty.");
      }
      visit.futureScope = value;
    }

    if (typeof input.concreteGrade === "string") {
      const value = normalizeConcreteGradeForVisit(input.concreteGrade);
      if (!value) {
        throw new Error("Concrete grade cannot be empty.");
      }

      appendVisitEdit("GRADE", visit.concreteGrade, value);

      if (visit.concreteGrade !== value) {
        visit.managerReviewRequired = true;
        visit.managerReviewReason = [
          visit.managerReviewReason,
          `Concrete grade changed from ${visit.concreteGrade} to ${value}; manager review required`,
        ]
          .filter(Boolean)
          .join("; ");
      }

      visit.concreteGrade = value;
    }

    if (typeof input.quantityCum === "number") {
      if (!Number.isFinite(input.quantityCum) || input.quantityCum <= 0) {
        throw new Error("Quantity must be greater than zero.");
      }

      appendVisitEdit("QUANTITY", String(visit.quantityCum), String(input.quantityCum));

      if (visit.quantityCum !== input.quantityCum) {
        visit.managerReviewRequired = true;
        visit.managerReviewReason = [
          visit.managerReviewReason,
          `Quantity changed from ${visit.quantityCum} cum to ${input.quantityCum} cum; manager review required`,
          isUnusualSiteVisitQuantity(input.quantityCum) ? `Updated quantity ${input.quantityCum} cum is unusual` : null,
        ]
          .filter(Boolean)
          .join("; ");
      }

      visit.quantityCum = input.quantityCum;
    }

    if (input.leadStage && input.leadStage !== visit.leadStage) {
      visit.editHistory?.push({
        id: randomUUID(),
        field: "STAGE",
        oldValue: visit.leadStage,
        newValue: input.leadStage,
        editedBy: user.id,
        editedAt: nowIso(),
        reason: "Agent attempted to change lead stage. Backend ignored manual stage edit because lead stage is system-calculated.",
      });

      visit.managerReviewRequired = true;
      visit.managerReviewReason = [
        visit.managerReviewReason,
        "Agent attempted to manually change lead stage; backend ignored manual stage edit",
      ]
        .filter(Boolean)
        .join("; ");
    }

    if (typeof input.nextFollowUpAt === "string") {
      const date = new Date(input.nextFollowUpAt);
      if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid follow-up date.");
      }
      appendVisitEdit("FOLLOW_UP", visit.nextFollowUpAt, date.toISOString());
      visit.nextFollowUpAt = date.toISOString();
    }

    if (input.expectedSupplyWindow !== undefined) {
      visit.expectedSupplyWindow = input.expectedSupplyWindow;
    }

    if (typeof input.remarksText === "string") {
      const value = input.remarksText.trim();
      appendVisitEdit("REMARKS", visit.remarksText ?? "", value);
      visit.remarksText = value;
    }

    if (typeof (input as any).currentSupplier === "string") {
      const value = normalizeCurrentSupplier((input as any).currentSupplier);

      appendVisitEdit("REMARKS", visit.currentSupplier ?? "", value);

      if ((visit.currentSupplier ?? "") !== value) {
        visit.managerReviewRequired = true;
        visit.managerReviewReason = [
          visit.managerReviewReason,
          `Current supplier changed from ${visit.currentSupplier ?? "N/A"} to ${value}; manager review required`,
        ]
          .filter(Boolean)
          .join("; ");
      }

      visit.currentSupplier = value;
    }

    const now = nowIso();
    const site = visit.siteId ? database.leadSites.find((entry) => entry.id === visit.siteId && entry.leadId === visit.leadId) : null;
    if (site) {
      site.currentConcreteGrade = visit.concreteGrade;
      site.currentQuantityCum = visit.quantityCum;
      site.futureScope = visit.futureScope;
      site.expectedSupplyWindow = visit.expectedSupplyWindow ?? null;
      if (compareIsoAsc(site.lastVisitedAt, visit.visitedAt) <= 0) {
        site.lastVisitedAt = visit.visitedAt;
      }
      site.updatedAt = now;
    }

    const lead = database.leads.find((entry) => entry.id === visit.leadId);
    if (lead) {
      lead.currentConcreteGrade = visit.concreteGrade;
      lead.currentQuantityCum = visit.quantityCum;
      lead.futureScope = visit.futureScope;
      lead.stage = visit.leadStage;
      lead.nextFollowUpAt = visit.nextFollowUpAt;
      lead.lastVisitedAt = visit.visitedAt;
      if (site) {
        lead.siteName = site.siteName;
        lead.siteAddress = site.siteAddress;
      }
    }

    logAudit(database, user, "SiteVisit", visit.id, "UPDATE", `Updated site visit report for ${visit.siteName}.`);
    return visit;
  });
}

async function prepareSiteVisitUpload(input: { file?: File; uploadedObject?: UploadedS3ObjectInput }) {
  if (input.file) {
    const { saveUploadedFile } = await import("@/lib/storage");
    const upload = await saveUploadedFile(input.file);

    return {
      ...upload,
      fileBuffer: null,
      mimeType: input.file.type || null,
    };
  }

  if (!input.uploadedObject) {
    throw new Error("Arrival photo is required.");
  }

  return prepareS3UploadedObject(input.uploadedObject, MAX_SITE_VISIT_STORED_BYTES);
}

async function prepareSiteVisitVoiceNoteUpload(input: {
  remarksVoiceNoteFile?: File | null;
  remarksVoiceNoteObject?: UploadedS3ObjectInput | null;
}) {
  if (input.remarksVoiceNoteFile instanceof File) {
    const { saveUploadedFile } = await import("@/lib/storage");
    const upload = await saveUploadedFile(input.remarksVoiceNoteFile);

    return {
      ...upload,
      fileBuffer: null,
      mimeType: input.remarksVoiceNoteFile.type || null,
    };
  }

  if (!input.remarksVoiceNoteObject) {
    return null;
  }

  return prepareS3UploadedObject(input.remarksVoiceNoteObject, MAX_SITE_VISIT_VOICE_STORED_BYTES);
}

async function prepareS3UploadedObject(uploadedObject: UploadedS3ObjectInput, maxBytes: number) {
  const { buildS3PublicUrl, readS3ObjectBuffer } = await import("@/lib/storage");
  const object = await readS3ObjectBuffer(uploadedObject.s3Key, { maxBytes });

  if (object.buffer.length > maxBytes) {
    throw new Error("The uploaded file is larger than allowed.");
  }

  return {
    photoUrl: buildS3PublicUrl(uploadedObject.s3Key),
    originalFileName: uploadedObject.originalFileName || uploadedObject.s3Key.split("/").at(-1) || "upload",
    localAbsolutePath: null,
    fileBuffer: object.buffer,
    mimeType: uploadedObject.mimeType || object.contentType,
  };
}

export async function listLeads(user: User) {
  const leads =
    user.role === "SALES_AGENT"
      ? await readCollection("leads", { filters: [{ field: "agentId", op: "==", value: user.id }] })
      : await readCollection("leads", { limit: getDashboardCollectionLimit(1000) });
  return sortLeads(leads);
}

export async function updateLead(
  user: User,
  leadId: string,
  input: Partial<Pick<Lead, "score" | "stage" | "nextFollowUpAt" | "futureScope" | "priceExpectation">>,
) {
  assertRole(user, ["SALES_AGENT", "MANAGER"]);

  return updateDatabase((database) => {
    const lead = database.leads.find((entry) => entry.id === leadId);

    if (!lead) {
      throw new Error("Lead not found.");
    }

    if (user.role === "SALES_AGENT" && lead.agentId !== user.id) {
      throw new Error("You can only update your own leads.");
    }

    const safeInput = { ...input };
    if (user.role === "SALES_AGENT") {
      delete safeInput.score;
      delete safeInput.stage;
    }

    Object.assign(lead, safeInput);
    logAudit(database, user, "Lead", lead.id, "UPDATE", "Lead summary updated with backend score/stage protection.");
    return lead;
  });
}

export interface CreateInformalQuotationLineItemInput {
  id?: string;
  grade: string;
  quantityCum: number;
  mixDesignType: MixDesignType;
  mixRequirement?: string;
  pricePerCum: number;
}

export interface CreateInformalQuotationRequestInput {
  leadId: string;
  siteId: string;
  stakeholderRole: StakeholderContact["role"];
  stakeholderName: string;
  stakeholderPhone: string;
  stakeholderEmail: string;
  billingAddress: string;
  whatsappNumber: string;
  priceType: InformalQuotationPriceType;
  paymentType: InformalQuotationPaymentType;
  creditDays?: number | null;
  oneWayDistanceKm: number;
  trafficPostCount: number;
  items: CreateInformalQuotationLineItemInput[];
}

function normalizeInformalQuotationItems(items: CreateInformalQuotationLineItemInput[]) {
  if (items.length > 3) {
    throw new Error("Only three grades can be added to one informal quotation request.");
  }

  const normalizedItems = items
    .slice(0, 3)
    .map<InformalQuotationLineItem>((item, index) => {
      const grade = item.grade.trim().toUpperCase();
      const quantityCum = Number(item.quantityCum);
      const pricePerCum = Math.round(Number(item.pricePerCum) * 100) / 100;
      const mixDesignType = item.mixDesignType === "NOMINAL_MIX" ? "NOMINAL_MIX" : "DESIGN_MIX";
      const mixRequirement = `${item.mixRequirement ?? ""}`.trim();

      if (!grade) {
        throw new Error(`Grade ${index + 1} is required.`);
      }

      if (!Number.isFinite(quantityCum) || quantityCum <= 0) {
        throw new Error(`Enter a valid quantity for ${grade}.`);
      }

      if (!Number.isFinite(pricePerCum) || pricePerCum <= 0) {
        throw new Error(`Enter a valid price for ${grade}.`);
      }

      if (mixDesignType === "DESIGN_MIX" && !mixRequirement) {
        throw new Error(`Specific mix requirement is required for ${grade}.`);
      }

      return {
        id: item.id?.trim() || randomUUID(),
        grade,
        quantityCum,
        mixDesignType,
        mixRequirement: mixDesignType === "DESIGN_MIX" ? mixRequirement : "Nominal mix",
        pricePerCum,
      };
    });

  if (!normalizedItems.length) {
    throw new Error("Add at least one quotation grade.");
  }

  const grades = new Set(normalizedItems.map((item) => item.grade));
  if (grades.size !== normalizedItems.length) {
    throw new Error("Each informal quotation grade must be unique.");
  }

  return normalizedItems;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid stakeholder email address.");
  }
  return email;
}

function normalizeOptionalEmail(value: string | null | undefined) {
  const email = `${value ?? ""}`.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePhoneNumber(value: string) {
  const phone = value.trim().replace(/[^\d+]/g, "");
  const digits = phone.replace(/\D/g, "");

  if (digits.length < 10) {
    throw new Error("Enter a valid WhatsApp number.");
  }

  return phone;
}

function getEmployeeEmail(user: User | null | undefined) {
  if (!user) {
    return null;
  }

  const employeeEnvKey = `EMPLOYEE_EMAIL_${user.employeeId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return normalizeOptionalEmail(user.email) ?? normalizeOptionalEmail(process.env[employeeEnvKey]);
}

function getFinancialYearLabel(value: string) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = safeDate.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

function getNextInformalQuotationRef(database: Database, dateIso: string) {
  const financialYear = getFinancialYearLabel(dateIso);
  const prefix = `SPDCPL/${financialYear}/`;
  const nextSequence =
    database.informalQuotationRequests
      .map((entry) => entry.quotationRef)
      .filter((ref): ref is string => Boolean(ref?.startsWith(prefix)))
      .map((ref) => Number(ref.slice(prefix.length)))
      .filter((sequence) => Number.isInteger(sequence) && sequence > 0)
      .reduce((max, sequence) => Math.max(max, sequence), 0) + 1;

  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

function getNextSalesOrderRequestNumber(database: Database, dateIso: string) {
  const financialYear = getFinancialYearLabel(dateIso);
  const prefix = `SOR/${financialYear}/`;
  const nextSequence =
    database.salesOrderRequests
      .map((entry) => entry.sorNumber ?? entry.internalReference)
      .filter((ref): ref is string => Boolean(ref?.startsWith(prefix)))
      .map((ref) => Number(ref.slice(prefix.length)))
      .filter((sequence) => Number.isInteger(sequence) && sequence > 0)
      .reduce((max, sequence) => Math.max(max, sequence), 0) + 1;

  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

function getInformalQuotationPdfFileName(request: InformalQuotationRequest) {
  const ref = request.quotationRef ?? request.id;
  return `quotation-${ref.replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
}

function safeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : "Delivery failed.";
  return message.slice(0, 700);
}

function isWhatsappDeliveryVerified(database: Database, phone: string) {
  const phoneDigits = normalizePhoneDigitsForMatch(phone);
  if (!phoneDigits) {
    return false;
  }

  const verifiedStatuses = new Set(["VERIFIED", "WHATSAPP_CHECKED"]);
  const masterVerified = database.stakeholderMasters.some(
    (stakeholder) =>
      normalizePhoneDigitsForMatch(stakeholder.phone) === phoneDigits &&
      verifiedStatuses.has(stakeholder.phoneVerificationStatus),
  );

  if (masterVerified) {
    return true;
  }

  const siteContactVerified = database.leadSites.some((site) =>
    site.stakeholders.some(
      (stakeholder) =>
        normalizePhoneDigitsForMatch(stakeholder.phone) === phoneDigits &&
        verifiedStatuses.has(stakeholder.phoneVerificationStatus ?? "UNVERIFIED"),
    ),
  );

  if (siteContactVerified) {
    return true;
  }

  return database.siteVisits.some((visit) =>
    visit.stakeholders.some(
      (stakeholder) =>
        normalizePhoneDigitsForMatch(stakeholder.phone) === phoneDigits &&
        verifiedStatuses.has(stakeholder.phoneVerificationStatus ?? "UNVERIFIED"),
    ),
  );
}

function markWhatsappNumberVerified(database: Database, phone: string, verifiedAt: string) {
  const phoneDigits = normalizePhoneDigitsForMatch(phone);
  if (!phoneDigits) {
    return;
  }

  for (const stakeholder of database.stakeholderMasters ?? []) {
    if (normalizePhoneDigitsForMatch(stakeholder.phone) !== phoneDigits) {
      continue;
    }

    stakeholder.phoneVerificationStatus = "VERIFIED";
    stakeholder.phoneVerifiedAt = verifiedAt;
    stakeholder.lastWhatsappVerificationAt = verifiedAt;
    stakeholder.lastVerificationError = null;
    stakeholder.updatedAt = verifiedAt;
    syncStakeholderContactVerification(database, stakeholder);
  }
}

function buildInformalQuotationWhatsappMessage(request: InformalQuotationRequest, pdfUrl: string) {
  return [
    `Dear ${request.stakeholderName},`,
    "",
    "Your approved SPD Concrete informal quotation is ready.",
    `Reference: ${request.quotationRef ?? request.id}`,
    `Project: ${request.siteName}`,
    `PDF: ${pdfUrl}`,
    "",
    "Regards,",
    "SPD Concrete Pvt Ltd",
  ].join("\n");
}

function requireSiteStakeholder(site: LeadSite, input: CreateInformalQuotationRequestInput) {
  const role = normalizeStakeholderRole(input.stakeholderRole);
  const name = input.stakeholderName.trim();
  const phone = input.stakeholderPhone.trim();

  if (role === "FOUND_NO_ONE" || !name) {
    throw new Error("Choose a real stakeholder for the informal quotation.");
  }

  const stakeholder = site.stakeholders.find(
    (entry) =>
      normalizeStakeholderRole(entry.role) === role &&
      entry.name.trim().toLowerCase() === name.toLowerCase() &&
      `${entry.phone ?? ""}`.trim() === phone,
  );

  if (!stakeholder) {
    throw new Error("Choose a stakeholder saved under this site.");
  }

  return {
    role,
    label: stakeholder.label || getStakeholderLabel(role),
    name: stakeholder.name.trim(),
    phone: stakeholder.phone.trim(),
  };
}

export async function createInformalQuotationRequest(user: User, input: CreateInformalQuotationRequestInput) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const lead = requireLeadForUser(database, user, input.leadId);
    const site = requireLeadSite(database, lead.id, input.siteId);

    if (!site) {
      throw new Error("Select a saved site before requesting an informal quotation.");
    }

    const stakeholder = requireSiteStakeholder(site, input);
    const stakeholderEmail = normalizeEmail(input.stakeholderEmail);
    const billingAddress = input.billingAddress.trim();
    const whatsappNumber = normalizePhoneNumber(input.whatsappNumber || stakeholder.phone);
    const items = normalizeInformalQuotationItems(input.items);
    const priceType = input.priceType === "NON_GST" ? "NON_GST" : "GST_INCLUSIVE";
    const paymentType = priceType === "NON_GST" ? "ADVANCE" : input.paymentType === "CREDIT" ? "CREDIT" : "ADVANCE";
    const requestedCreditDays = Number(input.creditDays);
    const oneWayDistanceKm = Number(input.oneWayDistanceKm);
    const trafficPostCount = Number(input.trafficPostCount);

    let normalizedCreditDays: number | null = null;
    if (paymentType === "CREDIT") {
      if (!Number.isFinite(requestedCreditDays) || requestedCreditDays <= 0) {
        throw new Error("Credit period days are required for credit payment.");
      }
      normalizedCreditDays = requestedCreditDays;
    }

    if (!billingAddress) {
      throw new Error("Billing address is required for the informal quotation.");
    }

    if (!Number.isFinite(oneWayDistanceKm) || oneWayDistanceKm < 0) {
      throw new Error("Enter a valid one-way distance.");
    }

    if (!Number.isFinite(trafficPostCount) || trafficPostCount < 0 || !Number.isInteger(trafficPostCount)) {
      throw new Error("Enter a valid traffic post count.");
    }

    const duplicate = database.informalQuotationRequests.find(
      (entry) =>
        entry.status === "PENDING" &&
        entry.createdBy === user.id &&
        entry.leadId === lead.id &&
        entry.siteId === site.id &&
        entry.stakeholderEmail.toLowerCase() === stakeholderEmail &&
        entry.items.map((item) => item.grade).join("|") === items.map((item) => item.grade).join("|"),
    );

    if (duplicate) {
      throw new Error("A matching informal quotation request is already pending for this stakeholder.");
    }

    const duplicateApprovedQuotation = database.informalQuotationRequests.find(
      (entry) =>
        entry.status === "APPROVED" &&
        entry.siteId === site.id &&
        entry.stakeholderPhone === stakeholder.phone &&
        entry.items.map((item) => item.grade).join("|") === items.map((item) => item.grade).join("|") &&
        entry.isExpired !== true,
    );
    const minimumRatePerCum = items.reduce((maxMinimum, item) => {
      const benchmark = (database.priceBenchmarks ?? []).find(
        (entry) => entry.plantId === site.plantId && entry.grade.trim().toUpperCase() === item.grade,
      );
      return Math.max(maxMinimum, benchmark ? Math.round(benchmark.sellingPricePerCum * 0.95) : 0);
    }, 0);
    const belowMinimumItem = minimumRatePerCum > 0 ? items.find((item) => item.pricePerCum < minimumRatePerCum) : null;

    const request: InformalQuotationRequest = {
      id: randomUUID(),
      leadId: lead.id,
      siteId: site.id,
      plantId: site.plantId || lead.plantId || getUserPlantId(database, user.id),
      customerName: lead.siteName,
      siteName: site.siteName,
      siteAddress: site.siteAddress,
      stakeholderRole: stakeholder.role,
      stakeholderLabel: stakeholder.label,
      stakeholderName: stakeholder.name,
      stakeholderPhone: stakeholder.phone,
      stakeholderEmail,
      billingAddress,
      whatsappNumber,
      priceType,
      paymentType,
      creditDays: normalizedCreditDays,
      oneWayDistanceKm,
      trafficPostCount,
      items,
      status: "PENDING",
      decisionNote: null,
      decidedBy: null,
      decidedAt: null,
      quotationRef: null,
      quotationPdfUrl: null,
      quotationPdfS3Key: null,
      pdfStatus: "NOT_GENERATED",
      pdfGeneratedAt: null,
      pdfError: null,
      emailStatus: "NOT_SENT",
      emailSentAt: null,
      emailError: null,
      emailTo: null,
      emailCc: [],
      whatsappStatus: "NOT_SENT",
      whatsappSentAt: null,
      whatsappError: null,
      createdBy: user.id,
      createdAt: nowIso(),
      eligibilityChecked: true,
      rateValidationStatus: belowMinimumItem ? "BELOW_MINIMUM" : minimumRatePerCum > 0 ? "VALID" : "NOT_CHECKED",
      rateValidationNote: belowMinimumItem
        ? `${belowMinimumItem.grade} rate ${belowMinimumItem.pricePerCum} is below minimum ${minimumRatePerCum}. Manager override required.`
        : null,
      minimumRatePerCum: minimumRatePerCum || null,
      duplicateOfQuotationId: duplicateApprovedQuotation?.id ?? null,
      revisionNumber: 1,
      previousRevisionId: null,
      latestRevisionId: null,
      validityDate: null,
      isExpired: false,
      correctionStatus: "NONE",
      correctionReason: null,
      correctionRequestedBy: null,
      correctionRequestedAt: null,
      creditApprovalRequired: paymentType === "CREDIT",
      creditApprovedBy: null,
      creditApprovedAt: null,
      deliveryChannels: [],
    };

    database.informalQuotationRequests.unshift(request);
    logAudit(database, user, "InformalQuotationRequest", request.id, "CREATE", `Requested informal quotation for ${site.siteName}.`);
    return request;
  });
}

export async function decideInformalQuotationRequest(
  user: User,
  requestId: string,
  status: InformalQuotationStatus,
  decisionNote: string,
) {
  assertRole(user, ["MANAGER"]);

  const decidedRequest = await updateDatabase((database) => {
    const request = database.informalQuotationRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Informal quotation request not found.");
    }

    if (request.status !== "PENDING") {
      throw new Error("This informal quotation request is already decided.");
    }

    if (status !== "APPROVED" && status !== "REJECTED" && status !== "CORRECTION_REQUESTED") {
      throw new Error("Choose whether to approve, reject, or request correction for this informal quotation.");
    }

    if (
      status === "APPROVED" &&
      !(database.documentTemplates ?? []).some((template) => template.type === "QUOTATION" && template.status === "ACTIVE")
    ) {
      throw new Error("Upload and activate a quotation template before approving and releasing quotations.");
    }

    if (status === "APPROVED" && request.rateValidationStatus === "BELOW_MINIMUM" && !decisionNote.trim()) {
      throw new Error("Manager note is required when approving a quotation below the minimum rate.");
    }

    if (status === "CORRECTION_REQUESTED" && !decisionNote.trim()) {
      throw new Error("Correction reason is required.");
    }

    request.status = status;
    request.decisionNote = decisionNote.trim() || (status === "APPROVED" ? "Approved by manager." : "Rejected by manager.");
    request.decidedBy = user.id;
    request.decidedAt = nowIso();
    if (status === "CORRECTION_REQUESTED") {
      request.correctionStatus = "CORRECTION_REQUESTED";
      request.correctionReason = decisionNote.trim();
      request.correctionRequestedBy = user.id;
      request.correctionRequestedAt = request.decidedAt;
      logAudit(database, user, "InformalQuotationRequest", request.id, "CORRECTION_REQUESTED", request.correctionReason);
      return request;
    }
    if (status === "APPROVED" && !request.quotationRef) {
      request.quotationRef = getNextInformalQuotationRef(database, request.decidedAt);
    }
    if (status === "APPROVED") {
      const validityDate = new Date(request.decidedAt);
      validityDate.setDate(validityDate.getDate() + MIN_QUOTATION_VALID_DAYS);
      request.validityDate = validityDate.toISOString();
      request.isExpired = false;
      request.correctionStatus = "NONE";
      database.quotationRevisions ??= [];
      const revisionId = randomUUID();
      database.quotationRevisions.push({
        id: revisionId,
        quotationId: request.id,
        revisionNumber: request.revisionNumber ?? 1,
        correctionStatus: request.correctionStatus ?? "NONE",
        correctionReason: request.correctionReason ?? null,
        correctionRequestedBy: request.correctionRequestedBy ?? null,
        correctionRequestedAt: request.correctionRequestedAt ?? null,
        previousRevisionId: request.previousRevisionId ?? null,
        createdBy: user.id,
        createdAt: request.decidedAt,
      });
      request.latestRevisionId = revisionId;
    }
    logAudit(database, user, "InformalQuotationRequest", request.id, status, request.decisionNote);
    return request;
  });

  if (status === "APPROVED") {
    return deliverApprovedInformalQuotation(user, decidedRequest.id);
  }

  return decidedRequest;
}

async function deliverApprovedInformalQuotation(manager: User, requestId: string) {
  const database = await readDatabase();
  const request = database.informalQuotationRequests.find((entry) => entry.id === requestId);

  if (!request) {
    throw new Error("Informal quotation request not found for delivery.");
  }

  if (request.status !== "APPROVED") {
    return request;
  }

  const salesAgent = database.users.find((entry) => entry.id === request.createdBy) ?? null;
  const managerUser = database.users.find((entry) => entry.id === request.decidedBy) ?? manager;
  const plant = database.plants.find((entry) => entry.id === request.plantId) ?? null;
  const quotationTemplate =
    (database.documentTemplates ?? [])
      .filter((template) => template.type === "QUOTATION" && template.status === "ACTIVE")
      .sort((left, right) => compareIsoAsc(right.uploadedAt, left.uploadedAt))[0] ?? null;
  let pdfBuffer: Buffer;
  let quotationPdfUrl = "";

  try {
    if (!quotationTemplate) {
      throw new Error("Upload and activate a quotation template before approving and releasing quotations.");
    }

    pdfBuffer = generateInformalQuotationPdf({ quotation: request, plant, manager: managerUser, salesAgent, template: quotationTemplate });
    const fileName = getInformalQuotationPdfFileName(request);
    const storedPdf = await saveGeneratedBuffer({
      buffer: pdfBuffer,
      fileName,
      mimeType: "application/pdf",
      directory: "quotations",
    });
    quotationPdfUrl = storedPdf.fileUrl;

    await updateDatabase((nextDatabase) => {
      const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === request.id);
      if (!nextRequest) {
        throw new Error("Informal quotation request not found while saving PDF status.");
      }
      nextRequest.quotationPdfUrl = storedPdf.fileUrl;
      nextRequest.quotationPdfS3Key = storedPdf.s3Key;
      nextRequest.pdfStatus = "GENERATED";
      nextRequest.pdfGeneratedAt = nowIso();
      nextRequest.pdfError = null;
      logAudit(nextDatabase, manager, "InformalQuotationRequest", nextRequest.id, "PDF_GENERATED", `Generated quotation PDF ${nextRequest.quotationRef}.`);
      return nextRequest;
    });
  } catch (error) {
    const errorMessage = safeDeliveryError(error);
    return updateDatabase((nextDatabase) => {
      const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === request.id);
      if (!nextRequest) {
        throw new Error("Informal quotation request not found while saving PDF failure.");
      }
      nextRequest.pdfStatus = "FAILED";
      nextRequest.pdfError = errorMessage;
      nextRequest.emailStatus = "FAILED";
      nextRequest.emailError = `PDF generation failed: ${errorMessage}`;
      nextRequest.whatsappStatus = "FAILED";
      nextRequest.whatsappError = `PDF generation failed: ${errorMessage}`;
      logAudit(nextDatabase, manager, "InformalQuotationRequest", nextRequest.id, "PDF_FAILED", errorMessage);
      return nextRequest;
    });
  }

  const ccEmails = [getEmployeeEmail(managerUser), getEmployeeEmail(salesAgent)].filter((email): email is string => Boolean(email));

  try {
    await sendGmail({
      to: [request.stakeholderEmail],
      cc: ccEmails,
      subject: `Quotation ${request.quotationRef} - ${request.customerName}`,
      text: [
        `Dear ${request.stakeholderName},`,
        "",
        "Please find attached the approved SPD Concrete quotation.",
        "",
        `Reference: ${request.quotationRef}`,
        `Project: ${request.siteName}`,
        "",
        "Regards,",
        "SPD Concrete Pvt Ltd",
      ].join("\n"),
      attachments: [
        {
          filename: getInformalQuotationPdfFileName(request),
          contentType: "application/pdf",
          content: pdfBuffer,
        },
      ],
    });

    await updateDatabase((nextDatabase) => {
      const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === request.id);
      if (!nextRequest) {
        throw new Error("Informal quotation request not found while saving email status.");
      }
      nextRequest.emailStatus = "SENT";
      nextRequest.emailSentAt = nowIso();
      nextRequest.emailError = null;
      nextRequest.emailTo = request.stakeholderEmail;
      nextRequest.emailCc = ccEmails;
      nextRequest.deliveryChannels ??= [];
      nextRequest.deliveryChannels.push({ channel: "EMAIL", sentAt: nextRequest.emailSentAt, sentBy: manager.id });
      logAudit(nextDatabase, manager, "InformalQuotationRequest", nextRequest.id, "EMAIL_SENT", `Sent quotation email to ${request.stakeholderEmail}.`);
      return nextRequest;
    });
  } catch (error) {
    const errorMessage = safeDeliveryError(error);
    await updateDatabase((nextDatabase) => {
      const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === request.id);
      if (!nextRequest) {
        throw new Error("Informal quotation request not found while saving email failure.");
      }
      nextRequest.emailStatus = "FAILED";
      nextRequest.emailSentAt = null;
      nextRequest.emailError = errorMessage;
      nextRequest.emailTo = request.stakeholderEmail;
      nextRequest.emailCc = ccEmails;
      logAudit(nextDatabase, manager, "InformalQuotationRequest", nextRequest.id, "EMAIL_FAILED", errorMessage);
      return nextRequest;
    });
  }

  return deliverInformalQuotationWhatsapp(manager, request.id, quotationPdfUrl);
}

async function deliverInformalQuotationWhatsapp(manager: User, requestId: string, quotationPdfUrl: string) {
  const database = await readDatabase();
  const request = database.informalQuotationRequests.find((entry) => entry.id === requestId);

  if (!request) {
    throw new Error("Informal quotation request not found for WhatsApp delivery.");
  }

  if (!quotationPdfUrl) {
    return updateDatabase((nextDatabase) => {
      const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === requestId);
      if (!nextRequest) {
        throw new Error("Informal quotation request not found while saving WhatsApp failure.");
      }

      nextRequest.whatsappStatus = "FAILED";
      nextRequest.whatsappSentAt = null;
      nextRequest.whatsappError = "Quotation PDF link is missing.";
      return nextRequest;
    });
  }

  if (!isWhatsappDeliveryVerified(database, request.whatsappNumber)) {
    return updateDatabase((nextDatabase) => {
      const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === requestId);
      if (!nextRequest) {
        throw new Error("Informal quotation request not found while saving WhatsApp skip.");
      }

      nextRequest.whatsappStatus = "NOT_SENT";
      nextRequest.whatsappSentAt = null;
      nextRequest.whatsappError = "WhatsApp number is not verified. Send WhatsApp verification first, then approve or resend.";
      logAudit(
        nextDatabase,
        manager,
        "InformalQuotationRequest",
        nextRequest.id,
        "WHATSAPP_NOT_SENT",
        nextRequest.whatsappError,
      );
      return nextRequest;
    });
  }

  const result = await sendWhatsappVerification(
    request.whatsappNumber,
    buildInformalQuotationWhatsappMessage(request, quotationPdfUrl),
  );

  return updateDatabase((nextDatabase) => {
    const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === requestId);
    if (!nextRequest) {
      throw new Error("Informal quotation request not found while saving WhatsApp status.");
    }

    const now = nowIso();
    nextRequest.whatsappStatus =
      result.status === "SENT"
        ? "SENT"
        : result.status === "PENDING_CONFIGURATION"
          ? "PENDING_CONFIGURATION"
          : "FAILED";
    nextRequest.whatsappSentAt = result.status === "SENT" ? now : null;
    nextRequest.whatsappError = result.error;

    if (result.status === "SENT") {
      nextRequest.deliveryChannels ??= [];
      nextRequest.deliveryChannels.push({ channel: "WHATSAPP", sentAt: now, sentBy: manager.id });
      markWhatsappNumberVerified(nextDatabase, nextRequest.whatsappNumber, now);
    }

    logAudit(
      nextDatabase,
      manager,
      "InformalQuotationRequest",
      nextRequest.id,
      `WHATSAPP_${nextRequest.whatsappStatus}`,
      result.status === "SENT"
        ? `Sent quotation WhatsApp to ${nextRequest.whatsappNumber}.`
        : (result.error ?? "WhatsApp quotation delivery failed."),
    );

    return nextRequest;
  });
}

export interface CreateApprovalRequestInput {
  leadId: string;
  siteId: string | null;
  customerName: string;
  items: ApprovalRequestItem[];
  quantity: number;
  requiredDate: string;
  oneWayDistanceKm: number;
  trafficCount: number;
  castingType: string;
  mixDesignType: MixDesignType;
  paymentType: PaymentType;
  paymentTerms: PaymentTerms;
}

export interface CreateSalesOrderRequestInput {
  leadId: string;
  approvalRequestId: string;
  approvalItemId: string | null;
  priority: SalesOrderRequest["priority"];
  quantity: number;
  slump: string;
  requiredDate: string;
  receiverName: string;
  receiverPhone: string;
  pumpRequired: boolean;
  notes: string;
  paymentReceivedConfirmed: boolean;
  poDocumentUrl: string | null;
  pdcDocumentUrl: string | null;
  gstin: string | null;
  gstLegalName: string | null;
  gstBillingAddress: string | null;
  gstCertificateUrl: string | null;
  agentGstConfirmed: boolean;
  plannedCastingType: string;
}

export async function createApprovalRequest(
  user: User,
  input: CreateApprovalRequestInput,
) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const lead = requireLeadForUser(database, user, input.leadId);
    const site = requireLeadSite(database, lead.id, input.siteId);
    const items = summarizeApprovalLineItems(input.items);
    const paymentTerms = normalizePaymentTerms(input.paymentType, input.paymentTerms);
    const quantity = Number(input.quantity);
    const requiredDate = new Date(input.requiredDate);

    if (!site) {
      throw new Error("Select a saved site before raising a final approval request.");
    }

    if (site.siteStatus === "DEAD" || site.siteStatus === "LOST" || site.siteStatus === "MERGED") {
      throw new Error("Final approval can be raised only for an active site.");
    }

    if (!input.customerName.trim()) {
      throw new Error("Client or customer name is required.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Enter a valid project quantity for approval.");
    }

    if (Number.isNaN(requiredDate.getTime())) {
      throw new Error("Choose a valid requirement date.");
    }

    if (!Number.isFinite(input.oneWayDistanceKm) || input.oneWayDistanceKm < 0) {
      throw new Error("Enter a valid one-way distance from plant.");
    }

    if (!Number.isFinite(input.trafficCount) || input.trafficCount < 0) {
      throw new Error("Enter a valid traffic count.");
    }

    if (!input.castingType.trim()) {
      throw new Error("Casting type is required.");
    }

    const now = nowIso();
    const latestQuotation =
      database.informalQuotationRequests
        .filter((quotation) => quotation.status === "APPROVED" && quotation.siteId === site.id && quotation.isExpired !== true)
        .sort((left, right) => compareIsoAsc(right.decidedAt ?? right.createdAt, left.decidedAt ?? left.createdAt))[0] ?? null;

    const duplicateOpenApproval = findOpenFinalApprovalForSite(database, site.id, items);

    if (duplicateOpenApproval) {
      throw new Error(
        `A ${duplicateOpenApproval.status.toLowerCase()} final approval already exists for this site and grade. Use the existing approval or reject/close it before creating a new one.`,
      );
    }

    const commercialVariationReasons = buildApprovalVariationReasons(items, latestQuotation, input);

    const quotationValidityStatus =
      !latestQuotation
        ? "NOT_LINKED"
        : latestQuotation.validityDate && compareIsoAsc(latestQuotation.validityDate, now) < 0
          ? "EXPIRED"
          : "VALID";
    if (quotationValidityStatus === "EXPIRED") {
      throw new Error("The linked quotation is expired. Request a revised quotation before final approval.");
    }
    const minimumRatePerCum = items.reduce((maxMinimum, item) => {
      const benchmark = (database.priceBenchmarks ?? []).find(
        (entry) => entry.plantId === site.plantId && entry.grade.trim().toUpperCase() === item.grade,
      );
      return Math.max(maxMinimum, benchmark ? Math.round(benchmark.sellingPricePerCum * 0.95) : 0);
    }, 0);
    const belowMinimum = minimumRatePerCum > 0 && items.some((item) => item.quotedPrice < minimumRatePerCum);

    const approval: ApprovalRequest = {
      id: randomUUID(),
      leadId: lead.id,
      siteId: site.id,
      plantId: lead.plantId ?? getUserPlantId(database, user.id),
      customerName: input.customerName.trim(),
      siteName: site.siteName,
      siteAddress: site.siteAddress,
      items,
      mixDesignType: input.mixDesignType,
      grade: items[0]?.grade ?? "",
      quantity,
      requiredDate: requiredDate.toISOString(),
      oneWayDistanceKm: input.oneWayDistanceKm,
      distanceFromPlantKm: input.oneWayDistanceKm,
      trafficCount: input.trafficCount,
      castingType: input.castingType.trim(),
      paymentType: input.paymentType,
      paymentTerms,
      quotedPrice: items[0]?.quotedPrice ?? 0,
      status: "PENDING",
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdBy: user.id,
      createdAt: now,
      linkedQuotationId: latestQuotation?.id ?? null,
      linkedQuotationRevisionId: latestQuotation?.latestRevisionId ?? null,
      quotationValidityStatus,
      directFinalApprovalReason: latestQuotation ? null : "No approved informal quotation linked; manager must review direct final approval.",
      routeFeasibilityStatus:
        input.oneWayDistanceKm > 40 ? "NOT_FEASIBLE" : input.oneWayDistanceKm > 25 || input.trafficCount > 4 ? "MARGINAL" : "FEASIBLE",
      variationNotes: commercialVariationReasons.length ? commercialVariationReasons.join(" ") : null,
      minimumRatePerCum: minimumRatePerCum || null,
      rateValidationStatus: belowMinimum ? "BELOW_MINIMUM" : minimumRatePerCum > 0 ? "VALID" : "NOT_CHECKED",
      finalApprovalRecordId: null,
    };
    const finalApprovalId = randomUUID();
    approval.finalApprovalRecordId = finalApprovalId;

    database.approvalRequests.unshift(approval);
    database.finalApprovals ??= [];
    database.finalApprovals.unshift({
      id: finalApprovalId,
      quotationId: latestQuotation?.id ?? approval.id,
      quotationRevisionId: latestQuotation?.latestRevisionId ?? null,
      siteId: site.id,
      leadId: lead.id,
      status: "PENDING",
      creditApprovalStatus: approval.paymentType === "CREDIT" ? "PENDING" : "NOT_REQUIRED",
      variationNotes: approval.variationNotes ?? null,
      distanceKm: approval.oneWayDistanceKm,
      routeFeasibilityStatus: approval.routeFeasibilityStatus ?? "NOT_CHECKED",
      materialScope: site.futureScope || approval.grade,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      lockedAt: null,
      createdBy: user.id,
      createdAt: now,
    });
    logAudit(
      database,
      user,
      "ApprovalRequest",
      approval.id,
      "CREATE",
      `Created final price approval request for ${createApprovalAuditSummary(approval)}. ${
        approval.variationNotes ? `Variation notes: ${approval.variationNotes}` : "No commercial variation detected."
      }`,
    );
    return approval;
  });
}

function normalizeSalesOrderPhone(value?: string | null) {
  return `${value ?? ""}`.replace(/\D/g, "");
}

function validateReceiverPhoneForSalesOrder(value?: string | null) {
  const phone = normalizeSalesOrderPhone(value);

  if (!phone) {
    return {
      phone,
      valid: false,
      reason: "Receiver phone number is required for sales order delivery coordination.",
    };
  }

  if (phone.length !== 10) {
    return {
      phone,
      valid: false,
      reason: `Receiver phone must be exactly 10 digits. Received ${phone.length} digits.`,
    };
  }

  if (!/^[6-9]/.test(phone)) {
    return {
      phone,
      valid: false,
      reason: `Receiver phone ${phone} must start with 6, 7, 8, or 9.`,
    };
  }

  if (/^(\d)\1{9}$/.test(phone) || ["1234567890", "0123456789", "9876543210"].includes(phone)) {
    return {
      phone,
      valid: false,
      reason: `Receiver phone ${phone} appears to be a dummy number.`,
    };
  }

  return {
    phone,
    valid: true,
    reason: null,
  };
}

function getDateOnlyKey(value?: string | null) {
  return toDateKey(value ?? nowIso());
}

function isPastDeliveryDate(value?: string | null) {
  const deliveryDate = getDateOnlyKey(value);
  const today = getDateOnlyKey(nowIso());
  return deliveryDate < today;
}

function isTodayDeliveryDate(value?: string | null) {
  return getDateOnlyKey(value) === getDateOnlyKey(nowIso());
}

function normalizeSalesOrderGrade(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function findOpenSalesOrderRequestForApproval(
  database: Database,
  approvalId: string,
  grade: string,
) {
  const normalizedGrade = normalizeSalesOrderGrade(grade);

  return database.salesOrderRequests.find((request) => {
    if (request.approvalRequestId !== approvalId) {
      return false;
    }

    const status = `${request.status ?? ""}`.toUpperCase();

    if (["REJECTED", "CANCELLED", "CLOSED", "FULFILLED"].includes(status)) {
      return false;
    }

    return normalizeSalesOrderGrade(`${request.grade ?? ""}`) === normalizedGrade;
  });
}

function calculateApprovedQuantityForGrade(approval: ApprovalRequest, grade: string) {
  const normalizedGrade = normalizeSalesOrderGrade(grade);
  const matchingItems = approval.items.filter((item) => normalizeSalesOrderGrade(item.grade) === normalizedGrade);
  const explicitItemQuantity = matchingItems.reduce(
    (total, item) => total + Number((item as any).quantity ?? (item as any).quantityCum ?? 0),
    0,
  );

  if (explicitItemQuantity > 0) {
    return explicitItemQuantity;
  }

  if (matchingItems.length === 1 && (approval.items.length === 1 || normalizeSalesOrderGrade(approval.grade) === normalizedGrade)) {
    return Number(approval.quantity ?? 0);
  }

  return 0;
}

function calculateExistingOpenQuantityForApproval(
  database: Database,
  approvalId: string,
  grade: string,
) {
  const normalizedGrade = normalizeSalesOrderGrade(grade);

  return database.salesOrderRequests
    .filter((request) => {
      if (request.approvalRequestId !== approvalId) {
        return false;
      }

      const status = `${request.status ?? ""}`.toUpperCase();

      if (["REJECTED", "CANCELLED", "CLOSED"].includes(status)) {
        return false;
      }

      return normalizeSalesOrderGrade(`${request.grade ?? ""}`) === normalizedGrade;
    })
    .reduce((total, request) => total + Number((request as any).quantity ?? (request as any).quantityCum ?? 0), 0);
}

export async function createSalesOrderRequest(
  user: User,
  input: CreateSalesOrderRequestInput,
) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const lead = requireLeadForUser(database, user, input.leadId);
    const approval = database.approvalRequests.find((entry) => entry.id === input.approvalRequestId);

    if (!approval || approval.status !== "APPROVED") {
      throw new Error("Choose an approved final approval before creating the sales order request.");
    }

    const finalApprovalRecord = approval.finalApprovalRecordId
      ? database.finalApprovals?.find((entry) => entry.id === approval.finalApprovalRecordId)
      : null;

    if (finalApprovalRecord && finalApprovalRecord.status !== "APPROVED") {
      throw new Error("The linked final approval record is not approved.");
    }

    if (finalApprovalRecord && !finalApprovalRecord.lockedAt) {
      throw new Error("The linked final approval is not locked. Manager must approve and lock it before sales order creation.");
    }

    if (approval.leadId !== lead.id) {
      throw new Error("The selected approval does not belong to this lead.");
    }

    const site = requireLeadSite(database, lead.id, approval.siteId);
    const approvalItem = getApprovalItemById(approval, input.approvalItemId);
    const quantity = Number(input.quantity);
    const requiredDate = new Date(input.requiredDate);
    const gstin = normalizeGstin(`${input.gstin ?? ""}`);
    const gstPan = gstin ? extractPanFromGstin(gstin) : null;
    const gstLegalName = `${input.gstLegalName ?? ""}`.trim();
    const gstBillingAddress = `${input.gstBillingAddress ?? ""}`.trim();
    const plannedCastingType = input.plannedCastingType
      ? normalizeCastingType(input.plannedCastingType)
      : normalizeCastingType(approval.castingType);

    if (!site) {
      throw new Error("The approved site could not be found.");
    }

    if (!approvalItem) {
      throw new Error("Select one approved grade before submitting the sales order request.");
    }

    const requestedGrade = normalizeSalesOrderGrade(approvalItem.grade);
    const receiverPhoneValidation = validateReceiverPhoneForSalesOrder(input.receiverPhone);

    if (!receiverPhoneValidation.valid) {
      throw new Error(receiverPhoneValidation.reason ?? "Receiver phone number is invalid.");
    }

    if (!input.requiredDate) {
      throw new Error("Requested delivery date is required.");
    }

    if (isPastDeliveryDate(input.requiredDate)) {
      throw new Error("Requested delivery date cannot be in the past.");
    }

    if (isTodayDeliveryDate(input.requiredDate) && !`${input.notes ?? ""}`.trim()) {
      throw new Error("Urgent reason is required for same-day sales order request in notes.");
    }

    const approvedQuantityForGrade = calculateApprovedQuantityForGrade(approval, requestedGrade);

    if (approvedQuantityForGrade <= 0) {
      throw new Error(`Grade ${requestedGrade} is not available in the linked final approval.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Sales order quantity must be greater than zero.");
    }

    const existingOpenQuantity = calculateExistingOpenQuantityForApproval(database, approval.id, requestedGrade);
    const requestedQuantity = quantity;
    const remainingApprovalQuantity = Math.round((approvedQuantityForGrade - existingOpenQuantity) * 100) / 100;

    if (requestedQuantity > remainingApprovalQuantity) {
      throw new Error(
        `Requested quantity ${requestedQuantity} cum exceeds remaining approved quantity ${remainingApprovalQuantity} cum for grade ${requestedGrade}.`,
      );
    }

    const existingDuplicateRequest = findOpenSalesOrderRequestForApproval(database, approval.id, requestedGrade);

    if (existingDuplicateRequest) {
      throw new Error(
        `An open sales order request already exists for this approval and grade. Existing request: ${(existingDuplicateRequest as any).sorNumber ?? existingDuplicateRequest.id}. Update the existing request instead of creating a duplicate.`,
      );
    }

    const receiverPhone = receiverPhoneValidation.phone;

    const paymentTerms = normalizePaymentTerms(approval.paymentType, approval.paymentTerms);
    if (requiresPaymentReceipt(approval.paymentType, paymentTerms) && !input.paymentReceivedConfirmed) {
      throw new Error("Confirm full payment receipt for advance-payment orders.");
    }

    const poMissing = requiresPoUpload(paymentTerms) && !input.poDocumentUrl;
    const pdcMissing = requiresPdcUpload(paymentTerms) && !input.pdcDocumentUrl;

    if (gstin && !isValidGstin(gstin)) {
      throw new Error("Enter a valid GSTIN or leave it blank for challan-only dispatch.");
    }

    if (gstin && (!gstLegalName || !gstBillingAddress || !input.agentGstConfirmed)) {
      throw new Error("Confirm GST legal name and billing address before submitting a GST sales order.");
    }

    const duplicateOpenRequest = database.salesOrderRequests.find(
      (entry) =>
        entry.id !== approval.id &&
        entry.siteId === site.id &&
        entry.grade === approvalItem.grade &&
        entry.status !== "FINANCE_REJECTED" &&
        entry.status !== "SCHEDULE_REJECTED" &&
        entry.remainingQuantity > 0,
    );
    if (duplicateOpenRequest && duplicateOpenRequest.status === "SCHEDULE_APPROVED") {
      throw new Error("This site already has open approved quantity. Use Add Schedule until remaining quantity is exhausted.");
    }

    const amount = computeSalesOrderAmount(quantity, approvalItem.quotedPrice, input.pumpRequired);
    const now = nowIso();
    const sorNumber = getNextSalesOrderRequestNumber(database, now);
    const attachmentVersions = [input.poDocumentUrl, input.pdcDocumentUrl, input.gstCertificateUrl]
      .filter((url): url is string => Boolean(url))
      .map((url, index) => ({
        url,
        version: index + 1,
        uploadedAt: now,
        uploadedBy: user.id,
        superseded: false,
      }));
    const odooPreflight = gstin && !isOdooConfigured() ? "MANUAL_FALLBACK" : "READY";
    const preliminaryMixDesignStatus = (database.mixDesigns ?? []).some(
      (design) =>
        design.plantId === (lead.plantId ?? getUserPlantId(database, user.id)) &&
        design.grade === approvalItem.grade.toUpperCase().trim() &&
        design.isActive,
    )
      ? "READY"
      : "PENDING";
    const orderRequest: SalesOrderRequest = {
      id: randomUUID(),
      leadId: lead.id,
      siteId: site.id,
      approvalRequestId: approval.id,
      plantId: lead.plantId ?? getUserPlantId(database, user.id),
      customerName: approval.customerName,
      siteName: site.siteName,
      grade: requestedGrade,
      approvedPrice: approvalItem.quotedPrice,
      quantity,
      remainingQuantity: quantity,
      amount,
      siteAddress: site.siteAddress,
      oneWayDistanceKm: approval.oneWayDistanceKm,
      trafficCount: approval.trafficCount,
      paymentType: approval.paymentType,
      paymentTerms,
      mixDesignType: approval.mixDesignType,
      mixDesignId: null,
      slump: input.slump.trim(),
      receiverName: input.receiverName.trim(),
      receiverPhone,
      poDocumentUrl: input.poDocumentUrl,
      pdcDocumentUrl: input.pdcDocumentUrl,
      gstin: gstin || null,
      gstPan,
      gstLegalName: gstLegalName || null,
      gstBillingAddress: gstBillingAddress || null,
      gstCertificateUrl: input.gstCertificateUrl,
      gstVerificationStatus: gstin || input.gstCertificateUrl ? "PENDING_ACCOUNTS" : "NOT_PROVIDED",
      gstVerifiedBy: null,
      gstVerifiedAt: null,
      gstVerificationNote: null,
      agentGstConfirmedAt: gstin && input.agentGstConfirmed ? nowIso() : null,
      odooPartnerId: null,
      odooLedgerSyncStatus: "NOT_REQUIRED",
      odooLedgerSyncError: null,
      odooLedgerSyncedAt: null,
      odooSaleOrderId: null,
      odooSaleOrderName: null,
      odooSalesOrderSyncStatus: "NOT_REQUIRED",
      odooSalesOrderSyncError: null,
      odooSalesOrderSyncedAt: null,
      shippingAddress: site.siteAddress,
      plannedCastingType,
      actualCastingType: "DUMP",
      pumpDispatchStatus: "NOT_DISPATCHED",
      pumpDispatchedBy: null,
      pumpDispatchedAt: null,
      pumpVehicleNumber: null,
      pumpOperatorName: null,
      pumpOperatorPhone: null,
      pumpDispatchNote: null,
      paymentReceivedConfirmed: input.paymentReceivedConfirmed,
      financeChecklist: null,
      manualPaymentVerification: null,
      ledgerDecisionStatus: gstin ? "GST_CLIENT_ODOO_LEDGER" : "NON_GST_INTERNAL_LEDGER",
      linkedLedgerCustomerName: null,
      duplicateLedgerConfidence: null,
      poPdcExceptionStatus: poMissing || pdcMissing ? "REQUIRED" : "NOT_REQUIRED",
      poPdcExceptionReason: null,
      poPdcExceptionRequestedBy: null,
      poPdcExceptionRequestedAt: null,
      poPdcExceptionDecidedBy: null,
      poPdcExceptionDecidedAt: null,
      creditRiskCategory: "LOW",
      creditLimitAmount: null,
      creditPeriodDays: null,
      creditOverrideApprovedBy: null,
      creditOverrideApprovedAt: null,
      creditOverrideExpiresAt: null,
      creditOverrideAmountLimit: null,
      creditOverrideReason: null,
      salesOrderFinalChecklist: null,
      salesOrderPreviewConfirmedBy: null,
      salesOrderPreviewConfirmedAt: null,
      salesOrderPreviewHash: null,
      salesOrderCopyUrl: null,
      requiredDate: requiredDate.toISOString(),
      pumpRequired: input.pumpRequired,
      priority: input.priority,
      notes: input.notes.trim(),
      status: "PENDING_FINANCE",
      financeReviewedBy: null,
      financeReviewedAt: null,
      financeNote: null,
      scheduleDateTime: null,
      scheduleReceiverName: null,
      scheduleReceiverPhone: null,
      scheduleRequestedAt: null,
      scheduleDecidedBy: null,
      scheduleDecidedAt: null,
      scheduleNote: null,
      createdBy: user.id,
      createdAt: now,
      sorNumber,
      isDuplicateRequest: Boolean(duplicateOpenRequest),
      duplicateOfOrderId: duplicateOpenRequest?.id ?? null,
      financeRejectionReason: null,
      financeRejectionHistory: [],
      correctionResubmittedAt: null,
      correctionResubmittedBy: null,
      odooPreflight,
      odooPreflightError: odooPreflight === "MANUAL_FALLBACK" ? "Odoo is not configured; manual fallback required." : null,
      preliminaryMixDesignStatus,
      postFinanceLocked: false,
      postFinanceLockedAt: null,
      internalReference: sorNumber,
      revisionType: duplicateOpenRequest ? "SCHEDULE" : "NEW",
      deliveryDateValidated: true,
      isUrgent: input.priority === "URGENT",
      urgentReason: input.priority === "URGENT" ? input.notes.trim() : null,
      receiverPhoneValidated: true,
      plantLockedAt: null,
      plantChangeApprovedBy: null,
      plantChangeReason: null,
      orderQuantity: quantity,
      attachmentVersions,
      fulfillmentStatus: "OPEN",
      isOpenVolume: false,
      parentOrderId: duplicateOpenRequest?.id ?? null,
      childOrderIds: [],
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      editHistory: [],
    };

    const approvalPlantId = (approval as any).plantId ?? null;
    const requestedPlantId = (input as any).plantId ?? approvalPlantId;
    const plantChangedFromApproval = Boolean(approvalPlantId && requestedPlantId && approvalPlantId !== requestedPlantId);
    const plantChangeReason = `${(input as any).plantChangeReason ?? ""}`.trim();

    if (plantChangedFromApproval && !plantChangeReason) {
      throw new Error("Plant change reason is required when sales order plant differs from final approval plant.");
    }

    if (duplicateOpenRequest) {
      duplicateOpenRequest.childOrderIds ??= [];
      duplicateOpenRequest.childOrderIds.push(orderRequest.id);
    }

    database.salesOrderRequests.unshift(orderRequest);

    logAudit(
      database,
      user,
      "SalesOrderRequest",
      orderRequest.id,
      "CREATE",
      `Created sales order request ${(orderRequest as any).sorNumber ?? orderRequest.id} for grade ${requestedGrade}, quantity ${requestedQuantity} cum, delivery date ${input.requiredDate}. Remaining approved quantity after request: ${Math.max(remainingApprovalQuantity - requestedQuantity, 0)} cum.${
        plantChangedFromApproval ? ` Plant changed from ${approvalPlantId} to ${requestedPlantId}. Reason: ${plantChangeReason}.` : ""
      }`,
    );
    return orderRequest;
  });
}

export async function reviseSalesOrderQuantity(
  user: User,
  orderId: string,
  input: { revisedQuantity: number; reason: string },
) {
  assertRole(user, ["SALES_AGENT", "MANAGER", "ACCOUNTING"]);

  const revisedQuantity = Math.round(Number(input.revisedQuantity) * 10) / 10;
  const reason = input.reason.trim();

  if (!Number.isFinite(revisedQuantity) || revisedQuantity <= 0) {
    throw new Error("Revised quantity must be greater than zero.");
  }
  if (!reason) {
    throw new Error("Quantity revision reason is required.");
  }

  return updateDatabase((database) => {
    const order = database.salesOrderRequests.find((entry) => entry.id === orderId);
    if (!order) {
      throw new Error("Sales order request not found.");
    }
    if (user.role === "SALES_AGENT" && order.createdBy !== user.id) {
      throw new Error("You can only revise your own sales order request.");
    }
    if (order.fulfillmentStatus === "FULLY_FULFILLED" || order.remainingQuantity <= 0) {
      throw new Error("Fully fulfilled sales orders cannot be revised. Create a new order for the next requirement.");
    }

    const dispatchedQuantity = Math.max(0, Math.round((order.quantity - order.remainingQuantity) * 10) / 10);
    if (revisedQuantity < dispatchedQuantity) {
      throw new Error(`Revised quantity cannot be less than already dispatched quantity (${dispatchedQuantity} CUM).`);
    }

    const oldQuantity = order.quantity;
    const quantityDifference = Math.round((revisedQuantity - oldQuantity) * 10) / 10;
    const now = nowIso();

    order.quantity = revisedQuantity;
    order.orderQuantity = revisedQuantity;
    order.remainingQuantity = Math.round((order.remainingQuantity + quantityDifference) * 10) / 10;
    order.amount = computeSalesOrderAmount(revisedQuantity, order.approvedPrice, order.pumpRequired);
    order.revisionType = "REVISION";
    order.internalReference = order.internalReference ?? order.sorNumber ?? order.id;
    order.editHistory ??= [];
    order.editHistory.push({
      field: "quantity",
      oldValue: String(oldQuantity),
      newValue: String(revisedQuantity),
      changedBy: user.id,
      changedAt: now,
      reason,
    });
    order.fulfillmentStatus = order.remainingQuantity <= 0 ? "FULLY_FULFILLED" : dispatchedQuantity > 0 ? "PARTIALLY_FULFILLED" : "OPEN";

    logAudit(
      database,
      user,
      "SalesOrderRequest",
      order.id,
      "QUANTITY_REVISION",
      `Revised sales order quantity from ${oldQuantity} CUM to ${revisedQuantity} CUM. Reason: ${reason}.`,
    );
    return order;
  });
}

type FinanceReviewInput = {
  financeRejectionReason?: SalesOrderRequest["financeRejectionReason"];
  financeChecklist?: Partial<{
    gstChecked: boolean;
    gstCertificateChecked: boolean;
    legalNameChecked: boolean;
    billingAddressChecked: boolean;
    poChecked: boolean;
    pdcChecked: boolean;
    paymentProofChecked: boolean;
    amountReceivedChecked: boolean;
    outstandingChecked: boolean;
    overdueChecked: boolean;
    creditLimitChecked: boolean;
    accountantRemarks: string;
  }>;
  manualPaymentVerification?: Partial<{
    amountReceived: number;
    paymentMode: PaymentVerificationMode;
    utrNumber: string | null;
    chequeNumber: string | null;
    cashVoucherNumber: string | null;
    paymentDate: string;
    paymentProofUrl: string | null;
    bankCashAccount: string;
  }>;
  ledgerDecisionStatus?: LedgerDecisionStatus | null;
  linkedLedgerCustomerName?: string | null;
  duplicateLedgerConfidence?: number | null;
  creditLimitAmount?: number | null;
  creditPeriodDays?: number | null;
  creditRiskCategory?: CreditRiskCategory;
};

const LEDGER_DECISION_STATUSES: LedgerDecisionStatus[] = [
  "GST_CLIENT_ODOO_LEDGER",
  "NON_GST_INTERNAL_LEDGER",
  "GST_MATCH_FOUND",
  "GST_NO_MATCH",
  "LINK_EXISTING_LEDGER",
  "CREATE_NEW_SITE",
  "CREATE_NEW_LEDGER",
];

const PAYMENT_VERIFICATION_MODES: PaymentVerificationMode[] = ["CASH", "CHEQUE", "NEFT", "UPI", "BANK_TRANSFER"];

function applyFinanceReviewInput(user: User, request: SalesOrderRequest, input?: FinanceReviewInput) {
  if (!input) {
    return;
  }

  const now = nowIso();

  if (input.financeChecklist) {
    const checklist = input.financeChecklist;
    request.financeChecklist = {
      gstChecked: Boolean(checklist.gstChecked),
      gstCertificateChecked: Boolean(checklist.gstCertificateChecked),
      legalNameChecked: Boolean(checklist.legalNameChecked),
      billingAddressChecked: Boolean(checklist.billingAddressChecked),
      poChecked: Boolean(checklist.poChecked),
      pdcChecked: Boolean(checklist.pdcChecked),
      paymentProofChecked: Boolean(checklist.paymentProofChecked),
      amountReceivedChecked: Boolean(checklist.amountReceivedChecked),
      outstandingChecked: Boolean(checklist.outstandingChecked),
      overdueChecked: Boolean(checklist.overdueChecked),
      creditLimitChecked: Boolean(checklist.creditLimitChecked),
      accountantRemarks: `${checklist.accountantRemarks ?? ""}`.trim(),
      verifiedBy: user.id,
      verifiedAt: now,
    };
  }

  if (input.manualPaymentVerification) {
    const verification = input.manualPaymentVerification;
    const amountReceived = Number(verification.amountReceived ?? 0);
    const paymentMode = PAYMENT_VERIFICATION_MODES.includes(verification.paymentMode as PaymentVerificationMode)
      ? (verification.paymentMode as PaymentVerificationMode)
      : "CASH";
    const paymentDate = verification.paymentDate ? new Date(`${verification.paymentDate}`).toISOString() : now;
    request.manualPaymentVerification = {
      amountReceived,
      paymentMode,
      utrNumber: verification.utrNumber?.trim() || null,
      chequeNumber: verification.chequeNumber?.trim() || null,
      cashVoucherNumber: verification.cashVoucherNumber?.trim() || null,
      paymentDate,
      paymentProofUrl: verification.paymentProofUrl?.trim() || null,
      bankCashAccount: `${verification.bankCashAccount ?? ""}`.trim(),
      verifiedBy: user.id,
      verifiedAt: now,
      differenceFromRequiredAmount: Math.round((amountReceived - request.amount) * 100) / 100,
    };
  }

  if (input.ledgerDecisionStatus && LEDGER_DECISION_STATUSES.includes(input.ledgerDecisionStatus)) {
    request.ledgerDecisionStatus = input.ledgerDecisionStatus;
  }

  request.linkedLedgerCustomerName = input.linkedLedgerCustomerName?.trim() || (request.linkedLedgerCustomerName ?? null);
  request.duplicateLedgerConfidence =
    typeof input.duplicateLedgerConfidence === "number" && Number.isFinite(input.duplicateLedgerConfidence)
      ? Math.max(0, Math.min(input.duplicateLedgerConfidence, 1))
      : request.duplicateLedgerConfidence ?? null;

  const creditLimitAmount = Number(input.creditLimitAmount);
  if (Number.isFinite(creditLimitAmount) && creditLimitAmount >= 0) {
    request.creditLimitAmount = creditLimitAmount;
  }

  const creditPeriodDays = Number(input.creditPeriodDays);
  if (Number.isFinite(creditPeriodDays) && creditPeriodDays >= 0) {
    request.creditPeriodDays = creditPeriodDays;
  }

  if (input.creditRiskCategory === "LOW" || input.creditRiskCategory === "MEDIUM" || input.creditRiskCategory === "HIGH" || input.creditRiskCategory === "BLOCKED") {
    request.creditRiskCategory = input.creditRiskCategory;
  }
}

function getActiveOrderExposure(database: Database, request: SalesOrderRequest) {
  return database.salesOrderRequests
    .filter((entry) => entry.id !== request.id && entry.customerName.trim().toLowerCase() === request.customerName.trim().toLowerCase())
    .filter((entry) => entry.status !== "FINANCE_REJECTED" && entry.status !== "SCHEDULE_REJECTED")
    .reduce((sum, entry) => sum + entry.amount, request.amount);
}

function assertFinanceApprovalSafeguards(database: Database, request: SalesOrderRequest) {
  if (!isFinanceChecklistComplete(request.financeChecklist)) {
    throw new Error("Complete and save the finance verification checklist before ledger approval.");
  }

  const paymentTerms = normalizePaymentTerms(request.paymentType, request.paymentTerms);
  if (requiresPaymentReceipt(request.paymentType, paymentTerms) && !isManualPaymentVerificationComplete(request.manualPaymentVerification)) {
    throw new Error("Complete manual payment verification before approving an advance-payment ledger.");
  }

  if (request.gstin && request.ledgerDecisionStatus === "NON_GST_INTERNAL_LEDGER") {
    throw new Error("GST customers must use the GST/Odoo ledger path.");
  }

  if (!request.gstin && request.ledgerDecisionStatus === "GST_CLIENT_ODOO_LEDGER") {
    throw new Error("Non-GST customers must use the internal app ledger path.");
  }

  if ((requiresPoUpload(paymentTerms) && !request.poDocumentUrl) || (requiresPdcUpload(paymentTerms) && !request.pdcDocumentUrl)) {
    if (request.poPdcExceptionStatus !== "APPROVED") {
      throw new Error("Missing PO/PDC requires manager exception approval before ledger approval.");
    }
  }

  if (request.paymentType === "CREDIT") {
    const account = findCustomerAccountByName(database.customerAccounts ?? [], request.customerName);
    const creditLimit = request.creditLimitAmount ?? account?.creditLimit ?? request.amount;
    const currentOutstanding = Math.max(0, getCustomerLedgerBalance(database.customerLedgerEntries ?? [], request.customerName));
    const activeOrderExposure = getActiveOrderExposure(database, request);
    const availableCredit = calculateAvailableCredit({ creditLimit, currentOutstanding, activeOrderExposure });
    const riskCategory = request.creditRiskCategory ?? account?.riskLevel ?? "LOW";

    if (riskCategory === "BLOCKED" && !request.creditOverrideApprovedBy) {
      throw new Error("Customer risk is blocked. Manager credit override is required.");
    }

    if (availableCredit < 0 && !request.creditOverrideApprovedBy) {
      throw new Error(`Available credit is negative (Rs.${availableCredit}). Manager credit override is required.`);
    }
  }
}

export async function reviewSalesOrderRequestByAccounting(
  user: User,
  requestId: string,
  status: "FINANCE_VERIFIED" | "FINANCE_REJECTED",
  note: string,
  input?: FinanceReviewInput,
) {
  assertRole(user, ["ACCOUNTING"]);

  const orderRequest = await updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.status !== "PENDING_FINANCE") {
      throw new Error("This sales order request is not waiting for finance review.");
    }

    applyFinanceReviewInput(user, request, input);
    if (status === "FINANCE_VERIFIED") {
      assertFinanceApprovalSafeguards(database, request);
    }

    if (status === "FINANCE_REJECTED" && !input?.financeRejectionReason && !note.trim()) {
      throw new Error("Finance rejection requires a structured reason or note.");
    }

    request.status = status;
    request.financeReviewedBy = user.id;
    request.financeReviewedAt = nowIso();
    request.financeNote = note || request.financeChecklist?.accountantRemarks || "";
    if (status === "FINANCE_REJECTED") {
      request.financeRejectionReason = input?.financeRejectionReason ?? "OTHER";
      request.financeRejectionHistory ??= [];
      request.financeRejectionHistory.push({
        reason: request.financeRejectionReason,
        note: request.financeNote || "Finance rejected request.",
        rejectedBy: user.id,
        rejectedAt: request.financeReviewedAt,
      });
    }
    if (status === "FINANCE_VERIFIED") {
      request.postFinanceLocked = true;
      request.postFinanceLockedAt = request.financeReviewedAt;
      request.plantLockedAt = request.financeReviewedAt;
    }
    if (status === "FINANCE_VERIFIED" && (request.gstin || request.gstCertificateUrl)) {
      request.gstVerificationStatus = "VERIFIED";
      request.gstVerifiedBy = user.id;
      request.gstVerifiedAt = request.financeReviewedAt;
      request.gstVerificationNote = note || "Accounts verified the customer ledger and GST/legal details.";
    }
    if (status === "FINANCE_REJECTED" && request.gstVerificationStatus === "PENDING_ACCOUNTS") {
      request.gstVerificationStatus = "REJECTED";
      request.gstVerificationNote = note || "Accounts rejected the customer legal details.";
    }
    request.odooLedgerSyncStatus = shouldSyncSalesOrderToOdoo(request) ? "PENDING" : "NOT_REQUIRED";
    request.odooLedgerSyncError = null;
    request.odooLedgerSyncedAt = null;
    request.odooSalesOrderSyncStatus = "NOT_REQUIRED";
    request.odooSalesOrderSyncError = null;
    request.odooSalesOrderSyncedAt = null;

    if (status === "FINANCE_VERIFIED") {
      database.customerAccounts ??= [];
      database.customerLedgerEntries ??= [];
      const existingAccount = findCustomerAccountByName(database.customerAccounts, request.customerName);
      const account = existingAccount ?? createCustomerAccountFromSalesOrder(randomUUID(), request);
      account.creditLimit = request.creditLimitAmount ?? account.creditLimit;
      account.creditPeriodDays = request.creditPeriodDays ?? account.creditPeriodDays;
      account.riskLevel = request.creditRiskCategory ?? account.riskLevel;
      account.activeOrderExposure = getActiveOrderExposure(database, request);
      account.outstandingAmount = Math.max(0, getCustomerLedgerBalance(database.customerLedgerEntries, request.customerName));
      if (!existingAccount) {
        database.customerAccounts.push(account);
        logAudit(
          database,
          user,
          "CustomerAccount",
          account.id,
          "CREATE",
          `Created customer ledger account for ${account.customerName}.`,
        );
      } else {
        account.creditApprovalHistory ??= [];
      }

      const advanceReferenceId = getAdvanceReceiptReferenceId(request.id);
      const advanceCreditExists = database.customerLedgerEntries.some((entry) => entry.referenceId === advanceReferenceId);
      if (shouldCreateAdvanceReceiptCredit(request) && !advanceCreditExists) {
        const entry = createAdvanceReceiptLedgerEntry(randomUUID(), request, user.id);
        entry.runningBalance = getCustomerLedgerBalance(database.customerLedgerEntries, request.customerName) - entry.amount;
        database.customerLedgerEntries.push(entry);
        account.outstandingAmount = Math.max(0, account.outstandingAmount - entry.amount);
        account.lastPaymentAt = entry.createdAt;

        logAudit(
          database,
          user,
          "CustomerLedger",
          entry.id,
          "ADVANCE_CREDIT_POSTED",
          `Posted advance payment credit of Rs.${entry.amount.toLocaleString("en-IN")} for ${request.customerName}.`,
        );
      }
    }

    logAudit(
      database,
      user,
      "SalesOrderRequest",
      request.id,
      status,
      note || "Accounting reviewed the sales order request.",
    );

    return request;
  });

  return syncOdooLedgerAfterFinanceReview(user, orderRequest);
}

export async function saveSalesOrderFinalChecklistByAccounting(
  user: User,
  requestId: string,
  input: Partial<{
    gradeConfirmed: boolean;
    quantityConfirmed: boolean;
    rateConfirmed: boolean;
    paymentTermsConfirmed: boolean;
    requiredDateTimeConfirmed: boolean;
    castingTypeConfirmed: boolean;
    pumpDumpRequirementConfirmed: boolean;
    receiverConfirmed: boolean;
    phoneConfirmed: boolean;
    deliveryAddressConfirmed: boolean;
    plantConfirmed: boolean;
    taxChallanModeConfirmed: boolean;
    accountantRemarks: string;
  }>,
) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.status !== "FINANCE_VERIFIED") {
      throw new Error("Final sales order checklist can be saved only after ledger creation.");
    }

    const remarks = `${input.accountantRemarks ?? ""}`.trim();
    if (!remarks) {
      throw new Error("Accountant remarks are required for the final sales order checklist.");
    }

    request.salesOrderFinalChecklist = {
      gradeConfirmed: Boolean(input.gradeConfirmed),
      quantityConfirmed: Boolean(input.quantityConfirmed),
      rateConfirmed: Boolean(input.rateConfirmed),
      paymentTermsConfirmed: Boolean(input.paymentTermsConfirmed),
      requiredDateTimeConfirmed: Boolean(input.requiredDateTimeConfirmed),
      castingTypeConfirmed: Boolean(input.castingTypeConfirmed),
      pumpDumpRequirementConfirmed: Boolean(input.pumpDumpRequirementConfirmed),
      receiverConfirmed: Boolean(input.receiverConfirmed),
      phoneConfirmed: Boolean(input.phoneConfirmed),
      deliveryAddressConfirmed: Boolean(input.deliveryAddressConfirmed),
      plantConfirmed: Boolean(input.plantConfirmed),
      taxChallanModeConfirmed: Boolean(input.taxChallanModeConfirmed),
      accountantRemarks: remarks,
      verifiedBy: user.id,
      verifiedAt: nowIso(),
    };
    request.salesOrderPreviewConfirmedBy = null;
    request.salesOrderPreviewConfirmedAt = null;
    request.salesOrderPreviewHash = null;

    logAudit(database, user, "SalesOrderRequest", request.id, "FINAL_CHECKLIST_SAVED", remarks);
    return request;
  });
}

export async function requestPoPdcExceptionByAccounting(user: User, requestId: string, reason: string) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new Error("Exception reason is required.");
    }

    request.poPdcExceptionStatus = "REQUESTED";
    request.poPdcExceptionReason = normalizedReason;
    request.poPdcExceptionRequestedBy = user.id;
    request.poPdcExceptionRequestedAt = nowIso();
    request.poPdcExceptionDecidedBy = null;
    request.poPdcExceptionDecidedAt = null;
    logAudit(database, user, "SalesOrderRequest", request.id, "PO_PDC_EXCEPTION_REQUESTED", normalizedReason);
    return request;
  });
}

export async function decidePoPdcExceptionByManager(user: User, requestId: string, approved: boolean, note: string) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.poPdcExceptionStatus !== "REQUESTED") {
      throw new Error("This request is not waiting for a PO/PDC exception decision.");
    }

    const normalizedNote = note.trim();
    if (!normalizedNote) {
      throw new Error("Manager note is required for exception decision.");
    }

    request.poPdcExceptionStatus = approved ? "APPROVED" : "REJECTED";
    request.poPdcExceptionDecidedBy = user.id;
    request.poPdcExceptionDecidedAt = nowIso();
    request.poPdcExceptionReason = `${request.poPdcExceptionReason ?? ""} | Manager: ${normalizedNote}`;
    logAudit(database, user, "SalesOrderRequest", request.id, approved ? "PO_PDC_EXCEPTION_APPROVED" : "PO_PDC_EXCEPTION_REJECTED", normalizedNote);
    return request;
  });
}

export async function approveCreditOverrideByManager(
  user: User,
  requestId: string,
  input: {
    amountLimit: number;
    expiresAt: string;
    reason: string;
  },
) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    const amountLimit = Number(input.amountLimit);
    if (!Number.isFinite(amountLimit) || amountLimit <= 0) {
      throw new Error("Credit override amount limit must be greater than zero.");
    }

    const expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error("Credit override expiry date is invalid.");
    }

    const reason = input.reason.trim();
    if (!reason) {
      throw new Error("Credit override reason is required.");
    }

    request.creditOverrideApprovedBy = user.id;
    request.creditOverrideApprovedAt = nowIso();
    request.creditOverrideExpiresAt = expiresAt.toISOString();
    request.creditOverrideAmountLimit = amountLimit;
    request.creditOverrideReason = reason;
    logAudit(database, user, "SalesOrderRequest", request.id, "CREDIT_OVERRIDE_APPROVED", reason);
    return request;
  });
}

export async function confirmSalesOrderPreviewByAccounting(user: User, requestId: string) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.status !== "FINANCE_VERIFIED") {
      throw new Error("Preview can be confirmed only after ledger creation.");
    }

    if (!isSalesOrderFinalChecklistComplete(request.salesOrderFinalChecklist)) {
      throw new Error("Complete the final sales order checklist before preview confirmation.");
    }

    request.salesOrderPreviewConfirmedBy = user.id;
    request.salesOrderPreviewConfirmedAt = nowIso();
    request.salesOrderPreviewHash = buildSalesOrderPreviewHash(request);
    logAudit(database, user, "SalesOrderRequest", request.id, "SALES_ORDER_PREVIEW_CONFIRMED", "Accounts confirmed the final sales order preview.");
    return request;
  });
}

export async function createSalesOrderFromLedgerByAccounting(user: User, requestId: string, note: string) {
  assertRole(user, ["ACCOUNTING"]);

  const orderRequest = await updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.status !== "FINANCE_VERIFIED") {
      throw new Error("Create the customer ledger before creating the sales order.");
    }

    if (!isSalesOrderFinalChecklistComplete(request.salesOrderFinalChecklist)) {
      throw new Error("Complete the final sales order checklist before creating the sales order.");
    }

    if (!request.salesOrderPreviewConfirmedAt || request.salesOrderPreviewHash !== buildSalesOrderPreviewHash(request)) {
      throw new Error("Confirm the sales order preview before final creation. If details changed, confirm preview again.");
    }

    const scheduleDateTime = new Date(request.requiredDate);
    if (Number.isNaN(scheduleDateTime.getTime())) {
      throw new Error("Sales order required date is invalid. Ask the sales agent to correct the request.");
    }

    if (!request.receiverName.trim() || !request.receiverPhone.trim()) {
      throw new Error("Receiver name and phone number are required before creating the sales order.");
    }

    const mixDesignResult = ensureAutoMixDesignForSalesOrder(database, request, user);
    const now = nowIso();
    request.scheduleDateTime = scheduleDateTime.toISOString();
    request.scheduleReceiverName = request.receiverName.trim();
    request.scheduleReceiverPhone = request.receiverPhone.trim();
    request.scheduleRequestedAt = now;
    request.scheduleDecidedAt = null;
    request.scheduleDecidedBy = null;
    request.scheduleNote =
      note.trim() ||
      "Accounts created the sales order from the verified customer ledger and sent it to production.";
    request.status = "SCHEDULE_PENDING";
    request.salesOrderCopyUrl = `/api/sales-order-requests/${request.id}/download`;
    request.odooSalesOrderSyncStatus = shouldSyncSalesOrderToOdoo(request) ? "PENDING" : "NOT_REQUIRED";
    request.odooSalesOrderSyncError = null;
    request.odooSalesOrderSyncedAt = null;

    logAudit(
      database,
      user,
      "SalesOrderRequest",
      request.id,
      "SALES_ORDER_CREATED",
      `${request.scheduleNote} Mix design ${mixDesignResult.created ? "auto-created" : "linked"}: ${mixDesignResult.design.grade} v${mixDesignResult.design.version}.`,
    );

    return request;
  });

  return syncOdooSalesOrderAfterCreation(user, orderRequest);
}

export async function submitScheduleRequest(
  user: User,
  requestId: string,
  input: {
    scheduleDateTime: string;
    receiverName: string;
    receiverPhone: string;
    note: string;
  },
) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.createdBy !== user.id) {
      throw new Error("You can only schedule your own sales order requests.");
    }

    if (request.status !== "SCHEDULE_REJECTED") {
      throw new Error("Accounts must create the sales order before it enters production scheduling.");
    }

    const scheduleDateTime = new Date(input.scheduleDateTime);
    if (Number.isNaN(scheduleDateTime.getTime())) {
      throw new Error("Choose a valid schedule date and time.");
    }

    if (!input.receiverName.trim() || !input.receiverPhone.trim()) {
      throw new Error("Receiver name and phone number are required for scheduling.");
    }

    request.scheduleDateTime = scheduleDateTime.toISOString();
    request.scheduleReceiverName = input.receiverName.trim();
    request.scheduleReceiverPhone = input.receiverPhone.trim();
    request.scheduleRequestedAt = nowIso();
    request.scheduleNote = input.note.trim();
    request.scheduleDecidedAt = null;
    request.scheduleDecidedBy = null;
    request.status = "SCHEDULE_PENDING";

    logAudit(
      database,
      user,
      "SalesOrderRequest",
      request.id,
      "SCHEDULE_REQUEST",
      `Requested schedule slot for ${request.customerName} on ${request.scheduleDateTime}.`,
    );

    return request;
  });
}

export async function decideSalesOrderSchedule(
  user: User,
  requestId: string,
  status: "SCHEDULE_APPROVED" | "SCHEDULE_REJECTED",
  note: string,
) {
  assertRole(user, ["PRODUCTION_MANAGER"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.status !== "SCHEDULE_PENDING") {
      throw new Error("This sales order request is not waiting for production scheduling.");
    }

    request.status = status;
    request.scheduleDecidedBy = user.id;
    request.scheduleDecidedAt = nowIso();
    request.scheduleNote = note || request.scheduleNote;

    logAudit(
      database,
      user,
      "SalesOrderRequest",
      request.id,
      status,
      note || "Production schedule decision updated.",
    );

    return request;
  });
}

export async function updateSalesOrderPumpDispatch(
  user: User,
  requestId: string,
  input: {
    pumpDispatched: boolean;
    pumpVehicleNumber: string;
    pumpOperatorName: string;
    pumpOperatorPhone: string;
    note: string;
  },
) {
  assertRole(user, ["PRODUCTION_MANAGER"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.status !== "SCHEDULE_APPROVED") {
      throw new Error("Pump dispatch can be confirmed only after production schedule approval.");
    }

    const pumpDispatchStatus = input.pumpDispatched ? "DISPATCHED" : "NOT_DISPATCHED";
    const actualCastingType = pumpDispatchStatus === "DISPATCHED" ? "PUMP" : "DUMP";
    request.pumpDispatchStatus = pumpDispatchStatus;
    request.actualCastingType = actualCastingType;
    request.pumpDispatchedBy = user.id;
    request.pumpDispatchedAt = nowIso();
    request.pumpVehicleNumber = input.pumpDispatched ? input.pumpVehicleNumber.trim() || null : null;
    request.pumpOperatorName = input.pumpDispatched ? input.pumpOperatorName.trim() || null : null;
    request.pumpOperatorPhone = input.pumpDispatched ? input.pumpOperatorPhone.trim() || null : null;
    request.pumpDispatchNote =
      input.note.trim() ||
      (input.pumpDispatched ? "Production manager confirmed pump dispatch." : "Production manager confirmed no pump dispatch; dispatch will be treated as dump.");

    logAudit(
      database,
      user,
      "SalesOrderRequest",
      request.id,
      "PUMP_DISPATCH_UPDATE",
      `${request.pumpDispatchNote} Planned ${request.plannedCastingType}, actual ${request.actualCastingType}.`,
    );

    return request;
  });
}

export async function decideApprovalRequest(
  user: User,
  approvalId: string,
  status: "APPROVED" | "REJECTED",
  decisionNote: string,
) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const approval = database.approvalRequests.find((entry) => entry.id === approvalId);

    if (!approval) {
      throw new Error("Approval request not found.");
    }

    if (approval.status !== "PENDING") {
      throw new Error("This final approval request is already decided and locked.");
    }

    const managerDecisionNote = decisionNote.trim();

    if (status === "APPROVED" && finalApprovalDecisionNeedsManagerNote(approval) && !managerDecisionNote) {
      throw new Error(
        "Manager note is required for final approval exceptions such as rate variation, route feasibility issue, direct approval without quotation, quotation mismatch, or commercial variation.",
      );
    }

    if (status === "REJECTED" && !managerDecisionNote) {
      throw new Error("Rejection reason is required for final approval.");
    }

    if (status === "APPROVED") {
      const duplicateApprovedApproval = database.approvalRequests.find(
        (entry) =>
          entry.id !== approval.id &&
          entry.siteId === approval.siteId &&
          entry.status === "APPROVED" &&
          entry.items.some((entryItem) =>
            approval.items.some(
              (approvalItem) =>
                normalizeGradeKeyForApproval(entryItem.grade) === normalizeGradeKeyForApproval(approvalItem.grade),
            ),
          ),
      );

      if (duplicateApprovedApproval) {
        throw new Error(
          "Another approved final approval already exists for this site and grade. Reject or close the duplicate before approving this one.",
        );
      }
    }

    approval.status = status;
    approval.decisionNote = managerDecisionNote || (status === "APPROVED" ? "Approved by manager." : "Rejected by manager.");
    approval.decidedAt = nowIso();
    approval.decidedBy = user.id;
    if (status === "APPROVED" && approval.rateValidationStatus === "BELOW_MINIMUM") {
      approval.rateValidationStatus = "OVERRIDE_APPROVED";
    }
    const finalApproval = database.finalApprovals?.find((entry) => entry.id === approval.finalApprovalRecordId);
    if (finalApproval) {
      finalApproval.status = status === "APPROVED" ? "APPROVED" : "REJECTED";
      if (status === "APPROVED") {
        finalApproval.approvedBy = user.id;
        finalApproval.approvedAt = approval.decidedAt;
        finalApproval.lockedAt = approval.decidedAt;
        finalApproval.creditApprovalStatus = approval.paymentType === "CREDIT" ? "APPROVED" : "NOT_REQUIRED";
      } else {
        finalApproval.rejectedBy = user.id;
        finalApproval.rejectedAt = approval.decidedAt;
        finalApproval.rejectionReason = decisionNote || "Rejected by manager.";
      }
    }
    logAudit(
      database,
      user,
      "ApprovalRequest",
      approval.id,
      status,
      approval.decisionNote || "Approval decision updated.",
    );
    return approval;
  });
}

export async function listVerificationQueue() {
  const readings = await readCollection("odometerReadings", {
    filters: [{ field: "status", op: "==", value: "MANUAL_REVIEW_REQUIRED" }],
  });
  return readings
    .sort((left, right) => compareIsoAsc(right.capturedAt, left.capturedAt));
}

export async function resolveVerification(user: User, readingId: string, manualValue: number, note: string) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (session) {
      const lock = getOdometerLockStatus(database, session.userId, session.date);
      if (lock.status === "PAID_LOCKED") {
        throw new Error("Paid reimbursement dates cannot be directly modified. Create an adjustment request outside the original paid claim.");
      }
    }

    reading.finalValue = manualValue;
    reading.managerFinalReading = manualValue;
    reading.status = "MANUAL_VERIFIED";
    reading.verifiedBy = user.id;
    reading.verificationNote = note;
    reading.managerReviewedAt = nowIso();
    reading.managerRemark = note;
    reading.reviewReason = null;
    logAudit(database, user, "OdometerReading", reading.id, "MANUAL_VERIFY", note || "Manager entered manual reading.");
    return reading;
  });
}

export async function createTask(
  user: User,
  input: Omit<Task, "id" | "plantId" | "status" | "assignedBy">,
) {
  assertRole(user, ["MANAGER", "ACCOUNTING"]);

  return updateDatabase((database) => {
    const task: Task = {
      id: randomUUID(),
      plantId: getUserPlantId(database, input.assignedTo),
      subject: input.subject,
      explanation: input.explanation,
      deadline: input.deadline,
      status: "OPEN",
      assignedTo: input.assignedTo,
      assignedBy: user.id,
    };

    database.tasks.unshift(task);
    logAudit(database, user, "Task", task.id, "CREATE", `Assigned task ${task.subject}.`);
    return task;
  });
}

export async function createHelpRequest(
  user: User,
  input: Omit<HelpRequest, "id" | "agentId" | "plantId" | "status" | "resolvedBy" | "resolutionNote">,
) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const request: HelpRequest = {
      id: randomUUID(),
      agentId: user.id,
      plantId: getUserPlantId(database, user.id),
      sessionDate: input.sessionDate,
      requestedField: input.requestedField,
      explanation: input.explanation,
      status: "OPEN",
      resolvedBy: null,
      resolutionNote: null,
    };

    database.helpRequests.unshift(request);
    logAudit(database, user, "HelpRequest", request.id, "CREATE", `Raised correction request for ${request.requestedField}.`);
    return request;
  });
}

export async function resolveHelpRequest(user: User, requestId: string, resolutionNote: string) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const request = database.helpRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Help request not found.");
    }

    request.status = "RESOLVED";
    request.resolvedBy = user.id;
    request.resolutionNote = resolutionNote;
    logAudit(database, user, "HelpRequest", request.id, "RESOLVE", resolutionNote || "Correction request resolved.");
    return request;
  });
}

export async function upsertTarget(user: User, agentId: string, month: string, quantityTarget: number) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    let target = database.targets.find((entry) => entry.userId === agentId && entry.month === month);

    if (!target) {
      target = {
        id: randomUUID(),
        userId: agentId,
        month,
        quantityTarget,
      };
      database.targets.push(target);
    } else {
      target.quantityTarget = quantityTarget;
    }

    logAudit(database, user, "Target", target.id, "UPSERT", `Target set to ${quantityTarget} for ${month}.`);
    return target;
  });
}

function getDashboardCollectionLimit(defaultValue: number) {
  const configured = Number(process.env.DASHBOARD_COLLECTION_LIMIT ?? "");
  return Number.isFinite(configured) && configured > 0 ? configured : defaultValue;
}

function getRecentDateKey(daysBack: number) {
  return toDateKey(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());
}

function getRecentIso(daysBack: number) {
  return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
}

function createDashboardDatabaseSlice(input: Partial<Database>): Database {
  return {
    users: [],
    authSessions: [],
    plants: [],
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
    tasks: [],
    helpRequests: [],
    targets: [],
    auditLogs: [],
    fleetVehicles: [],
    materialCostSnapshots: [],
    priceBenchmarks: [],
    customerAccounts: [],
    customerInvoices: [],
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
    ...input,
  };
}

function mergeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export type AgentDashboardHistoryScope = "recent" | "full";
export type AgentDashboardSection =
  | "leads"
  | "leadSites"
  | "readings"
  | "siteVisits"
  | "approvals"
  | "informalQuotations"
  | "salesOrders"
  | "tasks"
  | "reimbursements"
  | "targets"
  | "helpRequests"
  | "pipeline";

const DEFAULT_AGENT_DASHBOARD_SECTIONS: AgentDashboardSection[] = [
  "leads",
  "leadSites",
  "readings",
  "siteVisits",
  "approvals",
  "informalQuotations",
  "salesOrders",
  "tasks",
  "reimbursements",
  "targets",
  "helpRequests",
  "pipeline",
];

interface AgentDashboardReadOptions {
  historyScope?: AgentDashboardHistoryScope;
  recentDays?: number;
  sections?: AgentDashboardSection[];
}

function hasAgentDashboardSection(sectionSet: Set<AgentDashboardSection>, section: AgentDashboardSection) {
  return sectionSet.has(section);
}

async function getAgentScopedDashboardDatabase(user: User, options: AgentDashboardReadOptions = {}) {
  const monthKey = toMonthKey(nowIso());
  const historyScope = options.historyScope ?? "recent";
  const recentCutoff = getRecentDateKey(options.recentDays ?? 2);
  const sectionSet = new Set(options.sections ?? DEFAULT_AGENT_DASHBOARD_SECTIONS);
  const needsLeads = hasAgentDashboardSection(sectionSet, "leads") || hasAgentDashboardSection(sectionSet, "leadSites");
  const needsSessionReads =
    hasAgentDashboardSection(sectionSet, "readings") ||
    hasAgentDashboardSection(sectionSet, "siteVisits") ||
    hasAgentDashboardSection(sectionSet, "reimbursements");
  const [workdaySessions, leads, approvals, informalQuotationRequests, salesOrderRequests, tasks, reimbursementClaims, targets, helpRequests] =
    await Promise.all([
      readCollection("workdaySessions", { filters: [{ field: "userId", op: "==", value: user.id }] }),
      needsLeads ? readCollection("leads", { filters: [{ field: "agentId", op: "==", value: user.id }] }) : Promise.resolve([]),
      hasAgentDashboardSection(sectionSet, "approvals") || hasAgentDashboardSection(sectionSet, "pipeline")
        ? readCollection("approvalRequests", { filters: [{ field: "createdBy", op: "==", value: user.id }] })
        : Promise.resolve([]),
      hasAgentDashboardSection(sectionSet, "informalQuotations")
        ? readCollection("informalQuotationRequests", { filters: [{ field: "createdBy", op: "==", value: user.id }] })
        : Promise.resolve([]),
      hasAgentDashboardSection(sectionSet, "salesOrders")
        ? readCollection("salesOrderRequests", { filters: [{ field: "createdBy", op: "==", value: user.id }] })
        : Promise.resolve([]),
      hasAgentDashboardSection(sectionSet, "tasks")
        ? readCollection("tasks", { filters: [{ field: "assignedTo", op: "==", value: user.id }] })
        : Promise.resolve([]),
      hasAgentDashboardSection(sectionSet, "reimbursements")
        ? readCollection("reimbursementClaims", { filters: [{ field: "agentId", op: "==", value: user.id }] })
        : Promise.resolve([]),
      hasAgentDashboardSection(sectionSet, "targets")
        ? readCollection("targets", { filters: [{ field: "userId", op: "==", value: user.id }] })
        : Promise.resolve([]),
      hasAgentDashboardSection(sectionSet, "helpRequests")
        ? readCollection("helpRequests", { filters: [{ field: "agentId", op: "==", value: user.id }] })
        : Promise.resolve([]),
    ]);
  const recentSessions = workdaySessions.filter((entry) => entry.date >= recentCutoff);
  const claimedSessionIds = new Set(
    reimbursementClaims
      .filter((claim) => normalizeReimbursementStatus(claim.status) !== "PAYMENT_REJECTED")
      .flatMap((claim) => claim.lineItems.map((lineItem) => lineItem.sessionId)),
  );
  const visibleSessions =
    historyScope === "full"
      ? workdaySessions
      : hasAgentDashboardSection(sectionSet, "reimbursements")
        ? mergeById([...recentSessions, ...workdaySessions.filter((entry) => !claimedSessionIds.has(entry.id))])
        : recentSessions;
  const sessionIds = needsSessionReads ? visibleSessions.map((entry) => entry.id) : [];
  const leadIds = leads.map((entry) => entry.id);
  const [readings, siteVisits, leadSites] = await Promise.all([
    hasAgentDashboardSection(sectionSet, "readings") || hasAgentDashboardSection(sectionSet, "reimbursements")
      ? readCollectionByFieldValues("odometerReadings", "sessionId", sessionIds)
      : Promise.resolve([]),
    hasAgentDashboardSection(sectionSet, "siteVisits") || hasAgentDashboardSection(sectionSet, "reimbursements")
      ? readCollectionByFieldValues("siteVisits", "sessionId", sessionIds)
      : Promise.resolve([]),
    hasAgentDashboardSection(sectionSet, "leadSites")
      ? readCollectionByFieldValues("leadSites", "leadId", leadIds)
      : Promise.resolve([]),
  ]);

  return createDashboardDatabaseSlice({
    users: [user],
    workdaySessions: visibleSessions,
    leads,
    approvalRequests: approvals,
    informalQuotationRequests,
    salesOrderRequests,
    tasks,
    reimbursementClaims,
    targets: targets.filter((entry) => entry.month === monthKey),
    helpRequests,
    odometerReadings: readings,
    siteVisits,
    leadSites,
  });
}

async function getManagerScopedDashboardDatabase() {
  const recentDateKey = getRecentDateKey(45);
  const recentIso = getRecentIso(45);
  const limit = getDashboardCollectionLimit(600);
  const [
    users,
    plants,
    workdaySessions,
    verificationQueue,
    siteVisits,
    leads,
    approvals,
    informalQuotationRequests,
    salesOrderRequests,
    helpRequests,
    tasks,
    targets,
    auditLogs,
    fleetVehicles,
    materialCostSnapshots,
    priceBenchmarks,
    customerAccounts,
    customerInvoices,
  ] = await Promise.all([
    readCollection("users"),
    readCollection("plants"),
    readCollection("workdaySessions", { filters: [{ field: "date", op: ">=", value: recentDateKey }], limit }),
    readCollection("odometerReadings", { filters: [{ field: "status", op: "==", value: "MANUAL_REVIEW_REQUIRED" }], limit }),
    readCollection("siteVisits", { filters: [{ field: "visitedAt", op: ">=", value: recentIso }], limit }),
    readCollection("leads", { limit }),
    readCollection("approvalRequests", { limit }),
    readCollection("informalQuotationRequests", { limit }),
    readCollection("salesOrderRequests", { limit }),
    readCollection("helpRequests", { limit }),
    readCollection("tasks", { limit }),
    readCollection("targets", { limit }),
    readCollection("auditLogs", { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 60 }),
    readCollection("fleetVehicles"),
    readCollection("materialCostSnapshots"),
    readCollection("priceBenchmarks"),
    readCollection("customerAccounts", { limit }),
    readCollection("customerInvoices", { limit }),
  ]);

  return createDashboardDatabaseSlice({
    users,
    plants,
    workdaySessions,
    odometerReadings: verificationQueue,
    siteVisits,
    leads,
    approvalRequests: approvals,
    informalQuotationRequests,
    salesOrderRequests,
    helpRequests,
    tasks,
    targets,
    auditLogs,
    fleetVehicles,
    materialCostSnapshots,
    priceBenchmarks,
    customerAccounts,
    customerInvoices,
  });
}

async function getAccountingScopedDashboardDatabase() {
  const recentDateKey = getRecentDateKey(90);
  const limit = getDashboardCollectionLimit(800);
  const [
    users,
    plants,
    workdaySessions,
    reimbursementClaims,
    tasks,
    approvals,
    salesOrderRequests,
    customerAccounts,
    customerLedgerEntries,
    dispatchRecords,
    documentTemplates,
  ] = await Promise.all([
    readCollection("users"),
    readCollection("plants"),
    readCollection("workdaySessions", { filters: [{ field: "date", op: ">=", value: recentDateKey }], limit }),
    readCollection("reimbursementClaims", { limit }),
    readCollection("tasks", { limit }),
    readCollection("approvalRequests", { limit }),
    readCollection("salesOrderRequests", { limit }),
    readCollection("customerAccounts", { limit }),
    readCollection("customerLedgerEntries", { limit }),
    readCollection("dispatchRecords", { limit }),
    readCollection("documentTemplates", { limit }),
  ]);
  const sessionIds = workdaySessions.map((entry) => entry.id);
  const [readings, siteVisits] = await Promise.all([
    readCollectionByFieldValues("odometerReadings", "sessionId", sessionIds),
    readCollectionByFieldValues("siteVisits", "sessionId", sessionIds),
  ]);

  return createDashboardDatabaseSlice({
    users,
    plants,
    workdaySessions,
    odometerReadings: readings,
    siteVisits,
    reimbursementClaims,
    tasks,
    approvalRequests: approvals,
    salesOrderRequests,
    customerAccounts,
    customerLedgerEntries,
    dispatchRecords,
    documentTemplates,
  });
}

async function getBatcherScopedDashboardDatabase(user: User) {
  const plantId = user.homePlantId;
  const [plants, salesOrderRequests, mixDesigns, fleetVehicles, dispatchRecords] = await Promise.all([
    readCollection("plants"),
    plantId ? readCollection("salesOrderRequests", { filters: [{ field: "plantId", op: "==", value: plantId }] }) : Promise.resolve([]),
    plantId ? readCollection("mixDesigns", { filters: [{ field: "plantId", op: "==", value: plantId }] }) : Promise.resolve([]),
    plantId ? readCollection("fleetVehicles", { filters: [{ field: "plantId", op: "==", value: plantId }] }) : Promise.resolve([]),
    plantId ? readCollection("dispatchRecords", { filters: [{ field: "plantId", op: "==", value: plantId }] }) : Promise.resolve([]),
  ]);

  return createDashboardDatabaseSlice({
    users: [user],
    plants,
    salesOrderRequests,
    mixDesigns,
    fleetVehicles,
    dispatchRecords,
  });
}

export async function getAgentDashboardData(user: User, options: AgentDashboardReadOptions = {}): Promise<AgentDashboardData> {
  assertRole(user, ["SALES_AGENT"]);
  const database = await getAgentScopedDashboardDatabase(user, options);
  const activeSession = getOpenSession(database, user.id) ?? null;
  const sessionIds = database.workdaySessions.filter((entry) => entry.userId === user.id).map((entry) => entry.id);
  const leads = sortLeads(database.leads.filter((entry) => entry.agentId === user.id));
  const leadIds = leads.map((entry) => entry.id);
  const readings = database.odometerReadings
    .filter((entry) => sessionIds.includes(entry.sessionId))
    .sort((left, right) => compareIsoAsc(right.capturedAt, left.capturedAt));
  const siteVisits = database.siteVisits
    .filter((entry) => sessionIds.includes(entry.sessionId))
    .sort((left, right) => compareIsoAsc(right.visitedAt, left.visitedAt));
  const approvals = database.approvalRequests
    .filter((entry) => entry.createdBy === user.id)
    .sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt));
  const informalQuotationRequests = database.informalQuotationRequests
    .filter((entry) => entry.createdBy === user.id)
    .sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt));
  const reimbursementSummaries = computeReimbursementSummaries(database, user.id);
  const monthKey = toMonthKey(nowIso());
  const approvedQuantity = approvals.filter((entry) => entry.status === "APPROVED").reduce((sum, entry) => sum + entry.quantity, 0);
  const pipelineQuantity = approvals.filter((entry) => entry.status === "PENDING").reduce((sum, entry) => sum + entry.quantity, 0);

  return {
    user,
    activeSession,
    readings,
    siteVisits,
    leads,
    leadSites: sortLeadSites(database.leadSites.filter((entry) => leadIds.includes(entry.leadId))),
    tasks: database.tasks.filter((entry) => entry.assignedTo === user.id).sort((left, right) => left.deadline.localeCompare(right.deadline)),
    approvals,
    informalQuotationRequests,
    salesOrderRequests: database.salesOrderRequests
      .filter((entry) => entry.createdBy === user.id)
      .sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    reimbursementClaims: database.reimbursementClaims
      .filter((entry) => entry.agentId === user.id)
      .sort((left, right) => compareIsoAsc(right.requestedAt, left.requestedAt)),
    reimbursementAdjustments: (database.reimbursementAdjustments ?? [])
      .filter((entry) => entry.agentId === user.id)
      .sort((left, right) => compareIsoAsc(right.requestedAt, left.requestedAt)),
    targets: database.targets.filter((entry) => entry.userId === user.id && entry.month === monthKey),
    helpRequests: database.helpRequests.filter((entry) => entry.agentId === user.id),
    reimbursementSummaries,
    siteMapMarkers: buildSiteMapMarkers(database, user),
    pipelineQuantity,
    approvedQuantity,
  };
}

export async function getManagerDashboardData(user: User): Promise<ManagerDashboardData> {
  assertRole(user, ["MANAGER", "PRODUCTION_MANAGER"]);
  const database = await getManagerScopedDashboardDatabase();
  const verificationQueue = database.odometerReadings
    .filter((entry) => entry.status === "MANUAL_REVIEW_REQUIRED")
    .sort((left, right) => compareIsoAsc(right.capturedAt, left.capturedAt));

  return {
    user,
    plants: database.plants,
    odometerReadings: database.odometerReadings,
    verificationQueue,
    siteVisits: database.siteVisits,
    leadSites: sortLeadSites(database.leadSites),
    siteMapMarkers: buildSiteMapMarkers(database, user),
    workdaySessions: database.workdaySessions,
    leads: sortLeads(database.leads),
    approvals: database.approvalRequests.sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    informalQuotationRequests: database.informalQuotationRequests.sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    salesOrderRequests: database.salesOrderRequests.sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    reimbursementClaims: database.reimbursementClaims.sort((left, right) => compareIsoAsc(right.requestedAt, left.requestedAt)),
    reimbursementAdjustments: [...(database.reimbursementAdjustments ?? [])].sort((left, right) => compareIsoAsc(right.requestedAt, left.requestedAt)),
    helpRequests: database.helpRequests,
    tasks: database.tasks,
    targets: database.targets,
    auditLogs: database.auditLogs.slice(0, 60),
    agents: database.users.filter((entry) => entry.role === "SALES_AGENT"),
    fleetVehicles: database.fleetVehicles,
    materialCostSnapshots: database.materialCostSnapshots,
    priceBenchmarks: database.priceBenchmarks,
    customerAccounts: database.customerAccounts,
    customerInvoices: database.customerInvoices,
    documentTemplates: database.documentTemplates,
  };
}

export async function getAccountingDashboardData(user: User): Promise<AccountingDashboardData> {
  assertRole(user, ["ACCOUNTING"]);
  const database = await getAccountingScopedDashboardDatabase();

  return {
    user,
    plants: database.plants,
    reimbursements: computeReimbursementSummaries(database),
    reimbursementClaims: [...database.reimbursementClaims].sort((left, right) => compareIsoAsc(right.requestedAt, left.requestedAt)),
    reimbursementAdjustments: [...(database.reimbursementAdjustments ?? [])].sort((left, right) => compareIsoAsc(right.requestedAt, left.requestedAt)),
    tasks: database.tasks,
    approvals: database.approvalRequests,
    salesOrderRequests: [...database.salesOrderRequests].sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    agents: database.users.filter((entry) => entry.role === "SALES_AGENT"),
    customerAccounts: database.customerAccounts ?? [],
    customerLedgerEntries: buildEffectiveCustomerLedgerEntries({
      customerLedgerEntries: database.customerLedgerEntries ?? [],
      salesOrderRequests: database.salesOrderRequests ?? [],
      dispatchRecords: database.dispatchRecords ?? [],
    }),
    documentTemplates: [...(database.documentTemplates ?? [])].sort((left, right) => compareIsoAsc(right.uploadedAt, left.uploadedAt)),
  };
}

export async function getActiveDocumentTemplate(type: DocumentTemplateType) {
  const templates = await readCollection("documentTemplates", { filters: [{ field: "type", op: "==", value: type }], limit: 20 });
  return (
    templates
      .filter((template) => template.status === "ACTIVE")
      .sort((left, right) => compareIsoAsc(right.uploadedAt, left.uploadedAt))[0] ?? null
  );
}

export async function getBatcherDashboardData(user: User): Promise<BatcherDashboardData> {
  assertRole(user, ["BATCHER", "MANAGER"]);
  const database = await getBatcherScopedDashboardDatabase(user);
  const plantId = user.homePlantId;
  const plant = database.plants.find((p) => p.id === plantId) ?? null;
  const activeOrders = database.salesOrderRequests.filter(
    (order) => order.plantId === plantId && order.status === "SCHEDULE_APPROVED" && order.remainingQuantity > 0,
  );
  const linkedMixDesignIds = new Set(activeOrders.map((order) => order.mixDesignId).filter((id): id is string => Boolean(id)));

  return {
    user,
    plant,
    activeOrders,
    mixDesigns: database.mixDesigns?.filter((design) => design.plantId === plantId && (design.isActive || linkedMixDesignIds.has(design.id))) ?? [],
    fleetVehicles: database.fleetVehicles.filter((v) => v.plantId === plantId),
    dispatchRecords: database.dispatchRecords?.filter((d) => d.plantId === plantId) ?? [],
  };
}

export async function exportReimbursements(format: "csv" | "xlsx") {
  const database = await readDatabase();
  const summaries = computeReimbursementSummaries(database);
  const rows = summaries.map((entry) => ({
    Agent: entry.agentName,
    Date: entry.date,
    OfficeInTime: entry.officeInTime,
    SiteVisitStartTime: entry.siteVisitStartTime ?? "",
    StartReading: entry.startReading ?? "",
    EndReading: entry.endReading ?? "",
    SiteVisitEndTime: entry.siteVisitEndTime ?? "",
    OfficeOutTime: entry.officeOutTime ?? "",
    TotalDistance: entry.totalDistance ?? "",
    TotalSiteVisits: entry.totalSiteVisits,
    FuelAmount: entry.fuelAmount ?? "",
    LunchAmount: entry.lunchAmount,
    TotalAmount: entry.totalAmount ?? "",
    ClaimId: entry.claimId ?? "",
    Status: entry.status,
  }));

  if (format === "csv") {
    const header = Object.keys(rows[0] ?? {
      Agent: "",
      Date: "",
      OfficeInTime: "",
      SiteVisitStartTime: "",
      StartReading: "",
      EndReading: "",
      SiteVisitEndTime: "",
      OfficeOutTime: "",
      TotalDistance: "",
      TotalSiteVisits: "",
      FuelAmount: "",
      LunchAmount: "",
      TotalAmount: "",
      ClaimId: "",
      Status: "",
    });

    const csv = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => {
            const value = `${row[key as keyof typeof row] ?? ""}`.replaceAll('"', '""');
            return `"${value}"`;
          })
          .join(","),
      ),
    ].join("\n");

    return {
      content: Buffer.from(csv, "utf-8"),
      contentType: "text/csv",
      fileName: "reimbursements.csv",
    };
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reimbursements");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return {
    content: buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: "reimbursements.xlsx",
  };
}

export async function listUsersByRole(role: User["role"]) {
  const users = await readCollection("users", { filters: [{ field: "role", op: "==", value: role }] });
  return users.filter((entry) => entry.status === "ACTIVE");
}
