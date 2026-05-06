"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toIndiaTimeLabel } from "@/lib/date";
import type { InformalQuotationRequest, User } from "@/lib/types";

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

function formatPriceType(value: InformalQuotationRequest["priceType"]) {
  return value === "GST_INCLUSIVE" ? "GST inclusive" : "Non-GST";
}

function formatPaymentType(request: InformalQuotationRequest) {
  if (request.paymentType === "CREDIT") {
    return `Credit payment (${request.creditDays ?? 0} days)`;
  }
  return "Advance payment";
}

function formatMixDesign(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function QuotationDocument({
  quotation,
  requestedBy,
}: {
  quotation: InformalQuotationRequest;
  requestedBy: User | undefined;
}) {
  return (
    <article className="quotation-document">
      <div className="quotation-document-letterhead">
        <p>Application for Informal Quotation Approval</p>
        <span>{toIndiaTimeLabel(quotation.createdAt)}</span>
      </div>

      <p>
        To,<br />
        The Sales Manager
      </p>

      <p>
        I, <strong>{requestedBy?.name ?? quotation.createdBy}</strong>, request approval to issue an informal quotation for the
        following lead and site. The salesperson has no download or forwarding permission until this request is approved.
      </p>

      <div className="quotation-document-grid">
        <DocumentField label="Lead / Customer" value={quotation.customerName} />
        <DocumentField label="Billing Address" value={quotation.billingAddress} />
        <DocumentField label="Site" value={quotation.siteName} />
        <DocumentField label="Site Address" value={quotation.siteAddress} />
        <DocumentField label="Stakeholder" value={`${quotation.stakeholderName} (${quotation.stakeholderLabel})`} />
        <DocumentField label="Stakeholder Mobile" value={quotation.stakeholderPhone || "Not provided"} />
        <DocumentField label="Stakeholder Email" value={quotation.stakeholderEmail} />
        <DocumentField label="WhatsApp Number" value={quotation.whatsappNumber} />
        <DocumentField label="Price Type" value={`${formatPriceType(quotation.priceType)}${quotation.priceType === "GST_INCLUSIVE" ? " - price includes GST" : ""}`} />
        <DocumentField label="Payment Type" value={formatPaymentType(quotation)} />
        <DocumentField label="One-Way Distance" value={`${quotation.oneWayDistanceKm} km`} />
        <DocumentField label="Traffic Posts" value={`${quotation.trafficPostCount}`} />
      </div>

      <div className="quotation-table-wrap">
        <table className="quotation-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Quantity</th>
              <th>Mix Design</th>
              <th>Requirement</th>
              <th>Price / CUM</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item) => (
              <tr key={item.id}>
                <td>{item.grade}</td>
                <td>{item.quantityCum} CUM</td>
                <td>{formatMixDesign(item.mixDesignType)}</td>
                <td>{item.mixRequirement}</td>
                <td>{item.pricePerCum}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        Status: <strong>{quotation.status}</strong>
        {quotation.decisionNote ? ` | Manager note: ${quotation.decisionNote}` : ""}
      </p>
      <p>
        Delivery: <strong>PDF {quotation.pdfStatus}</strong> | <strong>Email {quotation.emailStatus}</strong> |{" "}
        <strong>WhatsApp {quotation.whatsappStatus}</strong>
      </p>
      {quotation.quotationPdfUrl ? <p>PDF stored at: {quotation.quotationPdfUrl}</p> : null}
      {quotation.emailError ? <p>Email error: {quotation.emailError}</p> : null}
      {quotation.whatsappError ? <p>WhatsApp note: {quotation.whatsappError}</p> : null}
    </article>
  );
}

function DocumentField({ label, value }: { label: string; value: string }) {
  return (
    <div className="quotation-document-field">
      <strong>{label}:</strong> <span>{value}</span>
    </div>
  );
}

export function InformalQuotationDecisionCard({
  quotations,
  agents,
}: {
  quotations: InformalQuotationRequest[];
  agents: User[];
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const pending = quotations.filter((quotation) => quotation.status === "PENDING");
  const decided = quotations.filter((quotation) => quotation.status !== "PENDING").slice(0, 3);

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    setBusyId(id);
    setError("");
    const response = await fetch(`/api/informal-quotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        decisionNote: notes[id] || `${status === "APPROVED" ? "Approved" : "Rejected"} from informal quotation document review.`,
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Informal Quotation Requests</h2>
          <p className="panel-copy">Review sales-agent requests in document format before any client quotation is released.</p>
        </div>
        <span className="status-badge status-pending">{pending.length} pending</span>
      </div>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="data-list">
        {pending.length ? (
          pending.map((quotation) => (
            <div key={quotation.id} className="quotation-review-shell">
              <QuotationDocument quotation={quotation} requestedBy={agentsById.get(quotation.createdBy)} />
              <div className="field">
                <label htmlFor={`informalDecisionNote-${quotation.id}`}>Manager decision note</label>
                <textarea
                  id={`informalDecisionNote-${quotation.id}`}
                  value={notes[quotation.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [quotation.id]: event.target.value }))}
                  placeholder="Optional note for audit history"
                />
              </div>
              <div className="button-row">
                <button
                  className="button"
                  type="button"
                  disabled={busyId === quotation.id || isRefreshing}
                  onClick={() => void decide(quotation.id, "APPROVED")}
                >
                  {busyId === quotation.id ? "Saving..." : "Approve and send quotation"}
                </button>
                <button
                  className="button-danger"
                  type="button"
                  disabled={busyId === quotation.id || isRefreshing}
                  onClick={() => void decide(quotation.id, "REJECTED")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="success-box">No informal quotation requests are pending.</div>
        )}
      </div>

      {decided.length ? (
        <details className="history-toggle mt-16">
          <summary>
            <span>Recently decided informal quotations</span>
            <span className="history-toggle-copy">View document history</span>
          </summary>
          <div className="history-panel">
            <div className="data-list">
              {decided.map((quotation) => (
                <QuotationDocument key={quotation.id} quotation={quotation} requestedBy={agentsById.get(quotation.createdBy)} />
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </section>
  );
}
