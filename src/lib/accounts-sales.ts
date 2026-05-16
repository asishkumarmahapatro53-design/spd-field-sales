import { createHash } from "node:crypto";
import type {
  FinanceVerificationChecklist,
  ManualPaymentVerification,
  ReimbursementClaim,
  ReimbursementClaimStatus,
  SalesOrderFinalChecklist,
  SalesOrderRequest,
} from "@/lib/types";

export const REIMBURSEMENT_OPEN_STATUSES: ReimbursementClaimStatus[] = [
  "CLAIM_REQUESTED",
  "MANAGER_VERIFIED",
  "ACCOUNTS_PAYMENT_PENDING",
  "CASH_VOUCHER_CREATED",
  "OTP_SENT",
  "AGENT_RECEIPT_CONFIRMED",
  "PARTIAL_PAYMENT",
  "BALANCE_OUTSTANDING",
  "PAYMENT_HOLD",
  "REQUESTED",
];

export function normalizeReimbursementStatus(status: ReimbursementClaimStatus): ReimbursementClaimStatus {
  if (status === "REQUESTED") {
    return "CLAIM_REQUESTED";
  }

  if (status === "REJECTED") {
    return "PAYMENT_REJECTED";
  }

  return status;
}

export function isOpenReimbursementClaim(claim: Pick<ReimbursementClaim, "status" | "outstandingAmount" | "balanceAmount">) {
  const status = normalizeReimbursementStatus(claim.status);
  if (status === "PAID" || status === "PAYMENT_REJECTED") {
    return false;
  }

  return REIMBURSEMENT_OPEN_STATUSES.includes(status) || (claim.outstandingAmount ?? claim.balanceAmount ?? 0) > 0;
}

export function getReimbursementOutstanding(claim: Pick<ReimbursementClaim, "totalAmount" | "paidAmount" | "outstandingAmount" | "balanceAmount">) {
  if (typeof claim.outstandingAmount === "number") {
    return Math.max(0, claim.outstandingAmount);
  }

  if (typeof claim.balanceAmount === "number") {
    return Math.max(0, claim.balanceAmount);
  }

  return Math.max(0, claim.totalAmount - (claim.paidAmount ?? 0));
}

export function getReimbursementStatusLabel(status: ReimbursementClaimStatus) {
  switch (normalizeReimbursementStatus(status)) {
    case "CLAIM_REQUESTED":
      return "Claim requested";
    case "MANAGER_VERIFIED":
    case "ACCOUNTS_PAYMENT_PENDING":
      return "Accounts payment pending";
    case "CASH_VOUCHER_CREATED":
      return "Cash voucher created";
    case "OTP_SENT":
      return "OTP sent";
    case "AGENT_RECEIPT_CONFIRMED":
      return "Agent receipt confirmed";
    case "PAID":
      return "Paid";
    case "PARTIAL_PAYMENT":
    case "BALANCE_OUTSTANDING":
      return "Partial payment";
    case "PAYMENT_HOLD":
      return "Payment hold";
    case "PAYMENT_REJECTED":
      return "Payment rejected";
    default:
      return status.replaceAll("_", " ").toLowerCase();
  }
}

export function isFinanceChecklistComplete(checklist: FinanceVerificationChecklist | null | undefined) {
  if (!checklist) {
    return false;
  }

  return Boolean(
    checklist.gstChecked &&
      checklist.gstCertificateChecked &&
      checklist.legalNameChecked &&
      checklist.billingAddressChecked &&
      checklist.poChecked &&
      checklist.pdcChecked &&
      checklist.paymentProofChecked &&
      checklist.amountReceivedChecked &&
      checklist.outstandingChecked &&
      checklist.overdueChecked &&
      checklist.creditLimitChecked &&
      checklist.accountantRemarks.trim() &&
      checklist.verifiedBy &&
      checklist.verifiedAt,
  );
}

export function isManualPaymentVerificationComplete(verification: ManualPaymentVerification | null | undefined) {
  if (!verification) {
    return false;
  }

  if (!Number.isFinite(verification.amountReceived) || verification.amountReceived < 0) {
    return false;
  }

  if (!verification.bankCashAccount.trim() || !verification.verifiedBy || !verification.verifiedAt) {
    return false;
  }

  if (verification.paymentMode === "NEFT" || verification.paymentMode === "UPI" || verification.paymentMode === "BANK_TRANSFER") {
    return Boolean(verification.utrNumber?.trim());
  }

  if (verification.paymentMode === "CHEQUE") {
    return Boolean(verification.chequeNumber?.trim());
  }

  if (verification.paymentMode === "CASH") {
    return Boolean(verification.cashVoucherNumber?.trim());
  }

  return true;
}

export function isSalesOrderFinalChecklistComplete(checklist: SalesOrderFinalChecklist | null | undefined) {
  if (!checklist) {
    return false;
  }

  return Boolean(
    checklist.gradeConfirmed &&
      checklist.quantityConfirmed &&
      checklist.rateConfirmed &&
      checklist.paymentTermsConfirmed &&
      checklist.requiredDateTimeConfirmed &&
      checklist.castingTypeConfirmed &&
      checklist.pumpDumpRequirementConfirmed &&
      checklist.receiverConfirmed &&
      checklist.phoneConfirmed &&
      checklist.deliveryAddressConfirmed &&
      checklist.plantConfirmed &&
      checklist.taxChallanModeConfirmed &&
      checklist.accountantRemarks.trim() &&
      checklist.verifiedBy &&
      checklist.verifiedAt,
  );
}

export function calculateAvailableCredit(input: {
  creditLimit: number;
  currentOutstanding: number;
  activeOrderExposure: number;
}) {
  return input.creditLimit - input.currentOutstanding - input.activeOrderExposure;
}

export function buildSalesOrderPreviewHash(request: SalesOrderRequest) {
  const snapshot = {
    id: request.id,
    customerName: request.customerName,
    siteName: request.siteName,
    grade: request.grade,
    quantity: request.quantity,
    approvedPrice: request.approvedPrice,
    amount: request.amount,
    paymentType: request.paymentType,
    paymentTerms: request.paymentTerms,
    requiredDate: request.requiredDate,
    receiverName: request.receiverName,
    receiverPhone: request.receiverPhone,
    siteAddress: request.siteAddress,
    plantId: request.plantId,
    gstin: request.gstin,
    plannedCastingType: request.plannedCastingType,
    pumpRequired: request.pumpRequired,
  };

  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
