import type { ReactNode } from "react";
import { toIndiaTimeLabel } from "@/lib/date";
import { isLoginDisabled } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import { DashboardSyncControls } from "@/components/DashboardSyncControls";
import { LogoutButton } from "@/components/LogoutButton";
import { readCollection } from "@/lib/db";
import type { User } from "@/lib/types";

const DASHBOARD_REFRESH_INTERVAL_MS: Record<User["role"], number> = {
  SALES_AGENT: 300000,
  MANAGER: 300000,
  ACCOUNTING: 300000,
  BATCHER: 300000,
  MIX_DESIGN: 300000,
  PRODUCTION_MANAGER: 300000,
};

function getRefreshIntervalMs(role: User["role"]) {
  const configured = Number(process.env.DASHBOARD_AUTO_REFRESH_MS ?? "");

  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }

  return DASHBOARD_REFRESH_INTERVAL_MS[role];
}

interface AppShellProps {
  user: User;
  title: string;
  subtitle: string;
  statusLabel?: string;
  compact?: boolean;
  autoRefreshIntervalMs?: number;
  children: ReactNode;
}

export async function AppShell({
  user,
  title,
  subtitle,
  statusLabel,
  compact = false,
  autoRefreshIntervalMs,
  children,
}: AppShellProps) {
  const loginDisabled = isLoginDisabled();
  const refreshIntervalMs = autoRefreshIntervalMs ?? getRefreshIntervalMs(user.role);
  const switchUsers = loginDisabled
    ? (await readCollection("users"))
        .filter((entry) => entry.status === "ACTIVE")
        .map((entry) => ({
          id: entry.id,
          employeeId: entry.employeeId,
          name: entry.name,
          role: entry.role,
        }))
    : [];
  const currentUser = {
    id: user.id,
    employeeId: user.employeeId,
    name: user.name,
    role: user.role,
  };

  return (
    <main className="page-shell">
      <section className={compact ? "hero hero-compact" : "hero"}>
        <div className="panel-header">
          <div>
            <p className="metric-label">{user.role.replaceAll("_", " ")}</p>
            <h1>{title}</h1>
            <p className="panel-copy">{subtitle}</p>
          </div>
          <div className="button-row">
            {statusLabel ? <StatusBadge value={statusLabel} /> : null}
            {loginDisabled ? <DashboardSwitcher currentUser={currentUser} users={switchUsers} /> : <LogoutButton />}
          </div>
        </div>
        <div className="hero-actions">
          <span className="status-badge status-open-good">{user.name}</span>
          <span className="status-badge status-talks">Employee ID {user.employeeId}</span>
          <span className="status-badge status-awaiting_confirmation">{toIndiaTimeLabel(new Date().toISOString())}</span>
          <DashboardSyncControls autoRefreshIntervalMs={refreshIntervalMs} />
          {loginDisabled ? <span className="status-badge status-manager_view">Login disabled for testing</span> : null}
        </div>
      </section>
      {children}
    </main>
  );
}
