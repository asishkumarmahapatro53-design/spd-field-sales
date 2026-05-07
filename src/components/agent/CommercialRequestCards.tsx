"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  computeSalesOrderAmount,
  getApprovalItems,
  getApprovalItemById,
  getSalesOrderStatusMeta,
  isOrderReadyForSchedule,
  normalizePaymentTerms,
  requiresPaymentReceipt,
  requiresPdcUpload,
  requiresPoUpload,
} from "@/lib/commercial";
import { extractPanFromGstin, isValidGstin, normalizeCastingType } from "@/lib/legal-workflow";
import type { ApprovalRequest, ApprovalRequestItem, Lead, LeadSite, PaymentTerms, PaymentType, SalesOrderRequest } from "@/lib/types";
import { parseApiError } from "@/components/agent/action-helpers";

const PAYMENT_TYPE_OPTIONS: Array<{ value: PaymentType; label: string }> = [
  { value: "NORMAL", label: "Normal" },
  { value: "CREDIT", label: "Credit" },
];

const PAYMENT_TERMS_OPTIONS: Array<{ value: PaymentTerms; label: string }> = [
  { value: "ADVANCE", label: "Advance" },
  { value: "PO", label: "PO" },
  { value: "PDC", label: "PDC" },
  { value: "PO_AND_PDC", label: "PO + PDC" },
];

const MIX_DESIGN_OPTIONS = [
  { value: "DESIGN_MIX", label: "Design mix" },
  { value: "NOMINAL_MIX", label: "Nominal mix" },
] as const;

const DEFAULT_ITEM = () => ({ id: crypto.randomUUID(), grade: "", quotedPrice: "" });

function formatPayment(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localTime.toISOString().slice(0, 16);
}

function money(value: number | null | undefined) {
  return `Rs ${Math.round(value ?? 0).toLocaleString("en-IN")}`;
}

