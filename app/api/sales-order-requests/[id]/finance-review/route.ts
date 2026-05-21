import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { reviewSalesOrderRequestByAccounting } from "@/lib/repository";
import { saveUploadedFile } from "@/lib/storage";

async function readFinanceReviewBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return (await request.json()) as {
      status?: "FINANCE_VERIFIED" | "FINANCE_REJECTED";
      note?: string;
      financeChecklist?: Record<string, unknown>;
      manualPaymentVerification?: Record<string, unknown>;
      ledgerDecisionStatus?: string | null;
      linkedLedgerCustomerName?: string | null;
      duplicateLedgerConfidence?: number | null;
      creditLimitAmount?: number | null;
      creditPeriodDays?: number | null;
      creditRiskCategory?: "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
      financeRejectionReason?: "PO_MISSING" | "GST_INVALID" | "CREDIT_EXCEEDED" | "PAYMENT_NOT_RECEIVED" | "DUPLICATE_REQUEST" | "INCOMPLETE_DETAILS" | "OTHER";
    };
  }

  const formData = await request.formData();
  const paymentProof = formData.get("paymentProof");
  const paymentProofUrl =
    paymentProof instanceof File && paymentProof.size > 0 ? (await saveUploadedFile(paymentProof)).photoUrl : null;

  return {
    status: `${formData.get("status") ?? ""}` as "FINANCE_VERIFIED" | "FINANCE_REJECTED",
    note: `${formData.get("note") ?? formData.get("accountantRemarks") ?? ""}`,
    financeChecklist: {
      gstChecked: formData.get("gstChecked") === "on",
      gstCertificateChecked: formData.get("gstCertificateChecked") === "on",
      legalNameChecked: formData.get("legalNameChecked") === "on",
      billingAddressChecked: formData.get("billingAddressChecked") === "on",
      poChecked: formData.get("poChecked") === "on",
      pdcChecked: formData.get("pdcChecked") === "on",
      paymentProofChecked: formData.get("paymentProofChecked") === "on",
      amountReceivedChecked: formData.get("amountReceivedChecked") === "on",
      outstandingChecked: formData.get("outstandingChecked") === "on",
      overdueChecked: formData.get("overdueChecked") === "on",
      creditLimitChecked: formData.get("creditLimitChecked") === "on",
      accountantRemarks: `${formData.get("accountantRemarks") ?? ""}`,
    },
    manualPaymentVerification: {
      amountReceived: Number(formData.get("amountReceived") || 0),
      paymentMode: `${formData.get("paymentMode") ?? "CASH"}`,
      utrNumber: `${formData.get("utrNumber") ?? ""}`,
      chequeNumber: `${formData.get("chequeNumber") ?? ""}`,
      cashVoucherNumber: `${formData.get("cashVoucherNumber") ?? ""}`,
      paymentDate: `${formData.get("paymentDate") ?? ""}`,
      paymentProofUrl,
      bankCashAccount: `${formData.get("bankCashAccount") ?? ""}`,
    },
    ledgerDecisionStatus: `${formData.get("ledgerDecisionStatus") ?? ""}`,
    linkedLedgerCustomerName: `${formData.get("linkedLedgerCustomerName") ?? ""}`,
    duplicateLedgerConfidence: null,
    creditLimitAmount: Number(formData.get("creditLimitAmount") || 0),
    creditPeriodDays: Number(formData.get("creditPeriodDays") || 0),
    creditRiskCategory: `${formData.get("creditRiskCategory") ?? "LOW"}` as "LOW" | "MEDIUM" | "HIGH" | "BLOCKED",
    financeRejectionReason: `${formData.get("financeRejectionReason") ?? "OTHER"}` as "OTHER",
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const body = await readFinanceReviewBody(request);
    const { id } = await context.params;
    const orderRequest = await reviewSalesOrderRequestByAccounting(
      user,
      id,
      body.status === "FINANCE_REJECTED" ? "FINANCE_REJECTED" : "FINANCE_VERIFIED",
      `${body.note ?? ""}`,
      {
        financeChecklist: body.financeChecklist,
        manualPaymentVerification: body.manualPaymentVerification,
        ledgerDecisionStatus: body.ledgerDecisionStatus as never,
        linkedLedgerCustomerName: body.linkedLedgerCustomerName,
        duplicateLedgerConfidence: body.duplicateLedgerConfidence,
        creditLimitAmount: body.creditLimitAmount,
        creditPeriodDays: body.creditPeriodDays,
        creditRiskCategory: body.creditRiskCategory,
        financeRejectionReason: body.financeRejectionReason,
      },
    );
    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
