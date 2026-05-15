"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSalesOrderStatusMeta } from "@/lib/commercial";
import { toIndiaTimeLabel } from "@/lib/date";
import type { OdooSyncStatus, SalesOrderRequest } from "@/lib/types";

function money(value: number | null | undefined) {
  return `Rs ${Math.round(value ?? 0).toLocaleString("en-IN")}`;
}

function getOdooStatusMeta(status: OdooSyncStatus | null | undefined) {
  switch (status) {
    case "SYNCED":
      return { label: "synced", className: "status-approved" };
    case "FAILED":
      return { label: "failed", className: "status-rejected" };
    case "SKIPPED":
      return { label: "skipped", className: "status-pending" };
    case "PENDING":
      return { label: "pending", className: "status-pending" };
    default:
      return { label: "not required", className: "status-awaiting_confirmation" };
  }
}

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

function OrderSnapshot({ request }: { request: SalesOrderRequest }) {
  return (
    <>
      <div className="row-meta">
        <span>{request.siteName}</span>
        <span>{request.grade}</span>
        <span>{request.quantity} CUM</span>
        <span>{money(request.amount)}</span>
      </div>
      <p>{request.siteAddress}</p>
      <div className="row-meta">
        <span>{request.paymentType.replaceAll("_", " ").toLowerCase()}/{request.paymentTerms.replaceAll("_", " ").toLowerCase()}</span>
        <span>Receiver {request.receiverName}</span>
        <span>{request.receiverPhone}</span>
        <span>Required {toIndiaTimeLabel(request.requiredDate)}</span>
      </div>
    </>
  );
}

function LedgerDetails({ request }: { request: SalesOrderRequest }) {
  const odooLedger = getOdooStatusMeta(request.odooLedgerSyncStatus);
  const odooSalesOrder = getOdooStatusMeta(request.odooSalesOrderSyncStatus);
  const odooError = request.odooSalesOrderSyncError ?? request.odooLedgerSyncError;

  return (
    <div className="summary-card">
      <div className="panel-header">
        <div>
          <h4>Ledger details</h4>
          <p className="panel-copy">
            {request.gstin ? `GSTIN ${request.gstin}` : "No GSTIN captured; invoice mode will stay locked to challan-only."}
          </p>
        </div>
        <span className={`status-badge status-${request.gstVerificationStatus.toLowerCase()}`}>
          {request.gstVerificationStatus.replaceAll("_", " ").toLowerCase()}
        </span>
      </div>
      <div className="row-meta">
        <span>PAN {request.gstPan ?? "not detected"}</span>
        <span>{request.gstLegalName ?? "Legal name not captured"}</span>
        <span>Ship to site address</span>
      </div>
      <p>{request.gstBillingAddress ?? "Billing address not captured"}</p>
      {request.gstin ? (
        <>
          <div className="row-meta mt-12">
            <span>
              Odoo ledger <span className={`status-badge ${odooLedger.className}`}>{odooLedger.label}</span>
            </span>
            <span>
              Odoo sales order <span className={`status-badge ${odooSalesOrder.className}`}>{odooSalesOrder.label}</span>
            </span>
            <span>{request.odooPartnerId ? `Partner #${request.odooPartnerId}` : "Partner not posted"}</span>
            <span>{request.odooSaleOrderName ?? "Sales order not posted"}</span>
          </div>
          {odooError ? <div className="warning-box mt-12">Odoo sync note: {odooError}</div> : null}
        </>
      ) : null}
    </div>
  );
}

function DocumentLinks({ request }: { request: SalesOrderRequest }) {
  return (
    <>
      {request.poDocumentUrl ? (
        <a className="button-ghost" href={request.poDocumentUrl} target="_blank" rel="noreferrer">
          View PO
        </a>
      ) : null}
      {request.pdcDocumentUrl ? (
        <a className="button-ghost" href={request.pdcDocumentUrl} target="_blank" rel="noreferrer">
          View PDC
        </a>
      ) : null}
      {request.gstCertificateUrl ? (
        <a className="button-ghost" href={request.gstCertificateUrl} target="_blank" rel="noreferrer">
          View GST certificate
        </a>
      ) : null}
    </>
  );
}

