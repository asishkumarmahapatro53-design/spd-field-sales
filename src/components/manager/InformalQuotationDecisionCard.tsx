"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toIndiaTimeLabel } from "@/lib/date";
import type { DocumentTemplate, InformalQuotationRequest, User } from "@/lib/types";

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
      {quotation.quotationDocumentUrl && quotation.quotationDocumentUrl !== quotation.quotationPdfUrl ? (
        <p>Document stored at: {quotation.quotationDocumentUrl}</p>
      ) : null}
      {quotation.pdfError ? <p>PDF note: {quotation.pdfError}</p> : null}
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
  templates,
}: {
  quotations: InformalQuotationRequest[];
  agents: User[];
  templates: DocumentTemplate[];
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busyId, setBusyId] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const activeQuotationTemplate = useMemo(
    () =>
      [...templates]
        .filter((template) => template.type === "QUOTATION" && template.status === "ACTIVE")
        .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))[0] ?? null,
    [templates],
  );
  const pending = quotations.filter((quotation) => quotation.status === "PENDING");
  const decided = quotations.filter((quotation) => quotation.status !== "PENDING").slice(0, 3);

  async function uploadQuotationTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTemplateBusy(true);
    setTemplateMessage("");
    setTemplateError("");

    const formData = new FormData(event.currentTarget);
    formData.set("type", "QUOTATION");

    const response = await fetch("/api/document-templates", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      setTemplateError(await parseApiError(response));
      setTemplateBusy(false);
      return;
    }

    event.currentTarget.reset();
    setTemplateMessage("Quotation template uploaded and activated.");
    setTemplateBusy(false);
    startTransition(() => router.refresh());
  }

  async function decide(id: string, status: "APPROVED" | "REJECTED" | "CORRECTION_REQUESTED") {
    setBusyId(id);
    setError("");
    const response = await fetch(`/api/informal-quotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        decisionNote: notes[id] || `${status === "APPROVED" ? "Approved" : status === "REJECTED" ? "Rejected" : "Correction requested"} from informal quotation document review.`,
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
      {templateError ? <div className="error-box">{templateError}</div> : null}
      {templateMessage ? <div className="success-box">{templateMessage}</div> : null}

      <div className="note-box mt-16">
        <div className="panel-header">
          <div>
            <h3>Quotation template</h3>
            <p className="panel-copy">
              Managers can activate the official informal quotation DOCX here. The app fills it, tries PDF release, and falls back to DOCX if PDF conversion is unavailable.
            </p>
          </div>
          <span className={activeQuotationTemplate ? "status-badge status-confirmed" : "status-badge status-pending"}>
            {activeQuotationTemplate ? "Active" : "Missing"}
          </span>
        </div>

        {activeQuotationTemplate ? (
          <p className="panel-copy">
            Active: <strong>{activeQuotationTemplate.name}</strong> ({activeQuotationTemplate.originalFileName}) uploaded{" "}
            {toIndiaTimeLabel(activeQuotationTemplate.uploadedAt)}.{" "}
            <a href={activeQuotationTemplate.fileUrl} target="_blank" rel="noopener noreferrer">Open template</a>
          </p>
        ) : (
          <div className="error-box">Upload and activate a quotation template before approving and releasing quotations.</div>
        )}

        <form className="form-grid mt-16" onSubmit={(event) => void uploadQuotationTemplate(event)}>
          <div className="field">
            <label htmlFor="managerQuotationTemplateName">Template name</label>
            <input id="managerQuotationTemplateName" name="name" placeholder="SPD informal quotation template" />
          </div>
          <div className="field">
            <label htmlFor="managerQuotationTemplateFile">Template file</label>
            <input
              id="managerQuotationTemplateFile"
              name="file"
              type="file"
              accept=".docx,.pdf,.jpg,.jpeg,.png,.webp"
              required
            />
            <span className="hint">Use the SPD informal quotation DOCX for data-filled quotation release.</span>
          </div>
          <button className="button" type="submit" disabled={templateBusy || isRefreshing}>
            {templateBusy ? "Uploading..." : "Upload quotation template"}
          </button>
        </form>
      </div>

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
                <button
                  className="button-ghost"
                  type="button"
                  disabled={busyId === quotation.id || isRefreshing}
                  onClick={() => void decide(quotation.id, "CORRECTION_REQUESTED")}
                >
                  Request correction
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
