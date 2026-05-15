import { notFound, redirect } from "next/navigation";
import { InvoicePrintActions } from "@/components/dispatch/InvoicePrintActions";
import { getCurrentUser, getDashboardPathForRole } from "@/lib/auth";
import { toIndiaTimeLabel } from "@/lib/date";
import { readCollection } from "@/lib/db";
import { getDocumentModeLabel } from "@/lib/legal-workflow";
import { getActiveDocumentTemplate } from "@/lib/repository";
import type { DocumentTemplate, UserRole } from "@/lib/types";

interface DispatchInvoicePageProps {
  params: Promise<{ id: string }>;
}

const PRINT_ROLES: UserRole[] = ["BATCHER", "MANAGER", "ACCOUNTING"];
const GST_RATE = 0.18;

const moneyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function money(value: number) {
  return moneyFormatter.format(roundMoney(value));
}

function quantity(value: number) {
  return numberFormatter.format(roundMoney(value));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function isImageTemplate(template: DocumentTemplate | null) {
  return Boolean(template?.fileMimeType.startsWith("image/"));
}

export default async function DispatchInvoicePage({ params }: DispatchInvoicePageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  if (!PRINT_ROLES.includes(user.role)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const dispatchRecords = await readCollection("dispatchRecords", { filters: [{ field: "id", op: "==", value: id }], limit: 1 });
  const dispatchRecord = dispatchRecords.find((entry) => entry.id === id);
  if (!dispatchRecord) {
    notFound();
  }

  if (user.role === "BATCHER" && user.homePlantId !== dispatchRecord.plantId) {
    redirect("/dashboard");
  }

  const [salesOrderRequests, plants] = await Promise.all([
    readCollection("salesOrderRequests", { filters: [{ field: "id", op: "==", value: dispatchRecord.orderId }], limit: 1 }),
    readCollection("plants", { filters: [{ field: "id", op: "==", value: dispatchRecord.plantId }], limit: 1 }),
  ]);

  const order = salesOrderRequests.find((entry) => entry.id === dispatchRecord.orderId);
  const plant = plants.find((entry) => entry.id === dispatchRecord.plantId);

  if (!order || !plant) {
    notFound();
  }

  const backHref = user.role === "BATCHER" ? "/batcher" : getDashboardPathForRole(user.role);
  const template = await getActiveDocumentTemplate("INVOICE");

  if (dispatchRecord.documentMode === "CHALLAN_ONLY") {
    return (
      <main className="invoice-print-shell">
        <InvoicePrintActions backHref={backHref} />
        <section className="invoice-sheet">
          <h1>Invoice Not Available</h1>
          <p>
            Dispatch {dispatchRecord.challanNumber} was created as challan-only, so the app has no invoice document to print.
          </p>
        </section>
      </main>
    );
  }

  const isRejected = dispatchRecord.status === "SITE_REJECTED";
  const isReturnPendingAcceptance = dispatchRecord.status === "RETURNED";
  const suppliedQuantity = isRejected ? 0 : Math.max(0, dispatchRecord.finalSuppliedCum);
  const grossAmount = roundMoney(suppliedQuantity * order.approvedPrice);
  const taxableAmount = dispatchRecord.gstin ? roundMoney(grossAmount / (1 + GST_RATE)) : grossAmount;
  const cgstAmount = dispatchRecord.gstin ? roundMoney(taxableAmount * (GST_RATE / 2)) : 0;
  const sgstAmount = dispatchRecord.gstin ? roundMoney(taxableAmount * (GST_RATE / 2)) : 0;
  const invoiceTotal = dispatchRecord.gstin ? grossAmount : taxableAmount;
  const eInvoiceNote =
    dispatchRecord.documentMode === "CHALLAN_AND_GST_E_INVOICE"
      ? dispatchRecord.eInvoiceIrn ?? "IRN pending external e-invoice integration"
      : "Not applicable";

  return (
    <main className="invoice-print-shell">
      <InvoicePrintActions backHref={backHref} />

      <section className={template ? "invoice-sheet is-template-backed" : "invoice-sheet"}>
        {isImageTemplate(template) ? <img className="document-template-artwork" src={template?.fileUrl} alt="" /> : null}
        {template && !isImageTemplate(template) ? (
          <div className="print-warning-banner is-caution">
            Active invoice template is stored as a PDF reference: <a href={template.fileUrl} target="_blank" rel="noopener noreferrer">{template.originalFileName}</a>
          </div>
        ) : null}
        {isRejected ? (
          <div className="print-warning-banner">
            Rejected dispatch. This invoice is void and must not be billed to the customer.
          </div>
        ) : null}
        {isReturnPendingAcceptance ? (
          <div className="print-warning-banner is-caution">
            Return load recorded. Verify site acceptance before treating this invoice as final.
          </div>
        ) : null}

        <header className="invoice-header">
          <div>
            <p className="invoice-kicker">{getDocumentModeLabel(dispatchRecord.documentMode)}</p>
            <h1>Tax Invoice</h1>
            <p>SPD Concrete Pvt Ltd</p>
          </div>
          <div className="invoice-number-box">
            <span>Invoice No.</span>
            <strong>{dispatchRecord.invoiceNumber ?? "Pending"}</strong>
            <small>{toIndiaTimeLabel(dispatchRecord.dispatchedAt)}</small>
          </div>
        </header>

        <div className="invoice-meta-grid">
          <div>
            <span>Plant</span>
            <strong>{plant.name}</strong>
          </div>
          <div>
            <span>Challan</span>
            <strong>{dispatchRecord.challanNumber}</strong>
          </div>
          <div>
            <span>Invoice Status</span>
            <strong>{statusLabel(dispatchRecord.invoiceStatus)}</strong>
          </div>
          <div>
            <span>Vehicle</span>
            <strong>{dispatchRecord.vehicleCode}</strong>
          </div>
        </div>

        <div className="invoice-party-grid">
          <section>
            <h2>Bill To</h2>
            <strong>{order.gstLegalName || order.customerName}</strong>
            <p>{order.gstBillingAddress || order.siteAddress}</p>
            <p>GSTIN: {dispatchRecord.gstin ?? "Not provided"}</p>
          </section>
          <section>
            <h2>Ship To</h2>
            <strong>{order.siteName}</strong>
            <p>{order.shippingAddress || order.siteAddress}</p>
            <p>Receiver: {order.scheduleReceiverName || order.receiverName}</p>
            <p>Phone: {order.scheduleReceiverPhone || order.receiverPhone}</p>
          </section>
        </div>

        <table className="invoice-lines">
          <thead>
            <tr>
              <th>Description</th>
              <th>Grade</th>
              <th>Qty (CUM)</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ready Mix Concrete supply</td>
              <td>{order.grade}</td>
              <td>{quantity(suppliedQuantity)}</td>
              <td>{money(order.approvedPrice)}</td>
              <td>{money(grossAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-bottom-grid">
          <section className="invoice-notes">
            <h2>Dispatch Details</h2>
            <p>Driver: {dispatchRecord.driverName}</p>
            <p>Driver phone: {dispatchRecord.driverPhone || "Not recorded"}</p>
            <p>Casting: {dispatchRecord.actualCastingType.toLowerCase()}</p>
            <p>Site status: {statusLabel(dispatchRecord.status)}</p>
            <p>E-invoice IRN: {eInvoiceNote}</p>
          </section>

          <section className="invoice-totals">
            <div>
              <span>Taxable value</span>
              <strong>{money(taxableAmount)}</strong>
            </div>
            {dispatchRecord.gstin ? (
              <>
                <div>
                  <span>CGST 9%</span>
                  <strong>{money(cgstAmount)}</strong>
                </div>
                <div>
                  <span>SGST 9%</span>
                  <strong>{money(sgstAmount)}</strong>
                </div>
              </>
            ) : null}
            <div className="invoice-total-row">
              <span>Total</span>
              <strong>{money(invoiceTotal)}</strong>
            </div>
          </section>
        </div>

        <footer className="invoice-footer">
          <span>Prepared from SPD dispatch record {dispatchRecord.id.slice(0, 8)}</span>
          <strong>Authorized Signatory</strong>
        </footer>
      </section>
    </main>
  );
}
