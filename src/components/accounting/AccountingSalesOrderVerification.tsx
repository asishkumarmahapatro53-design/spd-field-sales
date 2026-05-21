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

  async function createLedger(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusyId(id);
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    formData.set("status", "FINANCE_VERIFIED");
    formData.set("note", `${formData.get("accountantRemarks") ?? ""}`);

    const response = await fetch(`/api/sales-order-requests/${id}/finance-review`, {
      method: "PATCH",
      body: formData,
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    refreshWithMessage("Customer ledger created. Request moved to Create Sales Order section.");
  }

  async function rejectLedger(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusyId(id);
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);

    const response = await fetch(`/api/sales-order-requests/${id}/finance-review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "FINANCE_REJECTED",
        financeRejectionReason: formData.get("financeRejectionReason"),
        note: formData.get("financeRejectionNote"),
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    refreshWithMessage("Ledger request rejected and sent back for correction.");
  }

  async function requestPoPdcException(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusyId(id);
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/sales-order-requests/${id}/po-pdc-exception`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "REQUEST",
        reason: formData.get("exceptionReason"),
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    refreshWithMessage("PO/PDC exception sent to manager.");
  }

  async function createSalesOrder(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusyId(id);
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);

    const checklistResponse = await fetch(`/api/sales-order-requests/${id}/final-checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradeConfirmed: formData.get("gradeConfirmed") === "on",
        quantityConfirmed: formData.get("quantityConfirmed") === "on",
        rateConfirmed: formData.get("rateConfirmed") === "on",
        paymentTermsConfirmed: formData.get("paymentTermsConfirmed") === "on",
        requiredDateTimeConfirmed: formData.get("requiredDateTimeConfirmed") === "on",
        castingTypeConfirmed: formData.get("castingTypeConfirmed") === "on",
        pumpDumpRequirementConfirmed: formData.get("pumpDumpRequirementConfirmed") === "on",
        receiverConfirmed: formData.get("receiverConfirmed") === "on",
        phoneConfirmed: formData.get("phoneConfirmed") === "on",
        deliveryAddressConfirmed: formData.get("deliveryAddressConfirmed") === "on",
        plantConfirmed: formData.get("plantConfirmed") === "on",
        taxChallanModeConfirmed: formData.get("taxChallanModeConfirmed") === "on",
        accountantRemarks: formData.get("salesOrderRemarks"),
      }),
    });

    if (!checklistResponse.ok) {
      setError(await parseApiError(checklistResponse));
      setBusyId("");
      return;
    }

    const previewResponse = await fetch(`/api/sales-order-requests/${id}/preview-confirmation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });

    if (!previewResponse.ok) {
      setError(await parseApiError(previewResponse));
      setBusyId("");
      return;
    }

    const response = await fetch(`/api/sales-order-requests/${id}/create-sales-order`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: formData.get("salesOrderRemarks"),
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
                <span>PO/PDC exception {request.poPdcExceptionStatus?.replaceAll("_", " ").toLowerCase() ?? "not required"}</span>
              </div>
              <LedgerDetails request={request} />
              <div className="button-row">
                <DocumentLinks request={request} />
                {(request.poPdcExceptionStatus === "REQUIRED" || request.poPdcExceptionStatus === "REJECTED") ? (
                  <form className="otp-inline-form" onSubmit={(event) => void requestPoPdcException(event, request.id)}>
                    <input name="exceptionReason" placeholder="Reason for missing PO/PDC" required />
                    <button className="button-secondary" type="submit" disabled={busyId === request.id || isRefreshing}>
                      Request manager exception
                    </button>
                  </form>
                ) : null}
                <form className="form-grid" onSubmit={(event) => void createLedger(event, request.id)}>
                  <div className="three-grid">
                    <label className="row-meta"><input name="gstChecked" type="checkbox" required defaultChecked /> GST checked</label>
                    <label className="row-meta"><input name="gstCertificateChecked" type="checkbox" required defaultChecked /> GST certificate checked</label>
                    <label className="row-meta"><input name="legalNameChecked" type="checkbox" required defaultChecked /> Legal name checked</label>
                    <label className="row-meta"><input name="billingAddressChecked" type="checkbox" required defaultChecked /> Billing address checked</label>
                    <label className="row-meta"><input name="poChecked" type="checkbox" required defaultChecked /> PO checked</label>
                    <label className="row-meta"><input name="pdcChecked" type="checkbox" required defaultChecked /> PDC checked</label>
                    <label className="row-meta"><input name="paymentProofChecked" type="checkbox" required defaultChecked /> Payment proof checked</label>
                    <label className="row-meta"><input name="amountReceivedChecked" type="checkbox" required defaultChecked /> Amount received checked</label>
                    <label className="row-meta"><input name="outstandingChecked" type="checkbox" required defaultChecked /> Outstanding checked</label>
                    <label className="row-meta"><input name="overdueChecked" type="checkbox" required defaultChecked /> Overdue checked</label>
                    <label className="row-meta"><input name="creditLimitChecked" type="checkbox" required defaultChecked /> Credit limit checked</label>
                  </div>
                  <div className="three-grid">
                    <div className="field">
                      <label htmlFor={`ledger-decision-${request.id}`}>Ledger decision</label>
                      <select id={`ledger-decision-${request.id}`} name="ledgerDecisionStatus" defaultValue={request.gstin ? "GST_CLIENT_ODOO_LEDGER" : "NON_GST_INTERNAL_LEDGER"}>
                        <option value="GST_CLIENT_ODOO_LEDGER">GST client - Odoo ledger</option>
                        <option value="NON_GST_INTERNAL_LEDGER">Non-GST - internal ledger</option>
                        <option value="LINK_EXISTING_LEDGER">Link existing ledger</option>
                        <option value="CREATE_NEW_SITE">Create new site</option>
                        <option value="CREATE_NEW_LEDGER">Create new ledger</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`linked-ledger-${request.id}`}>Linked ledger/customer</label>
                      <input id={`linked-ledger-${request.id}`} name="linkedLedgerCustomerName" placeholder="Existing ledger name if linked" />
                    </div>
                    <div className="field">
                      <label htmlFor={`credit-risk-${request.id}`}>Risk category</label>
                      <select id={`credit-risk-${request.id}`} name="creditRiskCategory" defaultValue="LOW">
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="BLOCKED">Blocked</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`credit-limit-${request.id}`}>Credit limit</label>
                      <input id={`credit-limit-${request.id}`} name="creditLimitAmount" type="number" min="0" defaultValue={request.paymentType === "CREDIT" ? request.amount : 0} />
                    </div>
                    <div className="field">
                      <label htmlFor={`credit-period-${request.id}`}>Credit period days</label>
                      <input id={`credit-period-${request.id}`} name="creditPeriodDays" type="number" min="0" defaultValue={request.paymentType === "CREDIT" ? 30 : 0} />
                    </div>
                    <div className="field">
                      <label htmlFor={`amount-received-${request.id}`}>Amount received</label>
                      <input id={`amount-received-${request.id}`} name="amountReceived" type="number" min="0" defaultValue={request.paymentReceivedConfirmed ? request.amount : 0} />
                    </div>
                    <div className="field">
                      <label htmlFor={`payment-mode-${request.id}`}>Payment mode</label>
                      <select id={`payment-mode-${request.id}`} name="paymentMode" defaultValue="CASH">
                        <option value="CASH">Cash</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="NEFT">NEFT</option>
                        <option value="UPI">UPI</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`cash-voucher-${request.id}`}>Cash voucher no.</label>
                      <input id={`cash-voucher-${request.id}`} name="cashVoucherNumber" placeholder="Required for cash" defaultValue={request.paymentReceivedConfirmed ? `ADV-${request.id.slice(0, 6)}` : ""} />
                    </div>
                    <div className="field">
                      <label htmlFor={`utr-${request.id}`}>UTR / bank ref</label>
                      <input id={`utr-${request.id}`} name="utrNumber" placeholder="UTR if NEFT/UPI/bank" />
                    </div>
                    <div className="field">
                      <label htmlFor={`cheque-${request.id}`}>Cheque no.</label>
                      <input id={`cheque-${request.id}`} name="chequeNumber" placeholder="Cheque number" />
                    </div>
                    <div className="field">
                      <label htmlFor={`payment-date-${request.id}`}>Payment date</label>
                      <input id={`payment-date-${request.id}`} name="paymentDate" type="date" />
                    </div>
                    <div className="field">
                      <label htmlFor={`payment-proof-${request.id}`}>Payment proof upload</label>
                      <input id={`payment-proof-${request.id}`} name="paymentProof" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" />
                    </div>
                    <div className="field">
                      <label htmlFor={`bank-account-${request.id}`}>Bank/cash account</label>
                      <input id={`bank-account-${request.id}`} name="bankCashAccount" placeholder="Cash / bank account" defaultValue="Cash account" required />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`remarks-${request.id}`}>Accountant remarks</label>
                    <textarea id={`remarks-${request.id}`} name="accountantRemarks" required defaultValue="Accounts verified GST, ledger, payment, PO/PDC, outstanding, overdue, and credit limit checklist." />
                  </div>
                  <button className="button" type="submit" disabled={busyId === request.id || isRefreshing}>
                    {busyId === request.id ? "Saving..." : "Create ledger"}
                  </button>
                </form>
                <form className="form-grid" onSubmit={(event) => void rejectLedger(event, request.id)}>
                  <div className="three-grid">
                    <div className="field">
                      <label htmlFor={`finance-reason-${request.id}`}>Rejection reason</label>
                      <select id={`finance-reason-${request.id}`} name="financeRejectionReason" defaultValue="INCOMPLETE_DETAILS" required>
                        <option value="PO_MISSING">PO missing</option>
                        <option value="GST_INVALID">GST invalid</option>
                        <option value="CREDIT_EXCEEDED">Credit exceeded</option>
                        <option value="PAYMENT_NOT_RECEIVED">Payment not received</option>
                        <option value="DUPLICATE_REQUEST">Duplicate request</option>
                        <option value="INCOMPLETE_DETAILS">Incomplete details</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`finance-note-${request.id}`}>Finance note</label>
                      <input
                        id={`finance-note-${request.id}`}
                        name="financeRejectionNote"
                        required
                        defaultValue="Accounts rejected the ledger request due to missing or invalid documents."
                      />
                    </div>
                  </div>
                  <button className="button-danger" type="submit" disabled={busyId === request.id || isRefreshing}>
                    {busyId === request.id ? "Saving..." : "Reject"}
                  </button>
                </form>
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
                <form className="form-grid" onSubmit={(event) => void createSalesOrder(event, request.id)}>
                  <div className="three-grid">
                    <label className="row-meta"><input name="gradeConfirmed" type="checkbox" required defaultChecked /> Grade confirmed</label>
                    <label className="row-meta"><input name="quantityConfirmed" type="checkbox" required defaultChecked /> Quantity confirmed</label>
                    <label className="row-meta"><input name="rateConfirmed" type="checkbox" required defaultChecked /> Rate confirmed</label>
                    <label className="row-meta"><input name="paymentTermsConfirmed" type="checkbox" required defaultChecked /> Payment terms confirmed</label>
                    <label className="row-meta"><input name="requiredDateTimeConfirmed" type="checkbox" required defaultChecked /> Required date/time confirmed</label>
                    <label className="row-meta"><input name="castingTypeConfirmed" type="checkbox" required defaultChecked /> Casting type confirmed</label>
                    <label className="row-meta"><input name="pumpDumpRequirementConfirmed" type="checkbox" required defaultChecked /> Pump/dump confirmed</label>
                    <label className="row-meta"><input name="receiverConfirmed" type="checkbox" required defaultChecked /> Receiver confirmed</label>
                    <label className="row-meta"><input name="phoneConfirmed" type="checkbox" required defaultChecked /> Phone confirmed</label>
                    <label className="row-meta"><input name="deliveryAddressConfirmed" type="checkbox" required defaultChecked /> Address confirmed</label>
                    <label className="row-meta"><input name="plantConfirmed" type="checkbox" required defaultChecked /> Plant confirmed</label>
                    <label className="row-meta"><input name="taxChallanModeConfirmed" type="checkbox" required defaultChecked /> Tax/challan mode confirmed</label>
                  </div>
                  <div className="note-box">
                    Preview: {request.grade} | {request.quantity} CUM | {money(request.amount)} | {request.receiverName} | {request.siteAddress}
                  </div>
                  <div className="field">
                    <label htmlFor={`sales-order-remarks-${request.id}`}>Accountant remarks</label>
                    <textarea id={`sales-order-remarks-${request.id}`} name="salesOrderRemarks" required defaultValue="Final sales order checklist and preview confirmed by Accounts." />
                  </div>
                  <button className="button" type="submit" disabled={busyId === request.id || isRefreshing}>
                    {busyId === request.id ? "Creating..." : "Confirm preview & create sales order"}
                  </button>
                </form>
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
              <div className="row-meta">
                <span>Remaining {request.remainingQuantity} CUM</span>
                <span>Challan status: pending/production</span>
                <span>Invoice/e-invoice: {request.odooSalesOrderSyncStatus?.replaceAll("_", " ").toLowerCase() ?? "not required"}</span>
                <span>E-way bill: status pending</span>
                <span>Ledger debit: after site acceptance</span>
                <span>Payment received: {request.paymentReceivedConfirmed ? "yes" : "no"}</span>
              </div>
              {request.salesOrderCopyUrl ? (
                <a className="button-ghost" href={request.salesOrderCopyUrl} target="_blank" rel="noreferrer">
                  Download sales order copy
                </a>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
