"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseApiError } from "@/components/agent/action-helpers";
import { getStakeholderLabel } from "@/lib/site-visit";
import { toIndiaTimeLabel } from "@/lib/date";
import type {
  InformalQuotationPaymentType,
  InformalQuotationPriceType,
  InformalQuotationRequest,
  Lead,
  LeadSite,
  MixDesignType,
  StakeholderContact,
} from "@/lib/types";

const MIX_DESIGN_OPTIONS: Array<{ value: MixDesignType; label: string }> = [
  { value: "NOMINAL_MIX", label: "Nominal mix" },
  { value: "DESIGN_MIX", label: "Specific mix design" },
];

const PRICE_TYPE_OPTIONS: Array<{ value: InformalQuotationPriceType; label: string; hint: string }> = [
  { value: "GST_INCLUSIVE", label: "GST inclusive", hint: "Credit can be requested only for GST-inclusive prices." },
  { value: "NON_GST", label: "Non-GST", hint: "Non-GST informal quotations are advance payment only." },
];

type QuotationItemDraft = {
  id: string;
  grade: string;
  quantityCum: string;
  mixDesignType: MixDesignType;
  mixRequirement: string;
  pricePerCum: string;
};

type StakeholderOption = {
  key: string;
  contact: StakeholderContact;
};

function createQuotationItem(): QuotationItemDraft {
  return {
    id: crypto.randomUUID(),
    grade: "",
    quantityCum: "",
    mixDesignType: "NOMINAL_MIX",
    mixRequirement: "",
    pricePerCum: "",
  };
}

function formatPriceType(value: InformalQuotationPriceType) {
  return value === "GST_INCLUSIVE" ? "GST inclusive" : "Non-GST";
}

function formatPaymentType(value: InformalQuotationPaymentType, creditDays: number | null) {
  if (value === "CREDIT") {
    return `Credit${creditDays ? ` (${creditDays} days)` : ""}`;
  }
  return "Advance";
}

function buildStakeholderOptions(site: LeadSite | null): StakeholderOption[] {
  if (!site) {
    return [];
  }

  return site.stakeholders
    .map<StakeholderOption>((contact, index) => ({
      key: `${contact.role ?? "OTHERS"}||${contact.name.trim()}||${contact.phone.trim()}||${index}`,
      contact,
    }))
    .filter((option) => (option.contact.role ?? "OTHERS") !== "FOUND_NO_ONE" && option.contact.name.trim());
}

