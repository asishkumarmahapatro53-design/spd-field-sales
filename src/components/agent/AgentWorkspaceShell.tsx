import type { ReactNode } from "react";
import { DashboardSyncControls } from "@/components/DashboardSyncControls";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusBadge } from "@/components/StatusBadge";
import { AiAssistant } from "@/components/agent/AiAssistant";
import { AgentSidebar, type AgentNavKey } from "@/components/agent/AgentSidebar";
import { isLoginDisabled } from "@/lib/auth";
import { toIndiaTimeLabel } from "@/lib/date";
import { readCollection } from "@/lib/db";
import type { User, WorkdaySession } from "@/lib/types";

const DEFAULT_AGENT_REFRESH_INTERVAL_MS = 300000;

function getAgentRefreshIntervalMs() {
  const configured = Number(process.env.DASHBOARD_AUTO_REFRESH_MS ?? "");

  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }

  return DEFAULT_AGENT_REFRESH_INTERVAL_MS;
}

interface AgentWorkspaceShellProps {
  user: User;
  activeSession: WorkdaySession | null;
  current: AgentNavKey;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export async function AgentWorkspaceShell({
  user,
  activeSession,
  current,
  title,
  subtitle,
  children,
}: AgentWorkspaceShellProps) {
  const loginDisabled = isLoginDisabled();
  const refreshIntervalMs = getAgentRefreshIntervalMs();
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
    <main className="agent-command-shell">
      <header className="agent-command-topbar">
        <div className="agent-command-brand">
          <span className="agent-command-logo" aria-hidden="true">
            SPD
          </span>
          <strong>SPD Command Center</strong>
        </div>
        <div className="agent-command-top-actions">
          <DashboardSyncControls autoRefreshIntervalMs={refreshIntervalMs} compact />
          <div className="agent-command-user">
            <strong>{user.name}</strong>
            <span>Sales Agent</span>
          </div>
          {loginDisabled ? <DashboardSwitcher currentUser={currentUser} users={switchUsers} /> : null}
        </div>
      </header>

      <div className="agent-command-layout">
        <AgentSidebar current={current} />
        <section className="agent-command-main">
          <div className="agent-command-heading">
            <div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="agent-command-status-card">
              <span>Status</span>
              <StatusBadge value={activeSession ? "WORKDAY_OPEN" : "READY"} />
              <small>{activeSession ? `Office in ${toIndiaTimeLabel(activeSession.loginAt)}` : "Workday not started"}</small>
              {loginDisabled ? null : <LogoutButton />}
            </div>
          </div>
          {children}
        </section>
      </div>
      <AiAssistant agentId={user.id} />
    </main>
  );
}
