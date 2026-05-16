"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toIndiaTimeLabel } from "@/lib/date";
import type { ReimbursementClaim, ReimbursementSummary } from "@/lib/types";

function money(value: number | null | undefined) {
  return `₹${Math.round(value ?? 0).toLocaleString("en-IN")}`;
}

function isEligibleSummary(summary: ReimbursementSummary) {
  return (
    !summary.claimId &&
    summary.totalAmount !== null &&
    (summary.status === "CONFIRMED" || summary.status === "MANUAL_VERIFIED")
  );
}

function isActiveClaim(claim: ReimbursementClaim) {
  return claim.status !== "PAID" && claim.status !== "PAYMENT_REJECTED" && claim.status !== "REJECTED";
}

function claimLabel(claim: ReimbursementClaim) {
  if (claim.status === "OTP_SENT") {
    return `OTP sent at ${toIndiaTimeLabel(claim.otpSentAt)}`;
  }

  if (claim.status === "AGENT_RECEIPT_CONFIRMED") {
    return "Receipt confirmed. Accounts will close payment.";
  }

  if (claim.status === "PARTIAL_PAYMENT" || claim.status === "BALANCE_OUTSTANDING") {
    return `Partial payment. Balance ${money(claim.outstandingAmount ?? claim.balanceAmount ?? 0)}.`;
  }

  return claim.status.replaceAll("_", " ").toLowerCase();
}

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

export function AgentReimbursementClaims({
  claims,
  summaries,
}: {
  claims: ReimbursementClaim[];
  summaries: ReimbursementSummary[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, startTransition] = useTransition();
  const activeClaim = claims.find(isActiveClaim) ?? null;
  const otpClaim = claims.find((claim) => claim.status === "OTP_SENT" && claim.otpCode) ?? null;
  const eligibleSummaries = summaries.filter(isEligibleSummary);
  const eligibleAmount = eligibleSummaries.reduce((sum, summary) => sum + (summary.totalAmount ?? 0), 0);
  const lastPaidClaim = claims.find((claim) => claim.status === "PAID") ?? null;

  async function requestClaim() {
    setMessage("");
    setError("");
    const response = await fetch("/api/reimbursement-claims", { method: "POST" });

    if (!response.ok) {
      setError(await parseApiError(response));
      return;
    }

    setMessage("Claim requested. Manager verification is required before Accounts payment.");
    startTransition(() => router.refresh());
  }

  return (
    <section className="agent-claim-panel">
      <div className="panel-header">
        <div>
          <h4>Payment Claim</h4>
          <p className="panel-copy">Claim verified unpaid reimbursement days for accounting review.</p>
        </div>
        <button className="button" type="button" disabled={isRefreshing || Boolean(activeClaim) || !eligibleSummaries.length} onClick={requestClaim}>
          Request Claim
        </button>
      </div>

      {otpClaim ? (
        <div className="otp-agent-notice">
          <div>
            <span className="summary-label">Accounting OTP</span>
            <strong>{otpClaim.otpCode}</strong>
          </div>
          <p>Share this OTP with accounting after receiving voucher payment for {money(otpClaim.cashVoucherAmount ?? otpClaim.totalAmount)}.</p>
        </div>
      ) : null}

      <div className="three-grid">
        <div className="summary-cell">
          <span className="summary-label">Claimable amount</span>
          <strong>{money(eligibleAmount)}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Claimable days</span>
          <strong>{eligibleSummaries.length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Last paid through</span>
          <strong>{lastPaidClaim?.periodEnd ?? "No payout yet"}</strong>
        </div>
      </div>

      {activeClaim ? (
        <div className="note-box">
          Active claim {activeClaim.periodStart} to {activeClaim.periodEnd}, {money(activeClaim.totalAmount)}. Status:{" "}
          {claimLabel(activeClaim)}.
        </div>
      ) : null}
      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
    </section>
  );
}
