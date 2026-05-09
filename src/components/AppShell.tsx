import type { ReactNode } from "react";
import { toIndiaTimeLabel } from "@/lib/date";
import { isLoginDisabled } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import { DashboardAutoRefresh } from "@/components/DashboardAutoRefresh";
import { LogoutButton } from "@/components/LogoutButton";
import { readDatabase } from "@/lib/db";
import type { User } from "@/lib/types";

const DASHBOARD_REFRESH_INTERVAL_MS: Record<User["role"], number> = {
  SALES_AGENT: 30000,
  MANAGER: 15000,
  ACCOUNTING: 15000,
  BATCHER: 15000,
  MIX_DESIGN: 20000,
  PRODUCTION_MANAGER: 15000,
};

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
  const refreshIntervalMs = autoRefreshIntervalMs ?? DASHBOARD_REFRESH_INTERVAL_MS[user.role];
  const switchUsers = loginDisabled
    ? (await readDatabase()).users
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
          {refreshIntervalMs > 0 ? <DashboardAutoRefresh intervalMs={refreshIntervalMs} /> : null}
          {loginDisabled ? <span className="status-badge status-manager_view">Login disabled for testing</span> : null}
        </div>
      </section>
      {children}
    </main>
  );
}
