import { normalizePaymentTerms, requiresPaymentReceipt } from "@/lib/commercial";
import { compareIsoAsc } from "@/lib/date";
import type { CustomerAccount, CustomerLedgerEntry, DispatchRecord, SalesOrderRequest, SalesOrderRequestStatus } from "@/lib/types";

const LEDGER_READY_STATUSES: SalesOrderRequestStatus[] = [
  "FINANCE_VERIFIED",
  "SCHEDULE_PENDING",
  "SCHEDULE_APPROVED",
  "SCHEDULE_REJECTED",
];

export function customerLedgerKey(customerName: string) {
  return customerName.trim().toLowerCase();
}

export function isLedgerReadySalesOrder(request: Pick<SalesOrderRequest, "status">) {
  return LEDGER_READY_STATUSES.includes(request.status);
}

export function findCustomerAccountByName(accounts: CustomerAccount[], customerName: string) {
  const key = customerLedgerKey(customerName);
  return accounts.find((account) => customerLedgerKey(account.customerName) === key) ?? null;
}

export function createCustomerAccountFromSalesOrder(id: string, request: SalesOrderRequest): CustomerAccount {
  return {
    id,
    plantId: request.plantId,
    customerName: request.customerName.trim(),
    odooPartnerId: request.odooPartnerId ?? null,
    whatsappNumber: request.receiverPhone.trim(),
    creditLimit: request.paymentType === "CREDIT" ? Math.max(0, request.amount) : 0,
    creditPeriodDays: request.paymentType === "CREDIT" ? 30 : 0,
    outstandingAmount: 0,
    activeOrderExposure: request.status === "SCHEDULE_APPROVED" || request.status === "SCHEDULE_PENDING" ? request.amount : 0,
    overdueAmount: 0,
    riskLevel: "LOW",
    lastPaymentAt: null,
    creditApprovalHistory: [],
  };
}

export function getAdvanceReceiptReferenceId(requestId: string) {
  return `advance:${requestId}`;
}

export function shouldCreateAdvanceReceiptCredit(request: SalesOrderRequest) {
  const paymentTerms = normalizePaymentTerms(request.paymentType, request.paymentTerms);
  return (
    isLedgerReadySalesOrder(request) &&
    request.paymentReceivedConfirmed &&
    requiresPaymentReceipt(request.paymentType, paymentTerms) &&
    request.amount > 0
  );
}

export function getCustomerLedgerBalance(entries: CustomerLedgerEntry[], customerName: string) {
  const key = customerLedgerKey(customerName);
  return entries
    .filter((entry) => customerLedgerKey(entry.customerName) === key)
    .reduce((sum, entry) => (entry.type === "DEBIT" ? sum + entry.amount : sum - entry.amount), 0);
}

export function createAdvanceReceiptLedgerEntry(
  id: string,
  request: SalesOrderRequest,
  createdBy: string,
): CustomerLedgerEntry {
  return {
    id,
    customerName: request.customerName,
    type: "CREDIT",
    amount: request.amount,
    runningBalance: 0,
    description: `Advance payment received for ${request.grade} ${request.quantity} CUM order`,
    referenceId: getAdvanceReceiptReferenceId(request.id),
    paymentMode: "ADVANCE_RECEIPT",
    createdBy,
    createdAt: request.financeReviewedAt ?? request.createdAt,
  };
}

export function createDispatchDebitLedgerEntry(
  id: string,
  request: SalesOrderRequest,
  record: DispatchRecord,
  createdBy: string,
): CustomerLedgerEntry {
  return {
    id,
    customerName: request.customerName,
    type: "DEBIT",
    amount: record.finalSuppliedCum * request.approvedPrice,
    runningBalance: 0,
    description: `Challan ${record.challanNumber} - ${record.finalSuppliedCum} CUM @ Rs.${request.approvedPrice}/CUM`,
    referenceId: record.id,
    paymentMode: "AUTO_DISPATCH",
    createdBy,
    createdAt: record.siteAcceptedAt ?? record.dispatchedAt,
  };
}

export function recomputeCustomerLedgerRunningBalances(entries: CustomerLedgerEntry[]) {
  const balances = new Map<string, number>();

  return [...entries]
    .sort((left, right) => compareIsoAsc(left.createdAt, right.createdAt) || left.id.localeCompare(right.id))
    .map((entry) => {
      const key = customerLedgerKey(entry.customerName);
      const currentBalance = balances.get(key) ?? 0;
      const nextBalance = entry.type === "DEBIT" ? currentBalance + entry.amount : currentBalance - entry.amount;
      balances.set(key, nextBalance);
      return { ...entry, runningBalance: nextBalance };
    });
}

export function buildEffectiveCustomerLedgerEntries(input: {
  customerLedgerEntries: CustomerLedgerEntry[];
  salesOrderRequests: SalesOrderRequest[];
  dispatchRecords: DispatchRecord[];
}) {
  const existingReferences = new Set(
    input.customerLedgerEntries.map((entry) => entry.referenceId).filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
  const orderById = new Map(input.salesOrderRequests.map((order) => [order.id, order]));
  const synthesizedEntries: CustomerLedgerEntry[] = [];

  for (const request of input.salesOrderRequests) {
    const referenceId = getAdvanceReceiptReferenceId(request.id);
    if (shouldCreateAdvanceReceiptCredit(request) && !existingReferences.has(referenceId)) {
      synthesizedEntries.push(createAdvanceReceiptLedgerEntry(`derived-${referenceId}`, request, request.financeReviewedBy ?? request.createdBy));
      existingReferences.add(referenceId);
    }
  }

  for (const record of input.dispatchRecords) {
    const order = orderById.get(record.orderId);
    if (!order || record.status !== "SITE_ACCEPTED" || record.finalSuppliedCum <= 0 || existingReferences.has(record.id)) {
      continue;
    }

    synthesizedEntries.push(createDispatchDebitLedgerEntry(`derived-dispatch-${record.id}`, order, record, record.createdBy));
    existingReferences.add(record.id);
  }

  return recomputeCustomerLedgerRunningBalances([...input.customerLedgerEntries, ...synthesizedEntries]).sort((left, right) =>
    compareIsoAsc(right.createdAt, left.createdAt),
  );
}

export function getLedgerCustomerNames(input: {
  customerAccounts: CustomerAccount[];
  customerLedgerEntries: CustomerLedgerEntry[];
  salesOrderRequests?: SalesOrderRequest[];
}) {
  const names = new Map<string, string>();

  function addName(customerName: string) {
    const trimmedName = customerName.trim();
    if (!trimmedName) {
      return;
    }
    const key = customerLedgerKey(trimmedName);
    if (!names.has(key)) {
      names.set(key, trimmedName);
    }
  }

  input.customerAccounts.forEach((account) => addName(account.customerName));
  input.customerLedgerEntries.forEach((entry) => addName(entry.customerName));
  input.salesOrderRequests
    ?.filter(isLedgerReadySalesOrder)
    .forEach((request) => addName(request.customerName));

  return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
}
