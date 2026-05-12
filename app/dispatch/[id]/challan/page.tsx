import { notFound, redirect } from "next/navigation";
import { InvoicePrintActions } from "@/components/dispatch/InvoicePrintActions";
import { getCurrentUser, getDashboardPathForRole } from "@/lib/auth";
import { toIndiaTimeLabel } from "@/lib/date";
import { readCollection } from "@/lib/db";
import { getDocumentModeLabel } from "@/lib/legal-workflow";
import type { UserRole } from "@/lib/types";

interface DispatchChallanPageProps {
  params: Promise<{ id: string }>;
}

const PRINT_ROLES: UserRole[] = ["BATCHER", "MANAGER", "ACCOUNTING"];

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function quantity(value: number) {
  return numberFormatter.format(Math.round(value * 100) / 100);
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export default async function DispatchChallanPage({ params }: DispatchChallanPageProps) {
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
  const isRejected = dispatchRecord.status === "SITE_REJECTED";
  const isReturnPendingAcceptance = dispatchRecord.status === "RETURNED";
  const finalSuppliedCum = isRejected ? 0 : dispatchRecord.finalSuppliedCum;

  return (
    <main className="invoice-print-shell">
      <InvoicePrintActions backHref={backHref} printLabel="Print challan" />

      <section className="invoice-sheet">
        {isRejected ? (
          <div className="print-warning-banner">
            Rejected dispatch. This challan is void for billing and should be retained only as an exception record.
          </div>
        ) : null}
        {isReturnPendingAcceptance ? (
          <div className="print-warning-banner is-caution">
            Return load recorded. Site acceptance is still pending for the final supplied quantity.
          </div>
        ) : null}

        <header className="invoice-header">
          <div>
            <p className="invoice-kicker">Delivery challan</p>
            <h1>Delivery Challan</h1>
            <p>SPD Concrete Pvt Ltd</p>
          </div>
          <div className="invoice-number-box">
            <span>Challan No.</span>
            <strong>{dispatchRecord.challanNumber}</strong>
            <small>{toIndiaTimeLabel(dispatchRecord.dispatchedAt)}</small>
          </div>
        </header>

        <div className="invoice-meta-grid">
          <div>
            <span>Plant</span>
            <strong>{plant.name}</strong>
          </div>
          <div>
            <span>Document Mode</span>
            <strong>{getDocumentModeLabel(dispatchRecord.documentMode)}</strong>
          </div>
          <div>
            <span>Vehicle</span>
            <strong>{dispatchRecord.vehicleCode}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{statusLabel(dispatchRecord.status)}</strong>
          </div>
        </div>

        <div className="invoice-party-grid">
          <section>
            <h2>Customer</h2>
            <strong>{order.customerName}</strong>
            <p>{order.siteAddress}</p>
            <p>GSTIN: {dispatchRecord.gstin ?? "Not provided"}</p>
          </section>
          <section>
            <h2>Site / Receiver</h2>
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
              <th>Loaded Qty (CUM)</th>
              <th>Returned Qty (CUM)</th>
              <th>Final Qty (CUM)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ready Mix Concrete dispatch</td>
              <td>{order.grade}</td>
              <td>{quantity(dispatchRecord.dispatchedQuantityCum)}</td>
              <td>{quantity(dispatchRecord.returnedQuantityCum)}</td>
              <td>{quantity(finalSuppliedCum)}</td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-bottom-grid">
          <section className="invoice-notes">
            <h2>Dispatch Details</h2>
            <p>Driver: {dispatchRecord.driverName}</p>
            <p>Driver phone: {dispatchRecord.driverPhone || "Not recorded"}</p>
            <p>Casting: {dispatchRecord.actualCastingType.toLowerCase()}</p>
            <p>Pump: {dispatchRecord.pumpDispatchStatus.replaceAll("_", " ").toLowerCase()}</p>
            <p>Invoice: {dispatchRecord.invoiceNumber ?? "Not generated"}</p>
          </section>

          <section className="invoice-notes">
            <h2>Site Acknowledgement</h2>
            <p>Material received in good condition.</p>
            <div className="signature-grid">
              <span>Receiver signature</span>
              <span>Driver signature</span>
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