export function InformalQuotationRequestCard({
  leads,
  leadSites,
  quotations,
}: {
  leads: Lead[];
  leadSites: LeadSite[];
  quotations: InformalQuotationRequest[];
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [siteId, setSiteId] = useState("");
  const [stakeholderKey, setStakeholderKey] = useState("");
  const [stakeholderEmail, setStakeholderEmail] = useState("");
  const [billingAddressMode, setBillingAddressMode] = useState<"SITE" | "CUSTOM">("SITE");
  const [billingAddress, setBillingAddress] = useState("");
  const [whatsappMode, setWhatsappMode] = useState<"STAKEHOLDER" | "CUSTOM">("STAKEHOLDER");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [priceType, setPriceType] = useState<InformalQuotationPriceType>("GST_INCLUSIVE");
  const [paymentType, setPaymentType] = useState<InformalQuotationPaymentType>("ADVANCE");
  const [creditDays, setCreditDays] = useState("");
  const [items, setItems] = useState<QuotationItemDraft[]>(() => [createQuotationItem()]);

  const leadSiteOptions = useMemo(() => leadSites.filter((site) => site.leadId === leadId), [leadId, leadSites]);
  const selectedLead = useMemo(() => leads.find((lead) => lead.id === leadId) ?? null, [leadId, leads]);
  const selectedSite = leadSiteOptions.find((site) => site.id === siteId) ?? leadSiteOptions[0] ?? null;
  const stakeholderOptions = useMemo(() => buildStakeholderOptions(selectedSite), [selectedSite]);
  const selectedStakeholder = stakeholderOptions.find((option) => option.key === stakeholderKey)?.contact ?? stakeholderOptions[0]?.contact ?? null;
  const pendingCount = quotations.filter((quotation) => quotation.status === "PENDING").length;

  useEffect(() => {
    setSiteId((current) => {
      if (current && leadSiteOptions.some((site) => site.id === current)) {
        return current;
      }
      return leadSiteOptions[0]?.id ?? "";
    });
  }, [leadSiteOptions]);

  useEffect(() => {
    setStakeholderKey((current) => {
      if (current && stakeholderOptions.some((option) => option.key === current)) {
        return current;
      }
      return stakeholderOptions[0]?.key ?? "";
    });
  }, [stakeholderOptions]);

  useEffect(() => {
    if (priceType === "NON_GST") {
      setPaymentType("ADVANCE");
      setCreditDays("");
    }
  }, [priceType]);

  useEffect(() => {
    if (billingAddressMode === "SITE") {
      setBillingAddress(selectedSite?.siteAddress ?? "");
    }
  }, [billingAddressMode, selectedSite]);

  useEffect(() => {
    if (whatsappMode === "STAKEHOLDER") {
      setWhatsappNumber(selectedStakeholder?.phone ?? "");
    }
  }, [selectedStakeholder, whatsappMode]);

  function updateItem(index: number, patch: Partial<QuotationItemDraft>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    setError("");

    if (!selectedStakeholder) {
      setError("Choose a saved stakeholder for this site before requesting an informal quotation.");
      setBusy(false);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = {
      leadId,
      siteId,
      stakeholderRole: selectedStakeholder.role ?? "OTHERS",
      stakeholderName: selectedStakeholder.name,
      stakeholderPhone: selectedStakeholder.phone,
      stakeholderEmail,
      billingAddress,
      whatsappNumber,
      priceType,
      paymentType,
      creditDays: paymentType === "CREDIT" ? Number(creditDays) : null,
      oneWayDistanceKm: Number(formData.get("oneWayDistanceKm")),
      trafficPostCount: Number(formData.get("trafficPostCount")),
      items: items.map((item) => ({
        id: item.id,
        grade: item.grade,
        quantityCum: Number(item.quantityCum),
        mixDesignType: item.mixDesignType,
        mixRequirement: item.mixRequirement,
        pricePerCum: Number(item.pricePerCum),
      })),
    };

    const response = await fetch("/api/informal-quotations", {
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
    setFeedback("Informal quotation request submitted for manager approval.");
    setStakeholderEmail("");
    setBillingAddressMode("SITE");
    setBillingAddress(selectedSite?.siteAddress ?? "");
    setWhatsappMode("STAKEHOLDER");
    setWhatsappNumber(selectedStakeholder?.phone ?? "");
    setCreditDays("");
    setPaymentType("ADVANCE");
    setItems([createQuotationItem()]);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="note-box">
          The sales agent can only request this quotation. Manager approval is required before any quotation format is released.
        </div>

        <div className="three-grid">
          <div className="field">
            <label htmlFor="informalLeadId">Existing lead</label>
            <select id="informalLeadId" value={leadId} onChange={(event) => setLeadId(event.target.value)} required>
              {leads.length ? null : <option value="">No leads available</option>}
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.siteName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="informalSiteId">Existing site</label>
            <select id="informalSiteId" value={siteId} onChange={(event) => setSiteId(event.target.value)} required>
              {leadSiteOptions.length ? null : <option value="">No saved sites available</option>}
              {leadSiteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.siteName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="informalStakeholder">Stakeholder</label>
            <select id="informalStakeholder" value={stakeholderKey} onChange={(event) => setStakeholderKey(event.target.value)} required>
              {stakeholderOptions.length ? null : <option value="">No stakeholder saved for this site</option>}
              {stakeholderOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.contact.name} - {getStakeholderLabel(option.contact.role ?? "OTHERS")}
                  {option.contact.phone ? ` (${option.contact.phone})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedSite ? (
          <div className="summary-card">
            <div className="panel-header">
              <div>
                <h4>{selectedSite.siteName}</h4>
                <p className="panel-copy">{selectedSite.siteAddress}</p>
              </div>
              <span className="metric-label">{selectedLead?.stage ?? "Lead"}</span>
            </div>
            <div className="row-meta">
              <span>Current supplier {selectedSite.currentSupplier || "not set"}</span>
              <span>Last grade {selectedSite.currentConcreteGrade || "not set"}</span>
              <span>{stakeholderOptions.length} saved stakeholder{stakeholderOptions.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        ) : null}

        <div className="three-grid">
          <div className="field">
            <label htmlFor="informalStakeholderEmail">Stakeholder email</label>
            <input
              id="informalStakeholderEmail"
              type="email"
              value={stakeholderEmail}
              onChange={(event) => setStakeholderEmail(event.target.value)}
              placeholder="client@example.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="informalBillingMode">Billing address</label>
            <select
              id="informalBillingMode"
              value={billingAddressMode}
              onChange={(event) => setBillingAddressMode(event.target.value as "SITE" | "CUSTOM")}
            >
              <option value="SITE">Same as site address</option>
              <option value="CUSTOM">Enter another billing address</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="informalWhatsappMode">WhatsApp number</label>
            <select
              id="informalWhatsappMode"
              value={whatsappMode}
              onChange={(event) => setWhatsappMode(event.target.value as "STAKEHOLDER" | "CUSTOM")}
            >
              <option value="STAKEHOLDER">Same as stakeholder mobile</option>
              <option value="CUSTOM">Enter another WhatsApp number</option>
            </select>
          </div>
        </div>

        <div className="two-grid">
          <div className="field">
            <label htmlFor="informalBillingAddress">Billing address for quotation</label>
            <textarea
              id="informalBillingAddress"
              value={billingAddress}
              onChange={(event) => setBillingAddress(event.target.value)}
              disabled={billingAddressMode === "SITE"}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="informalWhatsappNumber">Client WhatsApp number</label>
            <input
              id="informalWhatsappNumber"
              value={whatsappNumber}
              onChange={(event) => setWhatsappNumber(event.target.value)}
              disabled={whatsappMode === "STAKEHOLDER"}
              placeholder="+919876543210"
              required
            />
          </div>
        </div>

        <div className="three-grid">
          <div className="field">
            <label htmlFor="informalPriceType">Price type</label>
            <select
              id="informalPriceType"
              value={priceType}
              onChange={(event) => setPriceType(event.target.value as InformalQuotationPriceType)}
            >
              {PRICE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="hint">{PRICE_TYPE_OPTIONS.find((option) => option.value === priceType)?.hint}</span>
          </div>
          <div className="field">
            <label htmlFor="informalPaymentType">Payment type</label>
            <select
              id="informalPaymentType"
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value as InformalQuotationPaymentType)}
              disabled={priceType === "NON_GST"}
            >
              <option value="ADVANCE">Advance payment</option>
              {priceType === "GST_INCLUSIVE" ? <option value="CREDIT">Credit payment</option> : null}
            </select>
            <span className="hint">{priceType === "NON_GST" ? "Credit is blocked for non-GST quotations." : "Credit requires manager approval."}</span>
          </div>
        </div>

        {paymentType === "CREDIT" ? (
          <div className="field">
            <label htmlFor="informalCreditDays">Credit period required by client (days)</label>
            <input
              id="informalCreditDays"
              type="number"
              min="1"
              step="1"
              value={creditDays}
              onChange={(event) => setCreditDays(event.target.value)}
              required
            />
          </div>
        ) : null}

        <div className="field">
          <label>Concrete grades, quantities, mix design, and price</label>
          <div className="section-stack">
            {items.map((item, index) => (
              <div key={item.id} className="quotation-line-card">
                <div className="panel-header">
                  <h4>Grade {index + 1}</h4>
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
                <div className="three-grid">
                  <div className="field">
                    <label htmlFor={`informalGrade-${item.id}`}>Grade</label>
                    <input
                      id={`informalGrade-${item.id}`}
                      value={item.grade}
                      onChange={(event) => updateItem(index, { grade: event.target.value.toUpperCase() })}
                      placeholder="M25"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`informalQuantity-${item.id}`}>Quantity (CUM)</label>
                    <input
                      id={`informalQuantity-${item.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantityCum}
                      onChange={(event) => updateItem(index, { quantityCum: event.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`informalPrice-${item.id}`}>Price per CUM</label>
                    <input
                      id={`informalPrice-${item.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.pricePerCum}
                      onChange={(event) => updateItem(index, { pricePerCum: event.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="two-grid">
                  <div className="field">
                    <label htmlFor={`informalMixType-${item.id}`}>Mix design</label>
                    <select
                      id={`informalMixType-${item.id}`}
                      value={item.mixDesignType}
                      onChange={(event) => updateItem(index, { mixDesignType: event.target.value as MixDesignType, mixRequirement: "" })}
                    >
                      {MIX_DESIGN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {item.mixDesignType === "DESIGN_MIX" ? (
                    <div className="field">
                      <label htmlFor={`informalMixRequirement-${item.id}`}>Specific client requirement</label>
                      <input
                        id={`informalMixRequirement-${item.id}`}
                        value={item.mixRequirement}
                        onChange={(event) => updateItem(index, { mixRequirement: event.target.value })}
                        placeholder="Example: low heat, pumpable, special slump requirement"
                        required
                      />
                    </div>
                  ) : (
                    <div className="note-box">Nominal mix selected for this grade.</div>
                  )}
                </div>
              </div>
            ))}
            {items.length < 3 ? (
              <button className="button-ghost" type="button" onClick={() => setItems((current) => [...current, createQuotationItem()])}>
                Add another grade
              </button>
            ) : null}
          </div>
        </div>

        <div className="two-grid">
          <div className="field">
            <label htmlFor="informalDistance">One-way distance from plant (km)</label>
            <input id="informalDistance" name="oneWayDistanceKm" type="number" min="0" step="0.1" required />
          </div>
          <div className="field">
            <label htmlFor="informalTrafficPosts">Traffic posts on one-way distance</label>
            <input id="informalTrafficPosts" name="trafficPostCount" type="number" min="0" step="1" required />
          </div>
        </div>

        {feedback ? <div className="success-box">{feedback}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button-secondary" type="submit" disabled={busy || isRefreshing || !leads.length || !selectedSite || !selectedStakeholder}>
          {busy ? "Submitting..." : isRefreshing ? "Refreshing..." : "Request informal quotation"}
        </button>
      </form>

      <div className="data-list mt-16">
        {quotations.length ? (
          quotations.slice(0, 5).map((quotation) => (
            <div key={quotation.id} className="data-row">
              <div className="panel-header">
                <div>
                  <h4>{quotation.customerName}</h4>
                  <p className="panel-copy">{quotation.siteName}</p>
                </div>
                <span className={`status-badge status-${quotation.status.toLowerCase()}`}>{quotation.status}</span>
              </div>
              <p>
                {quotation.items
                  .map((item) => `${item.grade}: ${item.quantityCum} CUM @ ${item.pricePerCum}`)
                  .join(" | ")}
              </p>
              <div className="row-meta">
                <span>{quotation.stakeholderName}</span>
                <span>{formatPriceType(quotation.priceType)}</span>
                <span>{formatPaymentType(quotation.paymentType, quotation.creditDays)}</span>
                <span>PDF {quotation.pdfStatus.toLowerCase().replaceAll("_", " ")}</span>
                <span>Email {quotation.emailStatus.toLowerCase()}</span>
                <span>WhatsApp {quotation.whatsappStatus.toLowerCase().replaceAll("_", " ")}</span>
                <span>{toIndiaTimeLabel(quotation.createdAt)}</span>
              </div>
              <div className="note-box">View-only request. Download and forwarding stay locked until manager approval and final quotation format are configured.</div>
            </div>
          ))
        ) : (
          <div className="note-box">No informal quotation requests yet. Pending count will show here after submission.</div>
        )}
      </div>

      {pendingCount ? <p className="hint mt-16">{pendingCount} informal quotation request{pendingCount === 1 ? "" : "s"} waiting for manager approval.</p> : null}
    </>
  );
}
