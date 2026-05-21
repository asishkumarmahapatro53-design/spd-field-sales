import { readCollection, readCollectionByFieldValues } from "@/lib/db";
import { toDateKey } from "@/lib/date";
import type { User } from "@/lib/types";

export type NotificationTone = "good" | "warning" | "danger" | "neutral";

export interface NotificationSection {
  id: string;
  label: string;
  detail: string;
  count: number;
  href: string;
  tone: NotificationTone;
}

export interface NotificationSummary {
  userId: string;
  role: User["role"];
  total: number;
  generatedAt: string;
  sections: NotificationSection[];
}

function recentDateKey(daysBack: number) {
  return toDateKey(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString());
}

function section(input: NotificationSection): NotificationSection | null {
  return input.count > 0 ? input : null;
}

function buildSummary(user: User, sections: Array<NotificationSection | null>): NotificationSummary {
  const visibleSections = sections.filter(Boolean) as NotificationSection[];

  return {
    userId: user.id,
    role: user.role,
    total: visibleSections.reduce((sum, item) => sum + item.count, 0),
    generatedAt: new Date().toISOString(),
    sections: visibleSections,
  };
}

async function getSalesAgentNotifications(user: User) {
  const sessionCutoff = recentDateKey(7);
  const [sessions, approvals, informalQuotations, salesOrders, tasks, helpRequests] = await Promise.all([
    readCollection("workdaySessions", { filters: [{ field: "userId", op: "==", value: user.id }] }),
    readCollection("approvalRequests", { filters: [{ field: "createdBy", op: "==", value: user.id }] }),
    readCollection("informalQuotationRequests", { filters: [{ field: "createdBy", op: "==", value: user.id }] }),
    readCollection("salesOrderRequests", { filters: [{ field: "createdBy", op: "==", value: user.id }] }),
    readCollection("tasks", { filters: [{ field: "assignedTo", op: "==", value: user.id }] }),
    readCollection("helpRequests", { filters: [{ field: "agentId", op: "==", value: user.id }] }),
  ]);
  const recentSessionIds = sessions.filter((entry) => entry.date >= sessionCutoff).map((entry) => entry.id);
  const readings = await readCollectionByFieldValues("odometerReadings", "sessionId", recentSessionIds);

  return buildSummary(user, [
    section({
      id: "agent-readings",
      label: "Odometer confirmations",
      detail: "Recent readings need agent confirmation.",
      count: readings.filter((entry) => entry.status === "AWAITING_CONFIRMATION").length,
      href: "/agent/odometer",
      tone: "warning",
    }),
    section({
      id: "agent-approvals",
      label: "Final approval requests",
      detail: "Commercial approvals still pending with manager.",
      count: approvals.filter((entry) => entry.status === "PENDING").length,
      href: "/agent/approval",
      tone: "warning",
    }),
    section({
      id: "agent-quotations",
      label: "Informal quotations",
      detail: "Quotation requests waiting for manager approval.",
      count: informalQuotations.filter((entry) => entry.status === "PENDING").length,
      href: "/agent/informal-quotation",
      tone: "warning",
    }),
    section({
      id: "agent-sales-orders",
      label: "Sales order actions",
      detail: "Finance or scheduling status needs attention.",
      count: salesOrders.filter((entry) => entry.status === "PENDING_FINANCE" || entry.status === "FINANCE_REJECTED" || entry.status === "SCHEDULE_REJECTED").length,
      href: "/agent/sales-order",
      tone: "danger",
    }),
    section({
      id: "agent-tasks",
      label: "Open work queue",
      detail: "Manager-assigned tasks are still open.",
      count: tasks.filter((entry) => entry.status === "OPEN").length,
      href: "/agent/help",
      tone: "neutral",
    }),
    section({
      id: "agent-help",
      label: "Correction requests",
      detail: "Submitted help requests are still open.",
      count: helpRequests.filter((entry) => entry.status === "OPEN").length,
      href: "/agent/help",
      tone: "neutral",
    }),
  ]);
}

