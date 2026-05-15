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
import { canUseInvoiceDocumentMode, extractPanFromGstin, getNextInvoiceNumber, normalizeDispatchDocumentMode } from "@/lib/legal-workflow";
import { findMixDesignForOrder, getDefaultMixDesignRecipe } from "@/lib/mix-design";
import type { ApprovalRequest, MixDesign, SalesOrderRequest } from "@/lib/types";

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

const salesOrder: SalesOrderRequest = {
  id: "so-1",
  leadId: "lead-1",
  siteId: "site-1",
  approvalRequestId: "approval-1",
  plantId: "plant-a",
  customerName: "JRM Buildcon",
  siteName: "JRM Site",
  grade: "M25",
  approvedPrice: 4600,
  quantity: 20,
  remainingQuantity: 20,
  amount: 92000,
  siteAddress: "Andharua, Bhubaneswar",
  oneWayDistanceKm: 18,
  trafficCount: 5,
  paymentType: "CREDIT",
  paymentTerms: "PO",
  mixDesignType: "DESIGN_MIX",
  mixDesignId: null,
  slump: "100 mm",
  receiverName: "Ravi",
  receiverPhone: "9999999999",
  poDocumentUrl: "/po.pdf",
  pdcDocumentUrl: null,
  gstin: "21ABCDE1234F1Z5",
  gstPan: "ABCDE1234F",
  gstLegalName: "JRM Buildcon Pvt Ltd",
  gstBillingAddress: "Bhubaneswar",
  gstCertificateUrl: null,
  gstVerificationStatus: "VERIFIED",
  gstVerifiedBy: "accounting-1",
  gstVerifiedAt: "2026-04-25T05:30:00.000Z",
  gstVerificationNote: "Verified",
  agentGstConfirmedAt: "2026-04-25T05:00:00.000Z",
  odooPartnerId: null,
  odooLedgerSyncStatus: "NOT_REQUIRED",
  odooLedgerSyncError: null,
  odooLedgerSyncedAt: null,
  odooSaleOrderId: null,
  odooSaleOrderName: null,
  odooSalesOrderSyncStatus: "NOT_REQUIRED",
  odooSalesOrderSyncError: null,
  odooSalesOrderSyncedAt: null,
  shippingAddress: "Andharua, Bhubaneswar",
  plannedCastingType: "PUMP",
  actualCastingType: "DUMP",
  pumpDispatchStatus: "NOT_DISPATCHED",
  pumpDispatchedBy: null,
  pumpDispatchedAt: null,
  pumpVehicleNumber: null,
  pumpOperatorName: null,
  pumpOperatorPhone: null,
  pumpDispatchNote: null,
  paymentReceivedConfirmed: false,
  requiredDate: "2026-04-26T04:30:00.000Z",
  pumpRequired: true,
  priority: "NORMAL",
  notes: "",
  status: "SCHEDULE_APPROVED",
  financeReviewedBy: "accounting-1",
  financeReviewedAt: "2026-04-25T06:30:00.000Z",
  financeNote: "Verified",
  scheduleDateTime: "2026-04-26T04:30:00.000Z",
  scheduleReceiverName: "Ravi",
  scheduleReceiverPhone: "9999999999",
  scheduleRequestedAt: "2026-04-25T07:30:00.000Z",
  scheduleDecidedBy: "manager-1",
  scheduleDecidedAt: "2026-04-25T08:30:00.000Z",
  scheduleNote: "Approved",
  createdBy: "agent-1",
  createdAt: "2026-04-25T04:30:00.000Z",
};

const linkedMixDesign: MixDesign = {
  id: "mix-linked",
  plantId: "plant-a",
  grade: "M25",
  version: 1,
  isActive: false,
  mixDesignType: "DESIGN_MIX",
  targetSlumpMm: 100,
  cementKgPerCum: 330,
  ggbsKgPerCum: 0,
  flyAshKgPerCum: 50,
  sandKgPerCum: 700,
  aggregate10mmKgPerCum: 380,
  aggregate20mmKgPerCum: 720,
  admixtureKgPerCum: 1.1,
  waterLitresPerCum: 165,
  createdBy: "qc-1",
  createdAt: "2026-04-25T05:30:00.000Z",
  updatedAt: "2026-04-25T05:30:00.000Z",
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

  it("keeps batcher invoice modes locked until GSTIN is verified", () => {
    expect(extractPanFromGstin("21ABCDE1234F1Z5")).toBe("ABCDE1234F");
    expect(canUseInvoiceDocumentMode(salesOrder)).toBe(true);
    expect(normalizeDispatchDocumentMode("CHALLAN_AND_GST_E_INVOICE", salesOrder)).toBe("CHALLAN_AND_GST_E_INVOICE");
    expect(normalizeDispatchDocumentMode("CHALLAN_AND_INVOICE", { ...salesOrder, gstin: null })).toBe("CHALLAN_ONLY");
    expect(normalizeDispatchDocumentMode("CHALLAN_AND_INVOICE", { ...salesOrder, gstVerificationStatus: "PENDING_ACCOUNTS" })).toBe("CHALLAN_ONLY");
  });

  it("allocates financial-year invoice numbers", () => {
    expect(getNextInvoiceNumber([], new Date("2026-05-11T04:30:00.000Z"))).toBe("INV/26-27/00001");
    expect(getNextInvoiceNumber(["INV/26-27/00001"], new Date("2026-05-11T04:30:00.000Z"))).toBe("INV/26-27/00002");
    expect(getNextInvoiceNumber(["INV/25-26/00009"], new Date("2026-04-01T04:30:00.000Z"))).toBe("INV/26-27/00001");
  });

  it("creates sensible starter recipes and prefers the order-linked mix design", () => {
    expect(getDefaultMixDesignRecipe("M25", "DESIGN_MIX").cementKgPerCum).toBeGreaterThan(0);
    expect(getDefaultMixDesignRecipe("M25", "NOMINAL_MIX").flyAshKgPerCum).toBe(0);

    expect(findMixDesignForOrder([linkedMixDesign], { ...salesOrder, mixDesignId: linkedMixDesign.id })).toBe(linkedMixDesign);
  });
});
