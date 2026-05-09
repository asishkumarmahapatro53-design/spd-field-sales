import type {
  ApprovalRequest,
  ApprovalRequestItem,
  PaymentTerms,
  PaymentType,
  SalesOrderRequest,
  SalesOrderRequestStatus,
} from "@/lib/types";

export const PAYMENT_TYPE_OPTIONS = ["NORMAL", "CREDIT"] as const;
export const PAYMENT_TERMS_OPTIONS = ["ADVANCE", "PO", "PDC", "PO_AND_PDC"] as const;
export const MIX_DESIGN_OPTIONS = ["DESIGN_MIX", "NOMINAL_MIX"] as const;

export function normalizePaymentTerms(paymentType: PaymentType, paymentTerms: PaymentTerms) {
  return paymentType === "NORMAL" ? "ADVANCE" : paymentTerms;
}

export function requiresPoUpload(paymentTerms: PaymentTerms) {
  return paymentTerms === "PO" || paymentTerms === "PO_AND_PDC";
}

export function requiresPdcUpload(paymentTerms: PaymentTerms) {
  return paymentTerms === "PDC" || paymentTerms === "PO_AND_PDC";
}

export function requiresPaymentReceipt(paymentType: PaymentType, paymentTerms: PaymentTerms) {
  return normalizePaymentTerms(paymentType, paymentTerms) === "ADVANCE";
}

export function computeSalesOrderAmount(quantity: number, approvedPrice: number, pumpRequired: boolean) {
  const baseAmount = quantity * approvedPrice;
  const pumpCharge = pumpRequired && quantity < 30 ? 8000 : 0;
  return Math.round((baseAmount + pumpCharge) * 100) / 100;
}

export function getApprovalItems(approval: ApprovalRequest) {
  if (approval.items?.length) {
    return approval.items;
  }

  if (approval.grade && Number.isFinite(approval.quotedPrice)) {
    return [
      {
        id: `${approval.id}-item-1`,
        grade: approval.grade,
        quotedPrice: approval.quotedPrice,
      },
    ] satisfies ApprovalRequestItem[];
  }

  return [] satisfies ApprovalRequestItem[];
}

export function getPrimaryApprovalItem(approval: ApprovalRequest) {
  return getApprovalItems(approval)[0] ?? null;
}

export function getApprovalItemById(approval: ApprovalRequest, itemId: string | null | undefined) {
  const items = getApprovalItems(approval);
  if (!itemId) {
    return items[0] ?? null;
  }

  return items.find((item) => item.id === itemId) ?? items[0] ?? null;
}

export function getSalesOrderStatusMeta(status: SalesOrderRequestStatus) {
  switch (status) {
    case "PENDING_FINANCE":
      return { label: "Pending ledger", className: "status-pending" };
    case "FINANCE_VERIFIED":
      return { label: "Ledger created", className: "status-approved" };
    case "FINANCE_REJECTED":
      return { label: "Finance rejected", className: "status-danger" };
    case "SCHEDULE_PENDING":
      return { label: "Sales order created", className: "status-manager_view" };
    case "SCHEDULE_APPROVED":
      return { label: "Schedule approved", className: "status-open-good" };
    case "SCHEDULE_REJECTED":
      return { label: "Schedule rejected", className: "status-danger" };
    default:
      return { label: status, className: "status-manager_view" };
  }
}

export function isOrderReadyForSchedule(request: SalesOrderRequest) {
  return request.status === "FINANCE_VERIFIED" || request.status === "SCHEDULE_REJECTED";
}