async function getManagerNotifications(user: User) {
  const plantId = user.homePlantId;
  const [approvals, informalQuotations, scopedSessions, salesOrders, helpRequests, leads] = await Promise.all([
    readCollection("approvalRequests"),
    readCollection("informalQuotationRequests"),
    plantId ? readCollection("workdaySessions", { filters: [{ field: "plantId", op: "==", value: plantId }] }) : Promise.resolve([]),
    readCollection("salesOrderRequests"),
    readCollection("helpRequests"),
    readCollection("leads"),
  ]);
  const readings = plantId
    ? await readCollectionByFieldValues(
        "odometerReadings",
        "sessionId",
        scopedSessions.map((entry) => entry.id),
      )
    : await readCollection("odometerReadings", { filters: [{ field: "status", op: "==", value: "MANUAL_REVIEW_REQUIRED" }] });
  const inScope = <T extends { plantId?: string | null }>(items: T[]) =>
    plantId ? items.filter((entry) => entry.plantId === plantId) : items;

  return buildSummary(user, [
    section({
      id: "manager-approvals",
      label: "Price approvals",
      detail: "Final approval requests are waiting for decision.",
      count: inScope(approvals).filter((entry) => entry.status === "PENDING").length,
      href: "/manager/approvals",
      tone: "danger",
    }),
    section({
      id: "manager-informal-quotations",
      label: "Informal quotations",
      detail: "Quotation documents need manager approval.",
      count: inScope(informalQuotations).filter((entry) => entry.status === "PENDING").length,
      href: "/manager/approvals",
      tone: "warning",
    }),
    section({
      id: "manager-lead-closures",
      label: "Dead/lost requests",
      detail: "Lead closure requests need manager approval.",
      count: inScope(leads).filter((entry) => entry.closureStatus === "PENDING_MANAGER_APPROVAL").length,
      href: "/manager/approvals",
      tone: "warning",
    }),
    section({
      id: "manager-verifications",
      label: "Manual verifications",
      detail: "Odometer readings need manager correction.",
      count: readings.filter((entry) => entry.status === "MANUAL_REVIEW_REQUIRED").length,
      href: "/manager/verifications",
      tone: "warning",
    }),
    section({
      id: "manager-schedules",
      label: "Schedule decisions",
      detail: "Sales orders are waiting for schedule approval.",
      count: inScope(salesOrders).filter((entry) => entry.status === "SCHEDULE_PENDING").length,
      href: "/manager/orders",
      tone: "neutral",
    }),
    section({
      id: "manager-help",
      label: "Agent corrections",
      detail: "Help requests are waiting for resolution.",
      count: inScope(helpRequests).filter((entry) => entry.status === "OPEN").length,
      href: "/manager/corrections",
      tone: "neutral",
    }),
  ]);
}

async function getAccountingNotifications(user: User) {
  const [claims, salesOrders] = await Promise.all([
    readCollection("reimbursementClaims"),
    readCollection("salesOrderRequests"),
  ]);

  return buildSummary(user, [
    section({
      id: "accounts-ledger",
      label: "Pending reimbursements",
      detail: "Claims need OTP or payment confirmation.",
      count: claims.filter((entry) => entry.status !== "PAID" && entry.status !== "PAYMENT_REJECTED" && entry.status !== "REJECTED").length,
      href: "/accounting",
      tone: "warning",
    }),
    section({
      id: "accounts-finance",
      label: "Finance verification",
      detail: "Sales orders are waiting for accounts review.",
      count: salesOrders.filter((entry) => entry.status === "PENDING_FINANCE" || entry.gstVerificationStatus === "PENDING_ACCOUNTS").length,
      href: "/accounting",
      tone: "danger",
    }),
  ]);
}

async function getBatcherNotifications(user: User) {
  const plantId = user.homePlantId;
  const [salesOrders, dispatchRecords] = await Promise.all([
    plantId ? readCollection("salesOrderRequests", { filters: [{ field: "plantId", op: "==", value: plantId }] }) : Promise.resolve([]),
    plantId ? readCollection("dispatchRecords", { filters: [{ field: "plantId", op: "==", value: plantId }] }) : Promise.resolve([]),
  ]);

  return buildSummary(user, [
    section({
      id: "batcher-ready-orders",
      label: "Ready for dispatch",
      detail: "Plant-approved orders can be loaded.",
      count: salesOrders.filter((entry) => entry.status === "SCHEDULE_APPROVED" && entry.remainingQuantity > 0).length,
      href: "/batcher",
      tone: "warning",
    }),
    section({
      id: "batcher-open-dispatch",
      label: "Open dispatches",
      detail: "Trucks are dispatched and waiting for site status.",
      count: dispatchRecords.filter((entry) => entry.status === "DISPATCHED").length,
      href: "/batcher",
      tone: "neutral",
    }),
  ]);
}

async function getMixDesignNotifications(user: User) {
  const orders = await readCollection("salesOrderRequests", { limit: 400 });

  return buildSummary(user, [
    section({
      id: "mix-design-pending",
      label: "Mix design queue",
      detail: "Finance-verified orders still need linked mix design.",
      count: orders.filter((entry) => entry.status === "FINANCE_VERIFIED" && !entry.mixDesignId).length,
      href: "/mix-design",
      tone: "warning",
    }),
  ]);
}

export async function getNotificationSummary(user: User): Promise<NotificationSummary> {
  if (user.role === "SALES_AGENT") {
    return getSalesAgentNotifications(user);
  }

  if (user.role === "MANAGER" || user.role === "PRODUCTION_MANAGER") {
    return getManagerNotifications(user);
  }

  if (user.role === "ACCOUNTING") {
    return getAccountingNotifications(user);
  }

  if (user.role === "BATCHER") {
    return getBatcherNotifications(user);
  }

  return getMixDesignNotifications(user);
}
