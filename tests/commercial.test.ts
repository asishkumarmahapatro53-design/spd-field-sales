import { describe, expect, it } from "vitest";
import {
  computeSalesOrderAmount,
  getApprovalItemById,
  getApprovalItems,
  normalizePaymentTerms,
  requiresPaymentReceipt,
  requiresPdcUpload,
  requiresPoUpload,
} from "@/lib/commercial";
import type { ApprovalRequest } from "@/lib/types";

const approval: ApprovalRequest = {
  id: "approval-1",
  leadId: "lead-1",
  siteId: "site-1",
  plantId: "plant-a",
  customerName: "JRM Buildcon",
  siteName: "JRM Site",
  siteAddress: "Andharua, Bhubaneswar",
  items: [
    { id: "item-1", grade: "M25", quotedPrice: 4600 },
    { id: "item-2", grade: "M30", quotedPrice: 4825 },
  ],
  mixDesignType: "DESIGN_MIX",
  grade: "M25",
  quantity: 80,
  requiredDate: "2026-04-26T04:30:00.000Z",
  oneWayDistanceKm: 18,
  distanceFromPlantKm: 18,
  trafficCount: 5,
  castingType: "Pump",
  paymentType: "CREDIT",
  paymentTerms: "PO_AND_PDC",
  quotedPrice: 4600,
  status: "APPROVED",
  decidedBy: "manager-1",
  decidedAt: "2026-04-25T05:30:00.000Z",
  decisionNote: "Approved",
  createdBy: "agent-1",
  createdAt: "2026-04-24T05:30:00.000Z",
};

describe("commercial workflow helpers", () => {
  it("forces normal payment types to advance terms", () => {
    expect(normalizePaymentTerms("NORMAL", "PO_AND_PDC")).toBe("ADVANCE");
    expect(normalizePaymentTerms("CREDIT", "PO")).toBe("PO");
  });

  it("detects PO, PDC, and payment confirmation requirements", () => {
    expect(requiresPoUpload("PO_AND_PDC")).toBe(true);
    expect(requiresPoUpload("PDC")).toBe(false);
    expect(requiresPdcUpload("PO_AND_PDC")).toBe(true);
    expect(requiresPdcUpload("PO")).toBe(false);
    expect(requiresPaymentReceipt("NORMAL", "ADVANCE")).toBe(true);
    expect(requiresPaymentReceipt("CREDIT", "PO")).toBe(false);
  });

  it("adds the pump charge when quantity is below 30 CUM", () => {
    expect(computeSalesOrderAmount(25, 4600, true)).toBe(123000);
    expect(computeSalesOrderAmount(40, 4600, true)).toBe(184000);
    expect(computeSalesOrderAmount(25, 4600, false)).toBe(115000);
  });

  it("returns the approval items and finds the selected one", () => {
    expect(getApprovalItems(approval)).toHaveLength(2);
    expect(getApprovalItemById(approval, "item-2")?.grade).toBe("M30");
    expect(getApprovalItemById(approval, "missing")?.grade).toBe("M25");
  });
});
