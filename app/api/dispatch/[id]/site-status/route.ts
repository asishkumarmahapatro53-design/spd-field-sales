import { randomUUID } from "node:crypto";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createCustomerAccountFromSalesOrder, findCustomerAccountByName, getCustomerLedgerBalance } from "@/lib/customer-ledger";
import { nowIso } from "@/lib/date";
import { updateDatabase } from "@/lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["BATCHER", "MANAGER"]);
    const { id } = await context.params;
    const body = (await request.json()) as { status?: "SITE_ACCEPTED" | "SITE_REJECTED"; note?: string };
    const nextStatus = body.status === "SITE_REJECTED" ? "SITE_REJECTED" : "SITE_ACCEPTED";

    await updateDatabase((draft) => {
      const record = draft.dispatchRecords.find((entry) => entry.id === id);
      if (!record) {
        throw new Error("Dispatch record not found.");
      }
      if (record.plantId !== user.homePlantId) {
        throw new Error("Unauthorized access to this dispatch record.");
      }
      if (record.status !== "DISPATCHED" && record.status !== "RETURNED") {
        throw new Error("Only dispatched or returned challans can be accepted or rejected.");
      }

      const now = nowIso();
      const billableQuantityBeforeDecision = record.finalSuppliedCum;
      record.status = nextStatus;
      record.siteAcceptedAt = nextStatus === "SITE_ACCEPTED" ? now : null;
      record.siteRejectedAt = nextStatus === "SITE_REJECTED" ? now : null;

      const vehicle = draft.fleetVehicles.find((entry) => entry.id === record.vehicleId);
      if (vehicle) {
        vehicle.status = "IDLE";
      }

      if (nextStatus === "SITE_REJECTED") {
        const order = draft.salesOrderRequests.find((entry) => entry.id === record.orderId);
        if (order) {
          order.remainingQuantity += billableQuantityBeforeDecision;
        }
        record.returnedQuantityCum = record.dispatchedQuantityCum;
        record.finalSuppliedCum = 0;
      }

      // Automatic ledger debit on SITE_ACCEPTED
      if (nextStatus === "SITE_ACCEPTED") {
        const order = draft.salesOrderRequests.find((entry) => entry.id === record.orderId);
        if (order) {
          const customerName = order.customerName;
          const debitAmount = record.finalSuppliedCum * order.approvedPrice;

          if (debitAmount > 0) {
            // Compute running balance from existing entries for this customer
            const existingEntries = (draft.customerLedgerEntries ?? []).filter(
              (entry) => entry.customerName === customerName,
            );
            const currentBalance = existingEntries.reduce((sum, entry) => {
              return entry.type === "DEBIT" ? sum + entry.amount : sum - entry.amount;
            }, 0);
            const newBalance = currentBalance + debitAmount;

            draft.customerLedgerEntries ??= [];
            draft.customerLedgerEntries.push({
              id: randomUUID(),
              customerName,
              type: "DEBIT",
              amount: debitAmount,
              runningBalance: newBalance,
              description: `Challan ${record.challanNumber} — ${record.finalSuppliedCum} CUM @ ₹${order.approvedPrice}/CUM`,
              referenceId: record.id,
              paymentMode: "AUTO_DISPATCH",
              createdBy: user.id,
              createdAt: now,
            });

            draft.customerAccounts ??= [];
            let account = findCustomerAccountByName(draft.customerAccounts, customerName);
            if (!account) {
              account = createCustomerAccountFromSalesOrder(randomUUID(), order);
              draft.customerAccounts.push(account);
            }

            if (account) {
              account.outstandingAmount = Math.max(0, getCustomerLedgerBalance(draft.customerLedgerEntries, customerName));
            }
          }
        }
      }

      draft.auditLogs.unshift({
        id: randomUUID(),
        actorId: user.id,
        actorRole: user.role,
        entityType: "DISPATCH_RECORD",
        entityId: record.id,
        action: nextStatus,
        detail: body.note?.trim() || `Marked challan ${record.challanNumber} as ${nextStatus.replaceAll("_", " ").toLowerCase()}.`,
        createdAt: now,
      });
    });

    return jsonOk({ message: "Dispatch site status updated." });
  } catch (error) {
    return jsonError(error);
  }
}
