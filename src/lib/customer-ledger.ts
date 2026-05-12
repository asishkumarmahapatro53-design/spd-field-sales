import type { CustomerAccount, CustomerLedgerEntry, SalesOrderRequest, SalesOrderRequestStatus } from "@/lib/types";

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
    whatsappNumber: request.receiverPhone.trim(),
    creditLimit: request.paymentType === "CREDIT" ? Math.max(0, request.amount) : 0,
    creditPeriodDays: request.paymentType === "CREDIT" ? 30 : 0,
    outstandingAmount: 0,
    riskLevel: "LOW",
    lastPaymentAt: null,
  };
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
