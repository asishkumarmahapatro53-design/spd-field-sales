import { randomInt, randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import {
  computeSalesOrderAmount,
  getApprovalItemById,
  getApprovalItems,
  normalizePaymentTerms,
  requiresPaymentReceipt,
  requiresPdcUpload,
  requiresPoUpload,
} from "@/lib/commercial";
import { compareIsoAsc, nowIso, toDateKey, toMonthKey } from "@/lib/date";
import { readDatabase, updateDatabase } from "@/lib/db";
import { sendGmail } from "@/lib/gmail-smtp";
import { generateInformalQuotationPdf } from "@/lib/informal-quotation-pdf";
import { extractPanFromGstin, isValidGstin, normalizeCastingType, normalizeGstin } from "@/lib/legal-workflow";
import { ocrService } from "@/lib/ocr";
import { getLocationVerification, getStakeholderLabel, normalizeStakeholderRole, suggestLeadScore, suggestLeadStage, suggestNextFollowUp } from "@/lib/site-visit";
import { saveGeneratedBuffer } from "@/lib/storage";
import type {
  AccountingDashboardData,
  AgentDashboardData,
  ApprovalRequest,
  ApprovalRequestItem,
  AuditLogEntry,
  BatcherDashboardData,
  Database,
  ExpectedSupplyWindow,
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
  MixDesignType,
  OdometerReading,
  PaymentTerms,
  PaymentType,
  ReadingType,
  ReimbursementSummary,
  SalesOrderRequest,
  SiteVisit,
  SiteLocationVerificationStatus,
  StakeholderContact,
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
  return database.reimbursementClaims
    .filter((claim) => claim.agentId === agentId && claim.status === "PAID")
    .reduce<string | null>((latestDate, claim) => {
      if (!latestDate || claim.periodEnd > latestDate) {
        return claim.periodEnd;
      }

      return latestDate;
    }, null);
}

function getClaimIdForSession(database: Database, sessionId: string) {
  return (
    database.reimbursementClaims.find(
      (claim) => claim.status !== "REJECTED" && claim.lineItems.some((lineItem) => lineItem.sessionId === sessionId),
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
        .filter((entry) => entry.sessionId === session.id)
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
    const openClaim = database.reimbursementClaims.find(
      (claim) => claim.agentId === user.id && (claim.status === "REQUESTED" || claim.status === "OTP_SENT"),
    );

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
      status: "REQUESTED" as const,
      periodStart: lineItems[0]?.date ?? summaries[0]?.date ?? toDateKey(nowIso()),
      periodEnd: lineItems.at(-1)?.date ?? summaries.at(-1)?.date ?? toDateKey(nowIso()),
      lineItems,
      totalDistanceKm,
      fuelAmount,
      lunchAmount,
      totalAmount,
      requestedAt: nowIso(),
      otpCode: null,
      otpSentAt: null,
      otpExpiresAt: null,
      otpVerifiedAt: null,
      paidAt: null,
      paidBy: null,
      rejectedAt: null,
      rejectedBy: null,
      note: null,
    };

    database.reimbursementClaims.unshift(claim);
    logAudit(database, user, "ReimbursementClaim", claim.id, "CLAIM_REQUEST", `Requested reimbursement for ${lineItems.length} day(s).`);
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

    if (claim.status !== "REQUESTED" && claim.status !== "OTP_SENT") {
      throw new Error("OTP can only be sent for pending reimbursement claims.");
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
    claim.status = "PAID";
    claim.otpVerifiedAt = now;
    claim.paidAt = now;
    claim.paidBy = user.id;
    claim.note = "Payment verified by OTP.";
    logAudit(database, user, "ReimbursementClaim", claim.id, "OTP_VERIFIED", `Paid reimbursement claim for ${claim.totalAmount}.`);
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
    if (claim.agentId !== agentId || claim.status === "REJECTED") {
      return false;
    }

    return (
      claim.lineItems.some((lineItem) => lineItem.date === dateKey) ||
      (dateKey >= claim.periodStart && dateKey <= claim.periodEnd)
    );
  });
}

function assertReadingDateIsClaimable(database: Database, agentId: string, dateKey: string) {
  const lastPaidThroughDate = getLastPaidThroughDate(database, agentId);

  if (lastPaidThroughDate && dateKey <= lastPaidThroughDate) {
    throw new Error(`This photo is dated ${dateKey}, which is already covered by the paid claim through ${lastPaidThroughDate}.`);
  }

  const blockingClaim = getClaimBlockingReadingDate(database, agentId, dateKey);

  if (blockingClaim) {
    throw new Error(`This photo is dated ${dateKey}, which is already inside claim ${blockingClaim.id.slice(0, 8)}.`);
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
    const hasRecognizedMeterReading = ocr.value !== null && ACCEPTED_OCR_READING_KINDS.has(ocr.kind);
    const hasReliableReading = hasRecognizedMeterReading && ocr.confidence >= OCR_ACCEPTANCE_CONFIDENCE;
    const confidencePercent = Math.round(ocr.confidence * 100);
    const meterLabel = ocr.kind === "UNKNOWN" ? "meter" : ocr.kind;
    const verificationNote = hasReliableReading
      ? hasExtractedTimestamp
        ? `${ocr.note} Detected ${meterLabel} reading. Dashboard timestamp mapped to ${readingDateKey}.`
        : `${ocr.note} Detected ${meterLabel} reading. No dashboard timestamp was extracted; used active workday date.`
      : `${hasRecognizedMeterReading ? `AI found a ${meterLabel} value, but confidence is low (${confidencePercent}%).` : "AI could not find a readable ODO, TOTAL, TRIP, or rolling odometer value."} Sent to manager verification and kept visible in the agent reading history for agent/driver cross-check. ${ocr.note} ${
          hasExtractedTimestamp
            ? `Dashboard timestamp mapped to ${readingDateKey}.`
            : "No dashboard timestamp was extracted; manager should verify date and reading from the photo."
        }`;

    const reading: OdometerReading = {
      id: randomUUID(),
      sessionId: session.id,
      type: input.type,
      photoUrl: upload.photoUrl,
      originalFileName: upload.originalFileName,
      capturedAt,
      capturedLatLng: input.latLng,
      ocrValue: ocr.value,
      finalValue: hasReliableReading ? ocr.value : null,
      ocrConfidence: ocr.confidence,
      status: hasReliableReading ? "AWAITING_CONFIRMATION" : "MANUAL_REVIEW_REQUIRED",
      verifiedBy: null,
      verificationNote,
    };

    database.odometerReadings.unshift(reading);
    logAudit(
      database,
      user,
      "OdometerReading",
      reading.id,
      "CREATE",
      `Uploaded ${input.type.toLowerCase()} odometer reading with OCR confidence ${ocr.confidence}.`,
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

    reading.status = "CONFIRMED";
    reading.finalValue = reading.ocrValue;
    logAudit(database, user, "OdometerReading", reading.id, "CONFIRM", "Agent confirmed OCR result.");
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

    reading.status = "MANUAL_REVIEW_REQUIRED";
    reading.finalValue = null;
    reading.verificationNote = note || "Agent rejected OCR result.";
    logAudit(database, user, "OdometerReading", reading.id, "REJECT", reading.verificationNote);
    return reading;
  });
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
          const phone = `${entry.phone ?? ""}`.trim();
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
      const [name = "", phone = ""] = line.split(",").map((part) => part.trim());
      const legacyRoles: Array<StakeholderContact["role"]> = ["CONTRACTOR", "OWNER_BUILDER", "SITE_SUPERVISOR"];
      const role = legacyRoles[index] ?? "OTHERS";

      return {
        label: getStakeholderLabel(role),
        name,
        phone,
        role,
      };
    });
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
  const stakeholders = dedupeStakeholders(normalizeStakeholders(input.stakeholders));
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
  const resolvedLeadStage =
    input.leadStage ??
    suggestLeadStage({
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
  const resolvedScore =
    input.score ??
    suggestLeadScore({
      expectedSupplyWindow: input.expectedSupplyWindow,
      stakeholders,
      currentSupplier: resolvedCurrentSupplier,
    });

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
        currentConcreteGrade: input.concreteGrade,
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
        currentConcreteGrade: input.concreteGrade,
        currentQuantityCum: input.quantityCum,
        score: resolvedScore,
        createdAt: visitedAt,
        updatedAt: visitedAt,
        lastVisitedAt: visitedAt,
      };
      database.leadSites.push(site);
    } else {
      site.siteName = input.siteName.trim() || site.siteName;
      site.siteAddress = resolvedSiteAddress || site.siteAddress;
      site.latLng = detectedLatLng ?? input.latLng ?? site.latLng ?? null;
      site.stakeholders = dedupeStakeholders([...site.stakeholders, ...stakeholders]);
      site.expectedSupplyWindow = input.expectedSupplyWindow;
      site.futureScope = input.futureScope;
      site.currentConcreteGrade = input.concreteGrade;
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
      concreteGrade: input.concreteGrade,
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
    };

    lead.priceExpectation = input.priceExpectation?.trim() || lead.priceExpectation;
    syncLeadSummaryFromSite(lead, site, visit);
    lead.siteCount = database.leadSites.filter((entry) => entry.leadId === lead.id).length;

    database.siteVisits.unshift(visit);
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

    if (typeof input.stageOfWork === "string") {
      const value = input.stageOfWork.trim();
      if (!value) {
        throw new Error("Stage of work cannot be empty.");
      }
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
      const value = input.concreteGrade.trim().toUpperCase();
      if (!value) {
        throw new Error("Concrete grade cannot be empty.");
      }
      visit.concreteGrade = value;
    }

    if (typeof input.quantityCum === "number") {
      if (!Number.isFinite(input.quantityCum) || input.quantityCum <= 0) {
        throw new Error("Quantity must be greater than zero.");
      }
      visit.quantityCum = input.quantityCum;
    }

    if (input.leadStage) {
      visit.leadStage = input.leadStage;
    }

    if (typeof input.nextFollowUpAt === "string") {
      const date = new Date(input.nextFollowUpAt);
      if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid follow-up date.");
      }
      visit.nextFollowUpAt = date.toISOString();
    }

    if (input.expectedSupplyWindow !== undefined) {
      visit.expectedSupplyWindow = input.expectedSupplyWindow;
    }

    if (typeof input.remarksText === "string") {
      visit.remarksText = input.remarksText.trim();
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
  const database = await readDatabase();
  const leads = user.role === "SALES_AGENT" ? database.leads.filter((entry) => entry.agentId === user.id) : database.leads;
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

    Object.assign(lead, input);
    logAudit(database, user, "Lead", lead.id, "UPDATE", "Lead summary updated.");
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

function getInformalQuotationPdfFileName(request: InformalQuotationRequest) {
  const ref = request.quotationRef ?? request.id;
  return `quotation-${ref.replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
}

function safeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : "Delivery failed.";
  return message.slice(0, 700);
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

    if (status !== "APPROVED" && status !== "REJECTED") {
      throw new Error("Choose whether to approve or reject this informal quotation.");
    }

    request.status = status;
    request.decisionNote = decisionNote.trim() || (status === "APPROVED" ? "Approved by manager." : "Rejected by manager.");
    request.decidedBy = user.id;
    request.decidedAt = nowIso();
    if (status === "APPROVED" && !request.quotationRef) {
      request.quotationRef = getNextInformalQuotationRef(database, request.decidedAt);
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
  let pdfBuffer: Buffer;

  try {
    pdfBuffer = generateInformalQuotationPdf({ quotation: request, plant, manager: managerUser, salesAgent });
    const fileName = getInformalQuotationPdfFileName(request);
    const storedPdf = await saveGeneratedBuffer({
      buffer: pdfBuffer,
      fileName,
      mimeType: "application/pdf",
      directory: "quotations",
    });

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
      nextRequest.whatsappStatus = "PENDING_CONFIGURATION";
      nextRequest.whatsappError = "WhatsApp sending is pending Evolution API configuration.";
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

    return updateDatabase((nextDatabase) => {
      const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === request.id);
      if (!nextRequest) {
        throw new Error("Informal quotation request not found while saving email status.");
      }
      nextRequest.emailStatus = "SENT";
      nextRequest.emailSentAt = nowIso();
      nextRequest.emailError = null;
      nextRequest.emailTo = request.stakeholderEmail;
      nextRequest.emailCc = ccEmails;
      nextRequest.whatsappStatus = "PENDING_CONFIGURATION";
      nextRequest.whatsappError = "WhatsApp sending is pending Evolution API configuration.";
      logAudit(nextDatabase, manager, "InformalQuotationRequest", nextRequest.id, "EMAIL_SENT", `Sent quotation email to ${request.stakeholderEmail}.`);
      return nextRequest;
    });
  } catch (error) {
    const errorMessage = safeDeliveryError(error);
    return updateDatabase((nextDatabase) => {
      const nextRequest = nextDatabase.informalQuotationRequests.find((entry) => entry.id === request.id);
      if (!nextRequest) {
        throw new Error("Informal quotation request not found while saving email failure.");
      }
      nextRequest.emailStatus = "FAILED";
      nextRequest.emailSentAt = null;
      nextRequest.emailError = errorMessage;
      nextRequest.emailTo = request.stakeholderEmail;
      nextRequest.emailCc = ccEmails;
      nextRequest.whatsappStatus = "PENDING_CONFIGURATION";
      nextRequest.whatsappError = "WhatsApp sending is pending Evolution API configuration.";
      logAudit(nextDatabase, manager, "InformalQuotationRequest", nextRequest.id, "EMAIL_FAILED", errorMessage);
      return nextRequest;
    });
  }
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
      createdAt: nowIso(),
    };

    database.approvalRequests.unshift(approval);
    logAudit(database, user, "ApprovalRequest", approval.id, "CREATE", `Created final price approval request for ${createApprovalAuditSummary(approval)}.`);
    return approval;
  });
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

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Enter a valid order quantity.");
    }

    if (Number.isNaN(requiredDate.getTime())) {
      throw new Error("Choose a valid required date.");
    }

    const paymentTerms = normalizePaymentTerms(approval.paymentType, approval.paymentTerms);
    if (requiresPaymentReceipt(approval.paymentType, paymentTerms) && !input.paymentReceivedConfirmed) {
      throw new Error("Confirm full payment receipt for advance-payment orders.");
    }

    if (requiresPoUpload(paymentTerms) && !input.poDocumentUrl) {
      throw new Error("Upload the PO document for this payment term.");
    }

    if (requiresPdcUpload(paymentTerms) && !input.pdcDocumentUrl) {
      throw new Error("Upload the PDC document for this payment term.");
    }

    if (gstin && !isValidGstin(gstin)) {
      throw new Error("Enter a valid GSTIN or leave it blank for challan-only dispatch.");
    }

    if (gstin && (!gstLegalName || !gstBillingAddress || !input.agentGstConfirmed)) {
      throw new Error("Confirm GST legal name and billing address before submitting a GST sales order.");
    }

    const amount = computeSalesOrderAmount(quantity, approvalItem.quotedPrice, input.pumpRequired);
    const orderRequest: SalesOrderRequest = {
      id: randomUUID(),
      leadId: lead.id,
      siteId: site.id,
      approvalRequestId: approval.id,
      plantId: lead.plantId ?? getUserPlantId(database, user.id),
      customerName: approval.customerName,
      siteName: site.siteName,
      grade: approvalItem.grade,
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
      receiverPhone: input.receiverPhone.trim(),
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
      createdAt: nowIso(),
    };

    database.salesOrderRequests.unshift(orderRequest);
    logAudit(
      database,
      user,
      "SalesOrderRequest",
      orderRequest.id,
      "CREATE",
      `Created sales order request for ${orderRequest.customerName} (${orderRequest.grade}, ${orderRequest.quantity} CUM, amount ${orderRequest.amount}).`,
    );
    return orderRequest;
  });
}

export async function reviewSalesOrderRequestByAccounting(
  user: User,
  requestId: string,
  status: "FINANCE_VERIFIED" | "FINANCE_REJECTED",
  note: string,
) {
  assertRole(user, ["ACCOUNTING"]);

  return updateDatabase((database) => {
    const request = database.salesOrderRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Sales order request not found.");
    }

    if (request.status !== "PENDING_FINANCE") {
      throw new Error("This sales order request is not waiting for finance review.");
    }

    request.status = status;
    request.financeReviewedBy = user.id;
    request.financeReviewedAt = nowIso();
    request.financeNote = note;
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

    if (request.status !== "FINANCE_VERIFIED" && request.status !== "SCHEDULE_REJECTED") {
      throw new Error("Only finance-verified sales orders can be sent for schedule approval.");
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

    approval.status = status;
    approval.decisionNote = decisionNote;
    approval.decidedAt = nowIso();
    approval.decidedBy = user.id;
    logAudit(database, user, "ApprovalRequest", approval.id, status, decisionNote || "Approval decision updated.");
    return approval;
  });
}

export async function listVerificationQueue() {
  const database = await readDatabase();
  return database.odometerReadings
    .filter((entry) => entry.status === "MANUAL_REVIEW_REQUIRED")
    .sort((left, right) => compareIsoAsc(right.capturedAt, left.capturedAt));
}

export async function resolveVerification(user: User, readingId: string, manualValue: number, note: string) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    reading.finalValue = manualValue;
    reading.status = "MANUAL_VERIFIED";
    reading.verifiedBy = user.id;
    reading.verificationNote = note;
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

export async function getAgentDashboardData(user: User): Promise<AgentDashboardData> {
  assertRole(user, ["SALES_AGENT"]);
  const database = await readDatabase();
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
    targets: database.targets.filter((entry) => entry.userId === user.id && entry.month === monthKey),
    helpRequests: database.helpRequests.filter((entry) => entry.agentId === user.id),
    reimbursementSummaries,
    pipelineQuantity,
    approvedQuantity,
  };
}

export async function getManagerDashboardData(user: User): Promise<ManagerDashboardData> {
  assertRole(user, ["MANAGER", "PRODUCTION_MANAGER"]);
  const database = await readDatabase();

  return {
    user,
    plants: database.plants,
    odometerReadings: database.odometerReadings,
    verificationQueue: await listVerificationQueue(),
    siteVisits: database.siteVisits,
    workdaySessions: database.workdaySessions,
    leads: sortLeads(database.leads),
    approvals: database.approvalRequests.sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    informalQuotationRequests: database.informalQuotationRequests.sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    salesOrderRequests: database.salesOrderRequests.sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
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
  };
}

export async function getAccountingDashboardData(user: User): Promise<AccountingDashboardData> {
  assertRole(user, ["ACCOUNTING"]);
  const database = await readDatabase();

  return {
    user,
    plants: database.plants,
    reimbursements: computeReimbursementSummaries(database),
    reimbursementClaims: [...database.reimbursementClaims].sort((left, right) => compareIsoAsc(right.requestedAt, left.requestedAt)),
    tasks: database.tasks,
    approvals: database.approvalRequests,
    salesOrderRequests: [...database.salesOrderRequests].sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    agents: database.users.filter((entry) => entry.role === "SALES_AGENT"),
  };
}

export async function getBatcherDashboardData(user: User): Promise<BatcherDashboardData> {
  assertRole(user, ["BATCHER", "MANAGER"]);
  const database = await readDatabase();
  const plantId = user.homePlantId;
  const plant = database.plants.find((p) => p.id === plantId) ?? null;

  return {
    user,
    plant,
    activeOrders: database.salesOrderRequests.filter(
      (o) => o.plantId === plantId && o.status === "SCHEDULE_APPROVED" && o.remainingQuantity > 0
    ),
    mixDesigns: database.mixDesigns?.filter((m) => m.plantId === plantId && m.isActive) ?? [],
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
  const database = await readDatabase();
  return database.users.filter((entry) => entry.role === role && entry.status === "ACTIVE");
}
