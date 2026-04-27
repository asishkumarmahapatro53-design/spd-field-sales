"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GpsCamera } from "@/components/agent/GpsCamera";
import { InstantPriceCard } from "@/components/agent/InstantPriceCard";
import { SiteVisitFlowCard } from "@/components/agent/SiteVisitFlowCard";
import {
  ApprovalRequestCard as CommercialApprovalRequestCard,
  SalesOrderRequestCard as CommercialSalesOrderRequestCard,
  ScheduleRequestCard as CommercialScheduleRequestCard,
} from "@/components/agent/CommercialRequestCards";
import { parseApiError } from "@/components/agent/action-helpers";
import type { AgentDashboardData, ApprovalRequest, Lead, LeadSite, OdometerReading, SalesOrderRequest } from "@/lib/types";

type ActionSectionId = "odometer" | "site-visit" | "instant-price" | "approval" | "sales-order" | "schedule" | "help";

const ODOMETER_UPLOAD_TARGET_BYTES = 32 * 1024;
const ODOMETER_UPLOAD_HARD_LIMIT_BYTES = 40 * 1024;

interface AgentActionPanelProps {
  user: AgentDashboardData["user"];
  leads: Lead[];
  leadSites: LeadSite[];
  approvals: ApprovalRequest[];
  salesOrderRequests: SalesOrderRequest[];
}

interface ActionAccordionSectionProps {
  step: string;
  title: string;
  description: string;
  meta: string;
  isOpen: boolean;
  onOpen: () => void;
  children: ReactNode;
}

function ActionAccordionSection({
  step,
  title,
  description,
  meta,
  isOpen,
  onOpen,
  children,
}: ActionAccordionSectionProps) {
  return (
    <section className={isOpen ? "action-item is-open" : "action-item"}>
      <button className="action-trigger" type="button" aria-expanded={isOpen} onClick={onOpen}>
        <span className="action-step">{step}</span>
        <span className="action-copy">
          <span className="action-title-row">
            <strong className="action-title">{title}</strong>
            <span className="action-meta">{meta}</span>
          </span>
          <span className="action-description">{description}</span>
        </span>
        <span className="action-indicator" aria-hidden="true">
          {isOpen ? "-" : "+"}
        </span>
      </button>
      {isOpen ? <div className="action-panel">{children}</div> : null}
    </section>
  );
}

export function AgentActionPanel({ user, leads, leadSites, approvals, salesOrderRequests }: AgentActionPanelProps) {
  const [activeSection, setActiveSection] = useState<ActionSectionId>("odometer");
  const pendingApprovals = approvals.filter((approval) => approval.status === "PENDING").length;
  const pendingOrders = salesOrderRequests.filter((request) => request.status === "PENDING_FINANCE").length;
  const readyForSchedule = salesOrderRequests.filter(
    (request) => request.status === "FINANCE_VERIFIED" || request.status === "SCHEDULE_REJECTED",
  ).length;

  return (
    <div className="action-workflow">
      <ActionAccordionSection
        step="01"
        title="Odometer Capture"
        description="Upload the start or end dashboard photo and confirm the extracted reading."
        meta="Start / end photo"
        isOpen={activeSection === "odometer"}
        onOpen={() => setActiveSection("odometer")}
      >
        <OdometerUploadCard agentName={user.name} employeeId={user.employeeId} />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="02"
        title="Site Visit Entry"
        description="Save the site visit details, project notes, and next follow-up in one place."
        meta={`${leads.length} tracked lead${leads.length === 1 ? "" : "s"}`}
        isOpen={activeSection === "site-visit"}
        onOpen={() => setActiveSection("site-visit")}
      >
        <SiteVisitFlowCard
          agentName={user.name}
          employeeId={user.employeeId}
          leads={leads}
          leadSites={leadSites}
        />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="03"
        title="Get Instant Price"
        description="Use the saved grade formula to estimate an instant working price for the site."
        meta="Quick calculator"
        isOpen={activeSection === "instant-price"}
        onOpen={() => setActiveSection("instant-price")}
      >
        <InstantPriceCard />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="04"
        title="Raise Approval Request"
        description="Send negotiated price requests to the manager without leaving the dashboard."
        meta={`${pendingApprovals} pending`}
        isOpen={activeSection === "approval"}
        onOpen={() => setActiveSection("approval")}
      >
        <CommercialApprovalRequestCard leads={leads} leadSites={leadSites} approvals={approvals} />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="05"
        title="Create Sales/SLA Order"
        description="Raise a finance-ready sales order only from manager-approved commercial terms."
        meta={`${pendingOrders} in finance queue`}
        isOpen={activeSection === "sales-order"}
        onOpen={() => setActiveSection("sales-order")}
      >
        <CommercialSalesOrderRequestCard approvals={approvals} salesOrderRequests={salesOrderRequests} />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="06"
        title="Add In Schedule"
        description="Send finance-verified orders into the production schedule approval flow."
        meta={`${readyForSchedule} ready`}
        isOpen={activeSection === "schedule"}
        onOpen={() => setActiveSection("schedule")}
      >
        <CommercialScheduleRequestCard salesOrderRequests={salesOrderRequests} />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="07"
        title="Help / Correction Request"
        description="Ask for support when a day has missing timings, readings, or visit updates."
        meta="Correction support"
        isOpen={activeSection === "help"}
        onOpen={() => setActiveSection("help")}
      >
        <HelpRequestCard />
      </ActionAccordionSection>
    </div>
  );
}

