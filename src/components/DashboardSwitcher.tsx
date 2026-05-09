"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/types";

type SwitchUser = {
  id: string;
  employeeId: string;
  name: string;
  role: UserRole;
};

const STAFF_OPTIONS: Array<{ role: UserRole; label: string; path: string }> = [
  { role: "MANAGER", label: "Manager", path: "/manager" },
  { role: "ACCOUNTING", label: "Accounting", path: "/accounting" },
  { role: "PRODUCTION_MANAGER", label: "Production", path: "/production" },
  { role: "BATCHER", label: "Batcher", path: "/batcher" },
  { role: "MIX_DESIGN", label: "Mix Design", path: "/mix-design" },
];

export function DashboardSwitcher({ currentUser, users }: { currentUser: SwitchUser; users: SwitchUser[] }) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const salesAgents = users.filter((user) => user.role === "SALES_AGENT");

  async function handleSwitch(role: UserRole, path: string, userId?: string) {
    setError("");

    const response = await fetch("/api/auth/switch-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, userId }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Dashboard switch failed." }));
      setError(payload.error ?? "Dashboard switch failed.");
      return;
    }

    if (detailsRef.current) {
      detailsRef.current.open = false;
    }

    startTransition(() => {
      router.push(path);
      router.refresh();
    });
  }

  return (
    <details ref={detailsRef} className="dashboard-switcher">
      <summary className="button-ghost dashboard-switcher-trigger">
        {isPending ? "Switching..." : `Switch: ${currentUser.role === "SALES_AGENT" ? currentUser.name : currentUser.role.replaceAll("_", " ")}`}
      </summary>
      <div className="dashboard-switcher-menu">
        <div className="dashboard-switcher-group-label">Sales agents</div>
        {salesAgents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={agent.id === currentUser.id ? "dashboard-switcher-option is-active" : "dashboard-switcher-option"}
            disabled={isPending}
            onClick={() => void handleSwitch("SALES_AGENT", "/agent", agent.id)}
          >
            <span>{agent.name}</span>
            <small>{agent.employeeId}</small>
          </button>
        ))}
        <div className="dashboard-switcher-group-label">Staff dashboards</div>
        {STAFF_OPTIONS.map((option) => {
          const user = users.find((entry) => entry.role === option.role);

          return (
            <button
              key={option.role}
              type="button"
              className={option.role === currentUser.role ? "dashboard-switcher-option is-active" : "dashboard-switcher-option"}
              disabled={isPending}
              onClick={() => void handleSwitch(option.role, option.path, user?.id)}
            >
              <span>{option.label}</span>
              {user ? <small>{user.name}</small> : null}
            </button>
          );
        })}
        {error ? <div className="dashboard-switcher-error">{error}</div> : null}
      </div>
    </details>
  );
}
