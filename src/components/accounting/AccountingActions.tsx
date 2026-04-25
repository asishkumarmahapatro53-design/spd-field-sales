"use client";

import { useState } from "react";
import type { User } from "@/lib/types";

export function AccountingActions({ agents }: { agents: User[] }) {
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    setMessage("Task assigned.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <div className="panel-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Export Reimbursements</h2>
            <p className="panel-copy">Download the reimbursement ledger for payout processing outside the app.</p>
          </div>
        </div>
        <div className="button-row">
          <a className="button" href="/api/accounting/reimbursements/export?format=csv">
            Download CSV
          </a>
          <a className="button-secondary" href="/api/accounting/reimbursements/export?format=xlsx">
            Download XLSX
          </a>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Assign Follow-up Task</h2>
            <p className="panel-copy">Accounting can assign tasks that show up in the agent dashboard.</p>
          </div>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="assignedTo">Assign to</label>
            <select id="assignedTo" name="assignedTo" defaultValue="" required>
              <option value="" disabled>
                Select agent
              </option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="subject">Subject</label>
            <input id="subject" name="subject" required />
          </div>
          <div className="field">
            <label htmlFor="explanation">Explanation</label>
            <textarea id="explanation" name="explanation" required />
          </div>
          <div className="field">
            <label htmlFor="deadline">Deadline</label>
            <input id="deadline" name="deadline" type="datetime-local" required />
          </div>
          {message ? <div className="success-box">{message}</div> : null}
          <button className="button-ghost" type="submit">
            Assign task
          </button>
        </form>
      </section>
    </div>
  );
}