function OdometerUploadCard({
  agentName,
  employeeId,
}: {
  agentName: string;
  employeeId: string;
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingReading, setPendingReading] = useState<OdometerReading | null>(null);
  const [readingType, setReadingType] = useState<"START" | "END" | "">("");
  /** The watermarked+compressed File from GpsCamera */
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  /** GPS from GpsCamera (already embedded in photo watermark, also sent to API separately) */
  const [capturedCoords, setCapturedCoords] = useState<{ lat: number; lng: number } | null>(null);

  function handleCapture(file: File, coords: { lat: number; lng: number } | null) {
    setCapturedFile(file);
    setCapturedCoords(coords);
    setError("");
    setMessage("");
  }

  async function submitReading(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!readingType) {
      setError("Select whether this is a start or end reading.");
      return;
    }

    if (!capturedFile) {
      setError("Please take an odometer photo first.");
      return;
    }

    if (capturedFile.size > ODOMETER_UPLOAD_HARD_LIMIT_BYTES) {
      setError(
        `This photo is still ${(capturedFile.size / 1024).toFixed(0)} KB after compression. Retake it closer to the odometer so the upload stays under the mobile limit.`,
      );
      return;
    }

    setBusy(true);

    // Build FormData — same contract the API already expects
    const formData = new FormData();
    formData.set("type", readingType);
    formData.set("photo", capturedFile, capturedFile.name);
    formData.set("lat", capturedCoords ? String(capturedCoords.lat) : "");
    formData.set("lng", capturedCoords ? String(capturedCoords.lng) : "");

    const response = await fetch("/api/odometer-readings", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    const payload = (await response.json()) as { reading?: OdometerReading };
    // Reset camera state after successful upload
    setCapturedFile(null);
    setCapturedCoords(null);
    setReadingType("");
    setBusy(false);

    if (payload.reading?.status === "AWAITING_CONFIRMATION") {
      setPendingReading(payload.reading);
      setMessage(payload.reading.verificationNote || "OCR finished. Confirm the extracted value before it moves into today's log.");
      return;
    }

    if (payload.reading?.status === "OCR_PENDING") {
      setPendingReading(null);
      setMessage("Upload received. OCR is still processing and will appear in Needs Action soon.");
      startTransition(() => router.refresh());
      return;
    }

    setPendingReading(null);
    setMessage(
      payload.reading?.verificationNote ||
        "AI confidence is low or data was missing. The photo was sent to manager verification and is also visible in your Reading History for cross-check.",
    );
    startTransition(() => router.refresh());
  }

  async function confirmReading() {
    if (!pendingReading) return;
    setBusy(true);
    setError("");

    const response = await fetch(`/api/odometer-readings/${pendingReading.id}/confirm`, { method: "POST" });
    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    setBusy(false);
    setPendingReading(null);
    setMessage("Reading confirmed and moved to Reading History.");
    startTransition(() => router.refresh());
  }

  async function rejectReading() {
    if (!pendingReading) return;
    setBusy(true);
    setError("");

    const response = await fetch(`/api/odometer-readings/${pendingReading.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Agent marked OCR as incorrect." }),
    });
    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    setBusy(false);
    setPendingReading(null);
    setMessage("Reading sent to the manager for manual verification.");
    startTransition(() => router.refresh());
  }

  return (
    <form className="form-grid" onSubmit={submitReading}>
      {/* Step 1: Choose reading type */}
      <div className="field">
        <label htmlFor="reading-type">Reading type</label>
        <select
          id="reading-type"
          name="type"
          value={readingType}
          onChange={(e) => setReadingType(e.target.value as "START" | "END" | "")}
          required
        >
          <option value="" disabled>Select reading type</option>
          <option value="START">Start reading</option>
          <option value="END">End reading</option>
        </select>
      </div>

      {/* Step 2: Smart GPS Camera — forces rear camera, auto-watermarks */}
      <div className="field">
        <label>Odometer Photo</label>
        <GpsCamera
          label="Take Odometer Photo"
          agentName={agentName}
          employeeId={employeeId}
          onCapture={handleCapture}
          compression={{
            maxDimension: 1280,
            minDimension: 900,
            targetMaxBytes: ODOMETER_UPLOAD_TARGET_BYTES,
            initialQuality: 0.64,
            minimumQuality: 0.3,
            qualityStep: 0.07,
          }}
          disabled={busy}
        />
        {capturedFile && (
          <span className="hint">
            ✅ Photo ready: {capturedFile.name} ({(capturedFile.size / 1024).toFixed(0)} KB)
          </span>
        )}
        {!capturedFile && (
          <span className="hint">
            The app will open your rear camera, capture GPS, and watermark the photo automatically.
          </span>
        )}
      </div>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      {/* OCR confirmation box */}
      {pendingReading ? (
        <div className="warning-box">
          Extracted value: <strong>{pendingReading.ocrValue ?? "Not found"}</strong>.
          {pendingReading.verificationNote ? <p>{pendingReading.verificationNote}</p> : null}
          <div className="button-row mt-12">
            <button className="button" type="button" disabled={busy || isRefreshing} onClick={confirmReading}>
              {busy ? "Saving..." : "Yes, confirm"}
            </button>
            <button
              className="button-danger"
              type="button"
              disabled={busy || isRefreshing}
              onClick={rejectReading}
            >
              {busy ? "Saving..." : "No, send for review"}
            </button>
          </div>
        </div>
      ) : null}

      <button className="button" type="submit" disabled={busy || isRefreshing || !capturedFile}>
        {busy ? "Uploading..." : isRefreshing ? "Refreshing..." : "Upload Reading"}
      </button>
    </form>
  );
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

function toStakeholderLines(lead: Lead | null) {
  if (!lead) {
    return "";
  }

  return [
    `${lead.contractorName}, `,
    `${lead.builderName}, `,
    `${lead.supervisorName}, ${lead.supervisorPhone}`,
  ]
    .map((entry) => entry.trim())
    .join("\n");
}

function HelpRequestCard() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/help-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    setBusy(false);
    setFeedback("Correction request submitted.");
    form.reset();
    startTransition(() => router.refresh());
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="three-grid">
        <div className="field">
          <label htmlFor="sessionDate">Date</label>
          <input id="sessionDate" name="sessionDate" type="date" required />
        </div>
        <div className="field">
          <label htmlFor="requestedField">Requested field</label>
          <select id="requestedField" name="requestedField" defaultValue="END_READING">
            <option value="OFFICE_IN_TIME">Office in time</option>
            <option value="START_READING">Start reading</option>
            <option value="END_READING">End reading</option>
            <option value="SITE_VISIT_END_TIME">Site visit end time</option>
            <option value="OFFICE_OUT_TIME">Office out time</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="explanation">Explanation</label>
        <textarea id="explanation" name="explanation" required />
      </div>
      {feedback ? <div className="success-box">{feedback}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
      <button className="button-ghost" type="submit" disabled={busy || isRefreshing}>
        {busy ? "Submitting..." : isRefreshing ? "Refreshing..." : "Raise request"}
      </button>
    </form>
  );
}
