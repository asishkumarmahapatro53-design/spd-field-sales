import { describe, expect, it } from "vitest";
import { buildEffectiveCustomerLedgerEntries } from "@/lib/customer-ledger";
import type { DispatchRecord, SalesOrderRequest } from "@/lib/types";

const advanceOrder = {
  id: "order-1",
  plantId: "plant-a",
  customerName: "asish 1",
  siteName: "Test Site",
  grade: "M25",
  approvedPrice: 5000,
  quantity: 30,
  remainingQuantity: 0,
  amount: 150000,
  paymentType: "NORMAL",
  paymentTerms: "ADVANCE",
  receiverPhone: "9999999999",
  paymentReceivedConfirmed: true,
  status: "SCHEDULE_APPROVED",
  financeReviewedBy: "accountant-1",
  financeReviewedAt: "2026-05-12T08:00:00.000Z",
  createdBy: "agent-1",
  createdAt: "2026-05-12T07:00:00.000Z",
} as SalesOrderRequest;

function acceptedDispatch(id: string, challanNumber: string, finalSuppliedCum: number, siteAcceptedAt: string) {
  return {
    id,
    orderId: "order-1",
    challanNumber,
    finalSuppliedCum,
    status: "SITE_ACCEPTED",
    siteAcceptedAt,
    dispatchedAt: siteAcceptedAt,
    createdBy: "batcher-1",
  } as DispatchRecord;
}

describe("buildEffectiveCustomerLedgerEntries", () => {
  it("shows advance credit and accepted dispatch debits even when persisted ledger rows are missing", () => {
    const entries = buildEffectiveCustomerLedgerEntries({
      customerLedgerEntries: [],
      salesOrderRequests: [advanceOrder],
      dispatchRecords: [
        acceptedDispatch("dispatch-1", "CH/26-27/00001", 10, "2026-05-12T09:00:00.000Z"),
        acceptedDispatch("dispatch-2", "CH/26-27/00002", 10, "2026-05-12T10:00:00.000Z"),
        acceptedDispatch("dispatch-3", "CH/26-27/00003", 10, "2026-05-12T11:00:00.000Z"),
      ],
    });

    expect(entries).toHaveLength(4);
    expect(entries.filter((entry) => entry.type === "CREDIT")).toHaveLength(1);
    expect(entries.filter((entry) => entry.type === "DEBIT")).toHaveLength(3);
    expect(entries[0]?.runningBalance).toBe(0);
    expect(entries[entries.length - 1]?.paymentMode).toBe("ADVANCE_RECEIPT");
  });

  it("does not duplicate debit rows when a persisted ledger entry already exists", () => {
    const entries = buildEffectiveCustomerLedgerEntries({
      customerLedgerEntries: [
        {
          id: "ledger-dispatch-1",
          customerName: "asish 1",
          type: "DEBIT",
          amount: 50000,
          runningBalance: 50000,
          description: "Persisted challan debit",
          referenceId: "dispatch-1",
          paymentMode: "AUTO_DISPATCH",
          createdBy: "batcher-1",
          createdAt: "2026-05-12T09:00:00.000Z",
        },
      ],
      salesOrderRequests: [{ ...advanceOrder, paymentReceivedConfirmed: false }],
      dispatchRecords: [acceptedDispatch("dispatch-1", "CH/26-27/00001", 10, "2026-05-12T09:00:00.000Z")],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("ledger-dispatch-1");
  });
});
