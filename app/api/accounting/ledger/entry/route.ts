import { randomUUID } from "node:crypto";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import {
  createCustomerAccountFromSalesOrder,
  customerLedgerKey,
  findCustomerAccountByName,
  getCustomerLedgerBalance,
  isLedgerReadySalesOrder,
} from "@/lib/customer-ledger";
import { nowIso } from "@/lib/date";
import { updateDatabase } from "@/lib/db";
import type { LedgerPaymentMode } from "@/lib/types";

const VALID_PAYMENT_MODES: LedgerPaymentMode[] = ["CASH", "CHEQUE", "NEFT", "UPI"];

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const body = (await request.json()) as {
      customerName?: string;
      amount?: number;
      paymentMode?: string;
      description?: string;
    };

    const customerName = body.customerName?.trim();
    if (!customerName) {
      throw new Error("Customer name is required.");
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Amount must be a positive number.");
    }

    const paymentMode = (body.paymentMode ?? "CASH") as LedgerPaymentMode;
    if (!VALID_PAYMENT_MODES.includes(paymentMode)) {
      throw new Error(`Invalid payment mode. Must be one of: ${VALID_PAYMENT_MODES.join(", ")}`);
    }

    const description = body.description?.trim() || `Payment received via ${paymentMode}`;
    const now = nowIso();

    await updateDatabase((draft) => {
      // Compute running balance from existing entries for this customer
      const existingEntries = (draft.customerLedgerEntries ?? []).filter(
        (entry) => entry.customerName === customerName,
      );
      const currentBalance = existingEntries.reduce((sum, entry) => {
        return entry.type === "DEBIT" ? sum + entry.amount : sum - entry.amount;
      }, 0);
      const newBalance = currentBalance - amount;

      draft.customerLedgerEntries ??= [];
      draft.customerLedgerEntries.push({
        id: randomUUID(),
        customerName,
        type: "CREDIT",
        amount,
        runningBalance: newBalance,
        description,
        referenceId: null,
        paymentMode,
        createdBy: user.id,
        createdAt: now,
      });

      draft.customerAccounts ??= [];
      let account = findCustomerAccountByName(draft.customerAccounts, customerName);
      if (!account) {
        const matchingOrder = (draft.salesOrderRequests ?? []).find(
          (order) => isLedgerReadySalesOrder(order) && customerLedgerKey(order.customerName) === customerLedgerKey(customerName),
        );
        if (matchingOrder) {
          account = createCustomerAccountFromSalesOrder(randomUUID(), matchingOrder);
          draft.customerAccounts.push(account);
        }
      }

      if (account) {
        account.outstandingAmount = Math.max(0, getCustomerLedgerBalance(draft.customerLedgerEntries, customerName));
        account.lastPaymentAt = now;
      }

      draft.auditLogs.unshift({
        id: randomUUID(),
        actorId: user.id,
        actorRole: user.role,
        entityType: "CUSTOMER_LEDGER",
        entityId: customerName,
        action: "CREDIT_POSTED",
        detail: `Payment of ₹${amount.toLocaleString("en-IN")} (${paymentMode}) recorded for ${customerName}.`,
        createdAt: now,
      });
    });

    return jsonOk({ message: "Credit entry recorded successfully." });
  } catch (error) {
    return jsonError(error);
  }
}