export function ApprovalRequestCard({
  leads,
  leadSites,
  approvals,
}: {
  leads: Lead[];
  leadSites: LeadSite[];
  approvals: ApprovalRequest[];
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [siteId, setSiteId] = useState("");
  const [customerName, setCustomerName] = useState(leads[0]?.siteName ?? "");
  const [paymentType, setPaymentType] = useState<PaymentType>("NORMAL");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>("ADVANCE");
  const [items, setItems] = useState<Array<{ id: string; grade: string; quotedPrice: string }>>([DEFAULT_ITEM()]);
  const selectedLead = useMemo(() => leads.find((lead) => lead.id === leadId) ?? null, [leads, leadId]);
  const leadSiteOptions = useMemo(
    () => leadSites.filter((site) => site.leadId === leadId),
    [leadId, leadSites],
  );
  const selectedSite = leadSiteOptions.find((site) => site.id === siteId) ?? leadSiteOptions[0] ?? null;

  useEffect(() => {
    if (!selectedLead) {
      setSiteId("");
      setCustomerName("");
      return;
    }

    setCustomerName((current) => current || selectedLead.siteName);
    setSiteId((current) => {
      if (current && leadSiteOptions.some((site) => site.id === current)) {
        return current;
      }
      return leadSiteOptions[0]?.id ?? "";
    });
  }, [leadSiteOptions, selectedLead]);

  useEffect(() => {
    if (paymentType === "NORMAL") {
      setPaymentTerms("ADVANCE");
    }
  }, [paymentType]);

  function updateItem(index: number, patch: Partial<{ grade: string; quotedPrice: string }>) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      leadId,
      siteId: siteId || null,
      customerName,
      quantity: Number(formData.get("quantity")),
      requiredDate: `${formData.get("requiredDate") ?? ""}`,
      oneWayDistanceKm: Number(formData.get("oneWayDistanceKm")),
      trafficCount: Number(formData.get("trafficCount")),
      castingType: `${formData.get("castingType") ?? ""}`,
      mixDesignType: `${formData.get("mixDesignType") ?? "DESIGN_MIX"}`,
      paymentType,
      paymentTerms,
      items: items
        .map((item) => ({
          id: item.id,
          grade: item.grade,
          quotedPrice: Number(item.quotedPrice),
        }))
        .filter((item) => item.grade && Number.isFinite(item.quotedPrice) && item.quotedPrice > 0),
    };

    const response = await fetch("/api/approval-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    setBusy(false);
    setFeedback("Final approval request submitted.");
    setItems([DEFAULT_ITEM()]);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="three-grid">
          <div className="field">
            <label htmlFor="approvalLeadId">Lead</label>
            <select
              id="approvalLeadId"
              value={leadId}
              onChange={(event) => setLeadId(event.target.value)}
              required
            >
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.siteName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="approvalSiteId">Site</label>
            <select
              id="approvalSiteId"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              required
            >
              {leadSiteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.siteName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="approvalCustomerName">Client / customer name</label>
            <input
              id="approvalCustomerName"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              required
            />
          </div>
        </div>

        {selectedSite ? (
          <div className="summary-card">
            <div className="panel-header">
              <div>
                <h4>{selectedSite.siteName}</h4>
                <p className="panel-copy">{selectedSite.siteAddress}</p>
              </div>
              <span className="metric-label">{selectedSite.currentSupplier || "Supplier pending"}</span>
            </div>
            <div className="row-meta">
              <span>Last grade {selectedSite.currentConcreteGrade || "Not set"}</span>
              <span>Current quantity {selectedSite.currentQuantityCum || 0} CUM</span>
              <span>Lead score {selectedSite.score}/10</span>
            </div>
          </div>
        ) : null}

        <div className="field">
          <label>Approved grades and prices</label>
          <div className="section-stack">
            {items.map((item, index) => (
              <div key={item.id} className="three-grid">
                <div className="field">
                  <label htmlFor={`grade-${item.id}`}>Grade {index + 1}</label>
                  <input
                    id={`grade-${item.id}`}
                    value={item.grade}
                    onChange={(event) => updateItem(index, { grade: event.target.value.toUpperCase() })}
                    placeholder="M25"
                    required={index === 0}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`price-${item.id}`}>Price</label>
                  <input
                    id={`price-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quotedPrice}
                    onChange={(event) => updateItem(index, { quotedPrice: event.target.value })}
                    required={index === 0}
                  />
                </div>
                <div className="button-row align-end">
                  {items.length > 1 ? (
                    <button
                      className="button-ghost"
                      type="button"
                      onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {items.length < 3 ? (
              <button className="button-ghost" type="button" onClick={() => setItems((current) => [...current, DEFAULT_ITEM()])}>
                Add another grade
              </button>
            ) : null}
          </div>
        </div>

        <div className="three-grid">
          <div className="field">
            <label htmlFor="approvalQuantity">Project quantity (CUM)</label>
            <input id="approvalQuantity" name="quantity" type="number" min="0" step="0.01" required />
          </div>
          <div className="field">
            <label htmlFor="approvalRequiredDate">Required date</label>
            <input id="approvalRequiredDate" name="requiredDate" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="approvalDistance">One-way distance from plant (km)</label>
            <input id="approvalDistance" name="oneWayDistanceKm" type="number" min="0" step="0.1" required />
          </div>
        </div>

        <div className="three-grid">
          <div className="field">
            <label htmlFor="approvalTraffic">Number of traffic</label>
            <input id="approvalTraffic" name="trafficCount" type="number" min="0" required />
          </div>
          <div className="field">
            <label htmlFor="approvalCastingType">Casting type</label>
            <select id="approvalCastingType" name="castingType" defaultValue="Pump">
              <option value="Pump">Pump</option>
              <option value="Dump">Dump</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="approvalMixDesignType">Mix design type</label>
            <select id="approvalMixDesignType" name="mixDesignType" defaultValue="DESIGN_MIX">
              {MIX_DESIGN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="three-grid">
          <div className="field">
            <label htmlFor="approvalPaymentType">Payment type</label>
            <select
              id="approvalPaymentType"
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value as PaymentType)}
            >
              {PAYMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="approvalPaymentTerms">Payment terms</label>
            <select
              id="approvalPaymentTerms"
              value={paymentTerms}
              onChange={(event) => setPaymentTerms(event.target.value as PaymentTerms)}
              disabled={paymentType === "NORMAL"}
            >
              {PAYMENT_TERMS_OPTIONS.filter((option) => paymentType === "CREDIT" || option.value === "ADVANCE").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="hint">
              {paymentType === "NORMAL" ? "Normal payment always uses advance terms." : "Credit orders can require PO, PDC, or both."}
            </span>
          </div>
        </div>

        {feedback ? <div className="success-box">{feedback}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button-secondary" type="submit" disabled={busy || isRefreshing || !leads.length}>
          {busy ? "Submitting..." : isRefreshing ? "Refreshing..." : "Submit final approval"}
        </button>
      </form>

      {approvals.length ? (
        <div className="data-list mt-16">
          {approvals.slice(0, 3).map((approval) => (
            <div key={approval.id} className="data-row">
              <div className="panel-header">
                <h4>{approval.customerName}</h4>
                <span className={`status-badge status-${approval.status.toLowerCase()}`}>{approval.status}</span>
              </div>
              <p>{getApprovalItems(approval).map((item) => `${item.grade} @ ${item.quotedPrice}`).join(" | ")}</p>
              <div className="row-meta">
                <span>{approval.siteName}</span>
                <span>{approval.quantity} CUM</span>
                <span>{formatPayment(approval.paymentType)}/{formatPayment(approval.paymentTerms)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function SalesOrderRequestCard({
  approvals,
  salesOrderRequests,
}: {
  approvals: ApprovalRequest[];
  salesOrderRequests: SalesOrderRequest[];
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const approvedApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === "APPROVED"),
    [approvals],
  );
  const [approvalRequestId, setApprovalRequestId] = useState(approvedApprovals[0]?.id ?? "");
  const selectedApproval = approvedApprovals.find((approval) => approval.id === approvalRequestId) ?? approvedApprovals[0] ?? null;
  const approvalItems = selectedApproval ? getApprovalItems(selectedApproval) : [];
  const [approvalItemId, setApprovalItemId] = useState(approvalItems[0]?.id ?? "");
  const selectedItem = selectedApproval ? getApprovalItemById(selectedApproval, approvalItemId) : null;
  const [quantity, setQuantity] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [pumpRequired, setPumpRequired] = useState(false);
  const [plannedCastingType, setPlannedCastingType] = useState<"PUMP" | "DUMP">("DUMP");
  const [gstin, setGstin] = useState("");
  const [gstLegalName, setGstLegalName] = useState("");
  const [gstBillingAddress, setGstBillingAddress] = useState("");
  const [agentGstConfirmed, setAgentGstConfirmed] = useState(false);
  const normalizedPaymentTerms = selectedApproval
    ? normalizePaymentTerms(selectedApproval.paymentType, selectedApproval.paymentTerms)
    : "ADVANCE";
  const needsPo = selectedApproval ? requiresPoUpload(normalizedPaymentTerms) : false;
  const needsPdc = selectedApproval ? requiresPdcUpload(normalizedPaymentTerms) : false;
  const needsReceipt = selectedApproval ? requiresPaymentReceipt(selectedApproval.paymentType, normalizedPaymentTerms) : false;
  const amountPreview =
    selectedItem && Number.isFinite(Number(quantity)) && Number(quantity) > 0
      ? computeSalesOrderAmount(Number(quantity), selectedItem.quotedPrice, pumpRequired)
      : null;

  useEffect(() => {
    if (!selectedApproval) {
      setApprovalItemId("");
      return;
    }

    setApprovalItemId((current) => {
      if (current && approvalItems.some((item) => item.id === current)) {
        return current;
      }
      return approvalItems[0]?.id ?? "";
    });
    setQuantity((current) => current || `${selectedApproval.quantity}`);
    // Sync the required date whenever the selected approval changes
    setRequiredDate(toDateInputValue(selectedApproval.requiredDate));
    const nextCastingType = normalizeCastingType(selectedApproval.castingType);
    setPlannedCastingType(nextCastingType);
    setPumpRequired(nextCastingType === "PUMP");
  }, [approvalItems, selectedApproval]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("leadId", selectedApproval?.leadId ?? "");
    formData.set("approvalRequestId", selectedApproval?.id ?? "");
    formData.set("approvalItemId", approvalItemId);
    formData.set("pumpRequired", pumpRequired ? "true" : "false");
    formData.set("plannedCastingType", plannedCastingType);
    formData.set("agentGstConfirmed", agentGstConfirmed ? "true" : "false");

    const response = await fetch("/api/sales-order-requests", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    setBusy(false);
    setFeedback("Sales/SLA order request created and moved to finance review.");
    form.reset();
    setQuantity(selectedApproval ? `${selectedApproval.quantity}` : "");
    const resetCastingType = selectedApproval ? normalizeCastingType(selectedApproval.castingType) : "DUMP";
    setPlannedCastingType(resetCastingType);
    setPumpRequired(resetCastingType === "PUMP");
    setGstin("");
    setGstLegalName("");
    setGstBillingAddress("");
    setAgentGstConfirmed(false);
    startTransition(() => router.refresh());
  }

  const normalizedGstin = gstin.trim().toUpperCase().replace(/\s+/g, "");
  const gstPan = normalizedGstin ? extractPanFromGstin(normalizedGstin) : null;
  const hasValidGstin = normalizedGstin ? isValidGstin(normalizedGstin) : false;

  return (
    <>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="three-grid">
          <div className="field">
            <label htmlFor="salesApprovalId">Approved final approval</label>
            <select
              id="salesApprovalId"
              value={approvalRequestId}
              onChange={(event) => setApprovalRequestId(event.target.value)}
              required
            >
              {approvedApprovals.length ? null : <option value="">No approved approvals available</option>}
              {approvedApprovals.map((approval) => (
                <option key={approval.id} value={approval.id}>
                  {approval.customerName} - {approval.siteName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="salesApprovalItemId">Approved grade</label>
            <select
              id="salesApprovalItemId"
              value={approvalItemId}
              onChange={(event) => setApprovalItemId(event.target.value)}
              required
            >
              {approvalItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.grade} @ {item.quotedPrice}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="salesPriority">Priority</label>
            <select id="salesPriority" name="priority" defaultValue="NORMAL">
              <option value="NORMAL">Normal</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        <div className="summary-card">
          <div className="panel-header">
            <div>
              <h4>Customer legal details</h4>
              <p className="panel-copy">GSTIN enables invoice mode later. If it is absent, batcher dispatch will stay challan-only.</p>
            </div>
            <span className={`status-badge ${hasValidGstin ? "status-approved" : "status-pending"}`}>
              {hasValidGstin ? "GSTIN format ok" : "Challan fallback"}
            </span>
          </div>
          <div className="three-grid">
            <div className="field">
              <label htmlFor="salesGstin">GSTIN</label>
              <input
                id="salesGstin"
                name="gstin"
                value={gstin}
                onChange={(event) => {
                  setGstin(event.target.value.toUpperCase());
                  setAgentGstConfirmed(false);
                }}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
              <span className="hint">{gstPan ? `PAN auto-detected: ${gstPan}` : "Leave blank only when this dispatch must remain challan-only."}</span>
            </div>
            <div className="field">
              <label htmlFor="salesGstLegalName">Legal business name</label>
              <input
                id="salesGstLegalName"
                name="gstLegalName"
                value={gstLegalName}
                onChange={(event) => {
                  setGstLegalName(event.target.value);
                  setAgentGstConfirmed(false);
                }}
                required={Boolean(normalizedGstin)}
              />
            </div>
            <div className="field">
              <label htmlFor="salesGstCertificate">GST certificate fallback</label>
              <input id="salesGstCertificate" name="gstCertificate" type="file" accept=".pdf,.jpg,.jpeg,.png" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="salesGstBillingAddress">Billing address</label>
            <textarea
              id="salesGstBillingAddress"
              name="gstBillingAddress"
              value={gstBillingAddress}
              onChange={(event) => {
                setGstBillingAddress(event.target.value);
                setAgentGstConfirmed(false);
              }}
              placeholder="Registered billing address from GST verification"
              required={Boolean(normalizedGstin)}
            />
          </div>
          {normalizedGstin ? (
            <label className="row-meta">
              <input
                name="agentGstConfirmedCheckbox"
                type="checkbox"
                checked={agentGstConfirmed}
                onChange={(event) => setAgentGstConfirmed(event.target.checked)}
                required
              />
              I verified the GST legal name and billing address before submitting
            </label>
          ) : null}
        </div>

        {selectedApproval ? (
          <div className="summary-card">
            <div className="panel-header">
              <div>
                <h4>{selectedApproval.customerName}</h4>
                <p className="panel-copy">{selectedApproval.siteAddress}</p>
              </div>
              <span className="metric-label">{selectedApproval.siteName}</span>
            </div>
            <div className="row-meta">
              <span>{selectedApproval.oneWayDistanceKm} km one-way</span>
              <span>{selectedApproval.trafficCount} traffic</span>
              <span>{formatPayment(selectedApproval.paymentType)}/{formatPayment(normalizedPaymentTerms)}</span>
              <span>{selectedApproval.mixDesignType.replaceAll("_", " ").toLowerCase()}</span>
            </div>
          </div>
        ) : null}

        <div className="three-grid">
          <div className="field">
            <label htmlFor="salesQuantity">Quantity (CUM)</label>
            <input
              id="salesQuantity"
              name="quantity"
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="salesSlump">Required slump</label>
            <input id="salesSlump" name="slump" placeholder="100 mm" required />
          </div>
          <div className="field">
            <label htmlFor="salesRequiredDate">Required date</label>
            <input
              id="salesRequiredDate"
              name="requiredDate"
              type="date"
              value={requiredDate}
              onChange={(event) => setRequiredDate(event.target.value)}
              required
            />
          </div>
        </div>

        <div className="three-grid">
          <div className="field">
            <label htmlFor="salesReceiverName">Receiver name</label>
            <input id="salesReceiverName" name="receiverName" required />
          </div>
          <div className="field">
            <label htmlFor="salesReceiverPhone">Receiver phone</label>
            <input id="salesReceiverPhone" name="receiverPhone" required />
          </div>
          <label className="row-meta align-end">
            <input checked={pumpRequired} readOnly name="pumpRequiredCheckbox" type="checkbox" />
            Planned pump
          </label>
        </div>

        <div className="field">
          <label htmlFor="salesPlannedCastingType">Planned casting type</label>
          <select
            id="salesPlannedCastingType"
            name="plannedCastingType"
            value={plannedCastingType}
            onChange={(event) => {
              const nextValue = event.target.value === "PUMP" ? "PUMP" : "DUMP";
              setPlannedCastingType(nextValue);
              setPumpRequired(nextValue === "PUMP");
            }}
          >
            <option value="PUMP">Pump</option>
            <option value="DUMP">Dump</option>
          </select>
          <span className="hint">Final challan/invoice casting will follow production manager pump dispatch confirmation.</span>
        </div>

        <div className="field">
          <label htmlFor="salesNotes">Notes</label>
          <textarea id="salesNotes" name="notes" placeholder="Dispatch instructions, site gate notes, and commercial remarks." />
        </div>

        {needsPo ? (
          <div className="field">
            <label htmlFor="salesPoDocument">PO document</label>
            <input id="salesPoDocument" name="poDocument" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" required={needsPo} />
          </div>
        ) : null}

        {needsPdc ? (
          <div className="field">
            <label htmlFor="salesPdcDocument">PDC document</label>
            <input id="salesPdcDocument" name="pdcDocument" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" required={needsPdc} />
          </div>
        ) : null}

        {needsReceipt ? (
          <label className="row-meta">
            <input name="paymentReceivedConfirmed" type="checkbox" value="true" required />
            Full payment received and confirmed for this advance order
          </label>
        ) : null}

        {amountPreview !== null ? (
          <div className="summary-card">
            <div className="panel-header">
              <div>
                <h4>Amount preview</h4>
                <p className="panel-copy">Quantity x approved price, with Rs 8000 pump charge added when quantity is below 30 CUM.</p>
              </div>
              <strong>{money(amountPreview)}</strong>
            </div>
          </div>
        ) : null}

        {feedback ? <div className="success-box">{feedback}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button-secondary" type="submit" disabled={busy || isRefreshing || !selectedApproval || !selectedItem}>
          {busy ? "Submitting..." : isRefreshing ? "Refreshing..." : "Create sales order request"}
        </button>
      </form>

      {salesOrderRequests.length ? (
        <div className="data-list mt-16">
          {salesOrderRequests.slice(0, 4).map((request) => {
            const statusMeta = getSalesOrderStatusMeta(request.status);
            return (
              <div key={request.id} className="data-row">
                <div className="panel-header">
                  <h4>{request.customerName}</h4>
                  <span className={`status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                </div>
                <p>{request.grade} | {request.quantity} CUM | {money(request.amount)}</p>
                <div className="row-meta">
                  <span>{request.siteName}</span>
                  <span>{formatPayment(request.paymentType)}/{formatPayment(request.paymentTerms)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export function ScheduleRequestCard({ salesOrderRequests }: { salesOrderRequests: SalesOrderRequest[] }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const scheduleReadyOrders = useMemo(
    () => salesOrderRequests.filter((request) => isOrderReadyForSchedule(request)),
    [salesOrderRequests],
  );
  const [requestId, setRequestId] = useState(scheduleReadyOrders[0]?.id ?? "");
  const selectedRequest = scheduleReadyOrders.find((request) => request.id === requestId) ?? scheduleReadyOrders[0] ?? null;
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [scheduleDateTime, setScheduleDateTime] = useState("");

  useEffect(() => {
    if (!selectedRequest) {
      setReceiverName("");
      setReceiverPhone("");
      setScheduleDateTime("");
      return;
    }

    setReceiverName(selectedRequest.scheduleReceiverName ?? selectedRequest.receiverName ?? "");
    setReceiverPhone(selectedRequest.scheduleReceiverPhone ?? selectedRequest.receiverPhone ?? "");
    setScheduleDateTime(toDateTimeLocalValue(selectedRequest.scheduleDateTime));
  }, [selectedRequest]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) {
      return;
    }

    setBusy(true);
    setFeedback("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/sales-order-requests/${selectedRequest.id}/schedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleDateTime: `${formData.get("scheduleDateTime") ?? ""}`,
        receiverName: `${formData.get("receiverName") ?? ""}`,
        receiverPhone: `${formData.get("receiverPhone") ?? ""}`,
        note: `${formData.get("note") ?? ""}`,
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    setBusy(false);
    setFeedback("Request sent to the production schedule approval queue.");
    startTransition(() => router.refresh());
  }

  return (
    <>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="scheduleRequestId">Finance-verified order</label>
          <select
            id="scheduleRequestId"
            value={requestId}
            onChange={(event) => setRequestId(event.target.value)}
            required
          >
            {scheduleReadyOrders.length ? null : <option value="">No finance-verified orders ready for scheduling</option>}
            {scheduleReadyOrders.map((request) => (
              <option key={request.id} value={request.id}>
                {request.customerName} - {request.grade} - {request.quantity} CUM
              </option>
            ))}
          </select>
        </div>

        {selectedRequest ? (
          <div className="summary-card">
            <div className="panel-header">
              <div>
                <h4>{selectedRequest.customerName}</h4>
                <p className="panel-copy">{selectedRequest.siteAddress}</p>
              </div>
              <strong>{money(selectedRequest.amount)}</strong>
            </div>
            <div className="row-meta">
              <span>{selectedRequest.grade}</span>
              <span>{selectedRequest.quantity} CUM</span>
              <span>{formatPayment(selectedRequest.priority)}</span>
            </div>
          </div>
        ) : null}

        <div className="three-grid">
          <div className="field">
            <label htmlFor="scheduleDateTime">Schedule date and time</label>
            <input
              id="scheduleDateTime"
              name="scheduleDateTime"
              type="datetime-local"
              value={scheduleDateTime}
              onChange={(event) => setScheduleDateTime(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="scheduleReceiverName">Receiver name</label>
            <input
              id="scheduleReceiverName"
              name="receiverName"
              value={receiverName}
              onChange={(event) => setReceiverName(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="scheduleReceiverPhone">Receiver phone</label>
            <input
              id="scheduleReceiverPhone"
              name="receiverPhone"
              value={receiverPhone}
              onChange={(event) => setReceiverPhone(event.target.value)}
              required
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="scheduleNote">Schedule note</label>
          <textarea id="scheduleNote" name="note" placeholder="Preferred slot, unloading instructions, or resubmission note." />
        </div>

        {feedback ? <div className="success-box">{feedback}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button-secondary" type="submit" disabled={busy || isRefreshing || !selectedRequest}>
          {busy ? "Submitting..." : isRefreshing ? "Refreshing..." : "Create request to add in schedule"}
        </button>
      </form>

      {salesOrderRequests.length ? (
        <div className="data-list mt-16">
          {salesOrderRequests
            .filter((request) => request.status === "SCHEDULE_PENDING" || request.status === "SCHEDULE_APPROVED" || request.status === "SCHEDULE_REJECTED")
            .slice(0, 4)
            .map((request) => {
              const statusMeta = getSalesOrderStatusMeta(request.status);
              return (
                <div key={request.id} className="data-row">
                  <div className="panel-header">
                    <h4>{request.customerName}</h4>
                    <span className={`status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                  </div>
                  <p>
                    {request.scheduleDateTime ? new Date(request.scheduleDateTime).toLocaleString("en-IN") : "Schedule not fixed"} | {request.scheduleReceiverName ?? request.receiverName}
                  </p>
                </div>
              );
            })}
        </div>
      ) : null}
    </>
  );
}