export function AccountingSalesOrderVerification({ requests }: { requests: SalesOrderRequest[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, startTransition] = useTransition();
  const ledgerRequests = requests.filter((entry) => entry.status === "PENDING_FINANCE");
  const salesOrderRequests = requests.filter((entry) => entry.status === "FINANCE_VERIFIED");
  const productionQueue = requests.filter((entry) => entry.status === "SCHEDULE_PENDING");
  const productionApproved = requests.filter((entry) => entry.status === "SCHEDULE_APPROVED");

  function refreshWithMessage(nextMessage: string) {
    setBusyId("");
    setMessage(nextMessage);
    startTransition(() => router.refresh());
  }

  async function createLedger(id: string) {
    setBusyId(id);
    setMessage("");
    setError("");

    const response = await fetch(`/api/sales-order-requests/${id}/finance-review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "FINANCE_VERIFIED",
        note: "Accounts created the customer ledger and verified GST/payment documents.",
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    refreshWithMessage("Customer ledger created. Request moved to Create Sales Order section.");
  }

  async function rejectLedger(id: string) {
    setBusyId(id);
    setMessage("");
    setError("");

    const response = await fetch(`/api/sales-order-requests/${id}/finance-review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "FINANCE_REJECTED",
        note: "Accounts rejected the ledger request due to missing or invalid documents.",
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    refreshWithMessage("Ledger request rejected and sent back for correction.");
  }

  async function createSalesOrder(id: string) {
    setBusyId(id);
    setMessage("");
    setError("");

    const response = await fetch(`/api/sales-order-requests/${id}/create-sales-order`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: "Accounts created the sales order from the verified ledger and sent it to production.",
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    refreshWithMessage("Sales order created and sent to Production Manager dashboard.");
  }

  return (
    <section className="accounting-panel">
      <div className="panel-header">
        <div>
          <h3>Ledger & Sales Order Desk</h3>
          <p className="panel-copy">Sales agent requests first land in ledger creation, then move to sales order creation after Accounts approval.</p>
        </div>
      </div>

      <div className="accounting-metric-row compact">
        <div className="summary-cell">
          <span className="summary-label">Ledger requests</span>
          <strong>{ledgerRequests.length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Sales order pending</span>
          <strong>{salesOrderRequests.length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Production queue</span>
          <strong>{productionQueue.length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Production approved</span>
          <strong>{productionApproved.length}</strong>
        </div>
      </div>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <div className="accounting-command-row mt-24">
        <div>
          <h2>Create New Ledger</h2>
          <p className="panel-copy">Pending requests from sales agents appear here first. Accounts verifies GST/payment documents and creates the customer ledger.</p>
        </div>
        <span className="status-badge status-pending">{ledgerRequests.length} pending</span>
      </div>

      <div className="data-list mt-16">
        {ledgerRequests.length ? (
          ledgerRequests.map((request) => (
            <article key={request.id} className="data-row">
              <div className="panel-header">
                <h4>{request.customerName}</h4>
                <span className="status-badge status-pending">Pending ledger request</span>
              </div>
              <OrderSnapshot request={request} />
              <div className="row-meta">
                <span>{request.poDocumentUrl ? "PO uploaded" : "PO not uploaded"}</span>
                <span>{request.pdcDocumentUrl ? "PDC uploaded" : "PDC not uploaded"}</span>
                <span>{request.paymentReceivedConfirmed ? "Payment confirmed" : "Payment not confirmed"}</span>
              </div>
              <LedgerDetails request={request} />
              <div className="button-row">
                <DocumentLinks request={request} />
                <button className="button" type="button" disabled={busyId === request.id || isRefreshing} onClick={() => void createLedger(request.id)}>
                  {busyId === request.id ? "Saving..." : "Create ledger"}
                </button>
                <button className="button-danger" type="button" disabled={busyId === request.id || isRefreshing} onClick={() => void rejectLedger(request.id)}>
                  {busyId === request.id ? "Saving..." : "Reject"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="note-box">No sales order requests are waiting for ledger creation right now.</div>
        )}
      </div>

      <div className="accounting-command-row mt-24">
        <div>
          <h2>Create Sales Order</h2>
          <p className="panel-copy">After ledger creation, the same request waits here until Accounts creates the sales order and sends it to Production Manager.</p>
        </div>
        <span className="status-badge status-approved">{salesOrderRequests.length} pending</span>
      </div>

      <div className="data-list mt-16">
        {salesOrderRequests.length ? (
          salesOrderRequests.map((request) => (
            <article key={request.id} className="data-row">
              <div className="panel-header">
                <h4>{request.customerName}</h4>
                <span className="status-badge status-approved">Ledger created</span>
              </div>
              <OrderSnapshot request={request} />
              <LedgerDetails request={request} />
              <div className="button-row">
                <DocumentLinks request={request} />
                <button className="button" type="button" disabled={busyId === request.id || isRefreshing} onClick={() => void createSalesOrder(request.id)}>
                  {busyId === request.id ? "Creating..." : "Create sales order"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="note-box">No ledger-created requests are waiting for sales order creation right now.</div>
        )}
      </div>

      <div className="accounting-command-row mt-24">
        <div>
          <h2>Sales Order Pipeline</h2>
          <p className="panel-copy">Recent orders after Accounts action, including production decisions.</p>
        </div>
      </div>
      <div className="data-list mt-16">
        {requests.filter((entry) => entry.status !== "PENDING_FINANCE" && entry.status !== "FINANCE_VERIFIED").slice(0, 6).map((request) => {
          const statusMeta = getSalesOrderStatusMeta(request.status);
          return (
            <article key={request.id} className="data-row">
              <div className="panel-header">
                <h4>{request.customerName}</h4>
                <span className={`status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
              </div>
              <div className="row-meta">
                <span>{request.grade}</span>
                <span>{request.quantity} CUM</span>
                <span>{money(request.amount)}</span>
                <span>{toIndiaTimeLabel(request.createdAt)}</span>
              </div>
              {request.scheduleDateTime ? <p>Production requested for {toIndiaTimeLabel(request.scheduleDateTime)}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
