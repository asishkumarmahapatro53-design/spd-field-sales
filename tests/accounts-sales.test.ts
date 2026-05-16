import { describe, expect, it } from "vitest";
import {
  buildSalesOrderPreviewHash,
  calculateAvailableCredit,
  getReimbursementOutstanding,
  isFinanceChecklistComplete,
  isManualPaymentVerificationComplete,
  isSalesOrderFinalChecklistComplete,
} from "@/lib/accounts-sales";
import type { FinanceVerificationChecklist, ManualPaymentVerification, SalesOrderFinalChecklist, SalesOrderRequest } from "@/lib/types";

const verifiedAt = "2026-05-16T09:00:00.000Z";

const completeFinanceChecklist: FinanceVerificationChecklist = {
  gstChecked: true,
  gstCertificateChecked: true,
  legalNameChecked: true,
  billingAddressChecked: true,
  poChecked: true,
  pdcChecked: true,
  paymentProofChecked: true,
  amountReceivedChecked: true,
  outstandingChecked: true,
  overdueChecked: true,
  creditLimitChecked: true,
  accountantRemarks: "Verified.",
  verifiedBy: "accounting-1",
  verifiedAt,
};

const completeFinalChecklist: SalesOrderFinalChecklist = {
  gradeConfirmed: true,
  quantityConfirmed: true,
  rateConfirmed: true,
  paymentTermsConfirmed: true,
  requiredDateTimeConfirmed: true,
  castingTypeConfirmed: true,
  pumpDumpRequirementConfirmed: true,
  receiverConfirmed: true,
  phoneConfirmed: true,
  deliveryAddressConfirmed: true,
  plantConfirmed: true,
  taxChallanModeConfirmed: true,
  accountantRemarks: "Final preview confirmed.",
  verifiedBy: "accounting-1",
  verifiedAt,
};

const cashPayment: ManualPaymentVerification = {
  amountReceived: 100000,
  paymentMode: "CASH",
  utrNumber: null,
  chequeNumber: null,
  cashVoucherNumber: "CV-001",
  paymentDate: verifiedAt,
  paymentProofUrl: null,
  bankCashAccount: "Cash account",
  verifiedBy: "accounting-1",
  verifiedAt,
  differenceFromRequiredAmount: 0,
};

const order = {
  id: "order-1",
  customerName: "Civil Sai",
  siteName: "Tower A",
  grade: "M25",
  quantity: 20,
  approvedPrice: 5000,
  amount: 100000,
  paymentType: "NORMAL",
  paymentTerms: "ADVANCE",
  requiredDate: "2026-05-17T04:30:00.000Z",
  receiverName: "Ravi",
  receiverPhone: "9999999999",
  siteAddress: "Bhubaneswar",
  plantId: "plant-a",
  gstin: "21ABCDE1234F1Z5",
  plannedCastingType: "PUMP",
  pumpRequired: true,
} as SalesOrderRequest;

describe("Accounts Sales safeguards", () => {
  it("requires every finance checklist safeguard plus remarks", () => {
    expect(isFinanceChecklistComplete(completeFinanceChecklist)).toBe(true);
    expect(isFinanceChecklistComplete({ ...completeFinanceChecklist, poChecked: false })).toBe(false);
    expect(isFinanceChecklistComplete({ ...completeFinanceChecklist, accountantRemarks: "" })).toBe(false);
  });

  it("requires payment reference fields based on payment mode", () => {
    expect(isManualPaymentVerificationComplete(cashPayment)).toBe(true);
    expect(isManualPaymentVerificationComplete({ ...cashPayment, cashVoucherNumber: null })).toBe(false);
    expect(isManualPaymentVerificationComplete({ ...cashPayment, paymentMode: "NEFT", cashVoucherNumber: null, utrNumber: "UTR-9" })).toBe(true);
    expect(isManualPaymentVerificationComplete({ ...cashPayment, paymentMode: "CHEQUE", cashVoucherNumber: null, chequeNumber: "" })).toBe(false);
  });

  it("requires all final sales order checklist confirmations", () => {
    expect(isSalesOrderFinalChecklistComplete(completeFinalChecklist)).toBe(true);
    expect(isSalesOrderFinalChecklistComplete({ ...completeFinalChecklist, receiverConfirmed: false })).toBe(false);
  });

  it("calculates available credit from limit, outstanding, and active exposure", () => {
    expect(calculateAvailableCredit({ creditLimit: 500000, currentOutstanding: 125000, activeOrderExposure: 200000 })).toBe(175000);
  });

  it("tracks reimbursement outstanding after partial payment", () => {
    expect(getReimbursementOutstanding({ totalAmount: 1000, paidAmount: 400, balanceAmount: 600, outstandingAmount: 600 })).toBe(600);
  });

  it("changes preview hash when order critical fields change", () => {
    expect(buildSalesOrderPreviewHash(order)).not.toBe(buildSalesOrderPreviewHash({ ...order, quantity: 21 }));
  });
});
