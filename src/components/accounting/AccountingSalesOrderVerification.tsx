"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSalesOrderStatusMeta } from "@/lib/commercial";
import { toIndiaTimeLabel } from "@/lib/date";
import type { SalesOrderRequest } from "@/lib/types";

function money(value: number | null | undefined) {
  return `Rs ${Math.round(value ?? 0).toLocaleString("en-IN")}`;
}

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

export function AccountingSalesOrderVerification({ requests }: { requests: SalesOrderRequest[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, startTransition] = useTransition();
  const pendingFinance = requests.filter((entry) => entry.status === "PENDING_FINANCE");
  const financeVerified = requests.filter((entry) => entry.status === "FINANCE_VERIFIED");
  const ledgerReady = requests.filter((entry) => entry.status === "SCHEDULE_APPROVED");
  const pendingLedger = pendingFinance.filter((entry) => entry.gstin || entry.gstCertificateUrl);

  async function review(id: string, status: "FINANCE_VERIFIED" | "FINANCE_REJECTED", note: string) {
    setBusyId(id);
    setMessage("");
    setError("");

    const response = await fetch(`/api/sales-order-requests/${id}/finance-review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    setBusyId("");
    setMessage(status === "FINANCE_VERIFIED" ? "Sales order verified by finance." : "Sales order rejected by finance.");
    startTransition(() => router.refresh());
  }

  return (
    <section className="accounting-panel">
      <div className="panel-header">
        <div>
          <h3>Commercial Order Verification</h3>
          <p className="panel-copy">Verify PO, PDC, and payment evidence before the order moves into schedule and ledger handling.</p>
        </div>
      </div>

      <div className="accounting-metric-row compact">
        <div className="summary-cell">
          <span className="summary-label">Pending ledger</span>
          <strong>{pendingLedger.length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Pending finance</span>
          <strong>{pendingFinance.length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Finance verified</span>
          <strong>{financeVerified.length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Ledger ready</span>
          <strong>{ledgerReady.length}</strong>
        </div>
      </div>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <div className="data-list mt-16">
        {pendingFinance.length ? (
          pendingFinance.map((request) => (
            <article key={request.id} className="data-row">
              <div className="panel-header">
                <h4>{request.customerName}</h4>
                <span className="status-badge status-pending">Finance review</span>
              </div>
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
              </div>
              <div className="row-meta">
                <span>{request.poDocumentUrl ? "PO uploaded" : "PO not uploaded"}</span>
                <span>{request.pdcDocumentUrl ? "PDC uploaded" : "PDC not uploaded"}</span>
                <span>{request.paymentReceivedConfirmed ? "Payment confirmed" : "Payment not confirmed"}</span>
              </div>
              <div className="summary-card">
                <div className="panel-header">
                  <div>
                    <h4>Pending ledger details</h4>
                    <p className="panel-copy">{request.gstin ? `GSTIN ${request.gstin}` : "No GSTIN captured; batcher invoice mode will stay locked to challan-only."}</p>
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
              </div>
              <div className="button-row">
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
                <button
                  className="button"
                  type="button"
                  disabled={busyId === request.id || isRefreshing}
                  onClick={() => void review(request.id, "FINANCE_VERIFIED", "Finance verified the order documents and payment status.")}
                >
                  {busyId === request.id ? "Saving..." : "Verify"}
                </button>
                <button
                  className="button-danger"
                  type="button"
                  disabled={busyId === request.id || isRefreshing}
                  onClick={() => void review(request.id, "FINANCE_REJECTED", "Finance rejected the order due to missing or invalid documents.")}
                >
                  {busyId === request.id ? "Saving..." : "Reject"}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="note-box">No sales order requests are waiting for finance review right now.</div>
        )}
      </div>

      <div className="data-list mt-16">
        {requests.filter((entry) => entry.status !== "PENDING_FINANCE").slice(0, 6).map((request) => {
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
              {request.scheduleDateTime ? <p>Scheduled for {toIndiaTimeLabel(request.scheduleDateTime)}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
