import type { CastingType, DispatchDocumentMode, PumpDispatchStatus, SalesOrderRequest } from "@/lib/types";

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidGstin(value: string) {
  return GSTIN_PATTERN.test(normalizeGstin(value));
}

export function extractPanFromGstin(value: string) {
  const gstin = normalizeGstin(value);
  return isValidGstin(gstin) ? gstin.slice(2, 12) : null;
}

export function normalizeCastingType(value: string | null | undefined): CastingType {
  return `${value ?? ""}`.trim().toLowerCase() === "pump" ? "PUMP" : "DUMP";
}

export function getActualCastingType(pumpDispatchStatus: PumpDispatchStatus): CastingType {
  return pumpDispatchStatus === "DISPATCHED" ? "PUMP" : "DUMP";
}

export function getDocumentModeLabel(value: DispatchDocumentMode) {
  switch (value) {
    case "CHALLAN_AND_GST_E_INVOICE":
      return "Challan + GST invoice/e-invoice";
    case "CHALLAN_AND_INVOICE":
      return "Challan + invoice";
    default:
      return "Challan only";
  }
}

export function canUseInvoiceDocumentMode(order: SalesOrderRequest) {
  return Boolean(order.gstin && order.gstVerificationStatus === "VERIFIED");
}

export function normalizeDispatchDocumentMode(value: string, order: SalesOrderRequest): DispatchDocumentMode {
  const requested =
    value === "CHALLAN_AND_GST_E_INVOICE" || value === "CHALLAN_AND_INVOICE"
      ? value
      : "CHALLAN_ONLY";

  if (!canUseInvoiceDocumentMode(order)) {
    return "CHALLAN_ONLY";
  }

  return requested;
}

export function getNextChallanNumber(existingNumbers: Array<string | null | undefined>, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const financialYear = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
  const prefix = `CH/${financialYear}/`;
  const nextSequence =
    existingNumbers
      .filter((number): number is string => Boolean(number?.startsWith(prefix)))
      .map((number) => Number(number.slice(prefix.length)))
      .filter((sequence) => Number.isInteger(sequence) && sequence > 0)
      .reduce((max, sequence) => Math.max(max, sequence), 0) + 1;

  return `${prefix}${String(nextSequence).padStart(5, "0")}`;
}

export function getNextInvoiceNumber(existingNumbers: Array<string | null | undefined>, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const financialYear = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
  const prefix = `INV/${financialYear}/`;
  const nextSequence =
    existingNumbers
      .filter((number): number is string => Boolean(number?.startsWith(prefix)))
      .map((number) => Number(number.slice(prefix.length)))
      .filter((sequence) => Number.isInteger(sequence) && sequence > 0)
      .reduce((max, sequence) => Math.max(max, sequence), 0) + 1;

  return `${prefix}${String(nextSequence).padStart(5, "0")}`;
}
