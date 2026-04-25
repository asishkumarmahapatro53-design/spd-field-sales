# SPD Field Sales Project - Single File Source Export

This file contains the combined project source for app code, configs, schema, and tests.
Excluded: node_modules, .next, logs, uploads, tools, package-lock.json, tsconfig.tsbuildinfo, and .env.local secrets.

## File: .env.example

```
DISABLE_LOGIN="true"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/spd_field_sales"
STORAGE_ROOT="./public/uploads"
SUPABASE_USE_STORAGE="false"
SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_STORAGE_BUCKET=""
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=""
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""
FIREBASE_STORAGE_BUCKET=""
FIREBASE_FIRESTORE_DATABASE_ID=""
FIREBASE_USE_STORAGE="false"
GOOGLE_VISION_ENABLED="false"
GEMINI_API_KEY=""
FIREBASE_APP_STATE_COLLECTION="app_state"
FIREBASE_APP_STATE_DOC="main"
```

## File: .gitignore

```
.next
node_modules
.env
coverage
data/mock-db.json
public/uploads
```

## File: app\accounting\page.tsx

```tsx
import { AccountingActions } from "@/components/accounting/AccountingActions";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { requireUser } from "@/lib/auth";
import { toIndiaTimeLabel } from "@/lib/date";
import { getAccountingDashboardData } from "@/lib/repository";

export default async function AccountingPage() {
  const user = await requireUser("ACCOUNTING");
  const data = await getAccountingDashboardData(user);

  return (
    <AppShell
      user={user}
      title="Accounting Dashboard"
      subtitle="Review reimbursement records, export ledgers, and assign follow-up tasks without handling payout inside the app."
      statusLabel="ACCOUNTING_VIEW"
    >
      <section className="metric-grid mt-24">
        <MetricCard label="Ledger rows" value={data.reimbursements.length} note="Daily summaries per agent session" />
        <MetricCard label="Confirmed days" value={data.reimbursements.filter((entry) => entry.status === "CONFIRMED").length} note="Ready for payout export" />
        <MetricCard label="Pending days" value={data.reimbursements.filter((entry) => entry.status !== "CONFIRMED").length} note="Still needs attention" />
        <MetricCard label="Open tasks" value={data.tasks.filter((entry) => entry.status === "OPEN").length} note="Assigned to field team" />
      </section>

      <section className="dashboard-grid">
        <Panel title="Accounting Actions" description="Export the ledger and assign task reminders to agents.">
          <AccountingActions agents={data.agents} />
        </Panel>
        <Panel title="Reimbursement Ledger" description="Computed from login, logout, readings, and site-visit entries.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Date</th>
                  <th>Office In</th>
                  <th>Office Out</th>
                  <th>Distance</th>
                  <th>Visits</th>
                  <th>Lunch</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.reimbursements.map((summary) => (
                  <tr key={`${summary.userId}-${summary.date}`}>
                    <td>{summary.agentName}</td>
                    <td>{summary.date}</td>
                    <td>{toIndiaTimeLabel(summary.officeInTime)}</td>
                    <td>{summary.officeOutTime ? toIndiaTimeLabel(summary.officeOutTime) : "Not recorded"}</td>
                    <td>{summary.totalDistance ?? "-"}</td>
                    <td>{summary.totalSiteVisits}</td>
                    <td>{summary.lunchAmount}</td>
                    <td>{summary.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}
```

## File: app\agent\page.tsx

```tsx
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { AgentActionPanel } from "@/components/agent/AgentActions";
import { ReadingLogList } from "@/components/agent/ReadingLogList";
import { ReimbursementSummaryList } from "@/components/agent/ReimbursementSummaryList";
import { requireUser } from "@/lib/auth";
import { toIndiaTimeLabel } from "@/lib/date";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user);
  const currentTarget = data.targets[0]?.quantityTarget ?? 0;

  return (
    <AppShell
      user={user}
      title="Sales Agent Dashboard"
      subtitle="Capture readings, track site leads, request approvals, and keep the reimbursement record complete."
      statusLabel={data.activeSession ? "WORKDAY_OPEN" : "READY"}
      compact
    >
      <section className="metric-grid metric-grid-compact">
        <MetricCard
          label="Office in"
          value={data.activeSession ? toIndiaTimeLabel(data.activeSession.loginAt) : "Not started"}
          note="Login becomes the office in time."
        />
        <MetricCard label="Today's pipeline" value={`${data.pipelineQuantity} CUM`} note="Open opportunity volume" />
        <MetricCard label="Approved quantity" value={`${data.approvedQuantity} CUM`} note="Manager-approved quantity" />
        <MetricCard
          label="Target achievement"
          value={currentTarget ? `${Math.min(Math.round((data.approvedQuantity / currentTarget) * 100), 999)}%` : "0%"}
          note={currentTarget ? `Target ${currentTarget} CUM` : "Waiting for target"}
        />
      </section>

      <Panel title="Action Center" description="Move through the day one workflow at a time.">
        <AgentActionPanel leads={data.leads} approvals={data.approvals} />
      </Panel>

      <section className="agent-secondary-grid">
        <Panel title="Daily Logs" description="Active readings, assigned tasks, and reimbursement progress.">
          <div className="section-stack">
            <ReadingLogList readings={data.readings} />

            <section className="daily-log-section">
              <div className="section-head">
                <div>
                  <h3 className="section-title">Assigned Tasks</h3>
                  <p className="section-copy">Secondary follow-ups and manager assignments for today.</p>
                </div>
              </div>
              <div className="data-list">
                {data.tasks.length ? (
                  data.tasks.map((task) => (
                    <div key={task.id} className="data-row">
                      <h4>{task.subject}</h4>
                      <p>{task.explanation}</p>
                      <div className="row-meta">
                        <span>Deadline {toIndiaTimeLabel(task.deadline)}</span>
                        <span>{task.status}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="note-box">No secondary tasks assigned.</div>
                )}
              </div>
            </section>

            <section className="daily-log-section">
              <div className="section-head">
                <div>
                  <h3 className="section-title">Reimbursement Summary</h3>
                  <p className="section-copy">Daily office times, readings, distance, and lunch are grouped here.</p>
                </div>
              </div>
              <ReimbursementSummaryList summaries={data.reimbursementSummaries} />
            </section>
          </div>
        </Panel>

        <Panel
          title="Lead Focus"
          description="Upcoming follow-ups and strongest opportunities stay nearby, but out of the main action flow."
        >
          <div className="data-list">
            {data.leads.length ? (
              data.leads.slice(0, 5).map((lead) => (
                <div key={lead.id} className="data-row">
                  <div className="panel-header">
                    <h4>{lead.siteName}</h4>
                    <StatusBadge value={lead.stage} />
                  </div>
                  <p>{lead.siteAddress}</p>
                  <div className="row-meta">
                    <span>Score {lead.score}/10</span>
                    <span>Follow-up {toIndiaTimeLabel(lead.nextFollowUpAt)}</span>
                    <span>Supplier {lead.currentSupplier}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="note-box">No site leads yet. Your first site visit will create one.</div>
            )}
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}
```

## File: app\api\accounting\reimbursements\export\route.ts

```ts
import { NextRequest, NextResponse } from "next/server";
import { exportReimbursements } from "@/lib/repository";
import { jsonError, requireApiUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    await requireApiUser(["ACCOUNTING"]);
    const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
    const exported = await exportReimbursements(format);

    return new NextResponse(exported.content, {
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\accounting\reimbursements\route.ts

```ts
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { getAccountingDashboardData } from "@/lib/repository";

export async function GET() {
  try {
    const user = await requireApiUser(["ACCOUNTING"]);
    const data = await getAccountingDashboardData(user);
    return jsonOk({ reimbursements: data.reimbursements });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\approval-requests\[id]\route.ts

```ts
import { decideApprovalRequest } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { status?: "APPROVED" | "REJECTED"; decisionNote?: string };
    const { id } = await context.params;
    const approval = await decideApprovalRequest(
      user,
      id,
      body.status === "REJECTED" ? "REJECTED" : "APPROVED",
      `${body.decisionNote ?? ""}`,
    );
    return jsonOk({ approval });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\approval-requests\route.ts

```ts
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createApprovalRequest } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json()) as Record<string, string>;
    const approval = await createApprovalRequest(user, {
      leadId: `${body.leadId}`,
      customerName: `${body.customerName}`,
      grade: `${body.grade}`,
      quantity: Number(body.quantity),
      requiredDate: new Date(`${body.requiredDate}`).toISOString(),
      distanceFromPlantKm: Number(body.distanceFromPlantKm),
      trafficCount: Number(body.trafficCount),
      castingType: `${body.castingType}`,
      quotedPrice: Number(body.quotedPrice),
    });

    return jsonOk({ approval }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\auth\login\route.ts

```ts
import { loginWithEmployeeId } from "@/lib/auth";
import { ApiError, jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { employeeId?: string; password?: string };
    const user = await loginWithEmployeeId(`${body.employeeId ?? ""}`.trim(), `${body.password ?? ""}`);

    if (!user) {
      throw new ApiError(401, "Invalid employee ID or password.");
    }

    return jsonOk({
      user: {
        id: user.id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\auth\logout\route.ts

```ts
import { logoutCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST() {
  try {
    await logoutCurrentUser();
    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\auth\switch-role\route.ts

```ts
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { getDashboardPathForRole, isLoginDisabled, setDemoRole, SWITCHABLE_ROLES } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export async function POST(request: Request) {
  try {
    if (!isLoginDisabled()) {
      throw new ApiError(403, "Dashboard switch is only available when login is disabled.");
    }

    const body = (await request.json().catch(() => ({}))) as { role?: string };
    const role = `${body.role ?? ""}` as UserRole;

    if (!SWITCHABLE_ROLES.includes(role)) {
      throw new ApiError(400, "Invalid dashboard role.");
    }

    await setDemoRole(role);

    return jsonOk({
      success: true,
      path: getDashboardPathForRole(role),
    });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\help-requests\[id]\route.ts

```ts
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { resolveHelpRequest } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { resolutionNote?: string };
    const { id } = await context.params;
    const helpRequest = await resolveHelpRequest(user, id, `${body.resolutionNote ?? ""}`);
    return jsonOk({ helpRequest });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\help-requests\route.ts

```ts
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createHelpRequest } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json()) as Record<string, string>;
    const helpRequest = await createHelpRequest(user, {
      sessionDate: `${body.sessionDate ?? ""}`,
      requestedField: `${body.requestedField ?? ""}`,
      explanation: `${body.explanation ?? ""}`,
    });
    return jsonOk({ helpRequest }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\leads\[id]\route.ts

```ts
import type { LeadStage } from "@/lib/types";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { updateLead } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER"]);
    const body = (await request.json()) as Record<string, string | number>;
    const { id } = await context.params;
    const lead = await updateLead(user, id, {
      score: body.score !== undefined ? Number(body.score) : undefined,
      stage: body.stage as LeadStage | undefined,
      nextFollowUpAt: body.nextFollowUpAt ? new Date(`${body.nextFollowUpAt}`).toISOString() : undefined,
      futureScope: typeof body.futureScope === "string" ? body.futureScope : undefined,
      priceExpectation: typeof body.priceExpectation === "string" ? body.priceExpectation : undefined,
    });
    return jsonOk({ lead });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\leads\route.ts

```ts
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { listLeads } from "@/lib/repository";

export async function GET() {
  try {
    const user = await requireApiUser();
    const leads = await listLeads(user);
    return jsonOk({ leads });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\manager\verifications\[id]\resolve\route.ts

```ts
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { resolveVerification } from "@/lib/repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as { manualValue?: string | number; note?: string };
    const { id } = await context.params;
    const reading = await resolveVerification(user, id, Number(body.manualValue), `${body.note ?? ""}`);
    return jsonOk({ reading });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\manager\verifications\route.ts

```ts
import { listVerificationQueue } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function GET() {
  try {
    await requireApiUser(["MANAGER"]);
    const verificationQueue = await listVerificationQueue();
    return jsonOk({ verificationQueue });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\odometer-readings\[id]\confirm\route.ts

```ts
import { confirmOdometerReading } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const { id } = await context.params;
    const reading = await confirmOdometerReading(user, id);
    return jsonOk({ reading });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\odometer-readings\[id]\reject\route.ts

```ts
import { rejectOdometerReading } from "@/lib/repository";
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const { id } = await context.params;
    const reading = await rejectOdometerReading(user, id, `${body.note ?? ""}`);
    return jsonOk({ reading });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\odometer-readings\route.ts

```ts
import { ApiError, jsonError, jsonOk, parseLatLng, requireApiUser, requireString } from "@/lib/api";
import { createOdometerReading } from "@/lib/repository";
import type { ReadingType } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const formData = await request.formData();
    const type = requireString(formData.get("type"), "Reading type is required.") as ReadingType;
    const photo = formData.get("photo");

    if (!(photo instanceof File)) {
      throw new ApiError(400, "An odometer photo is required.");
    }

    const reading = await createOdometerReading(user, {
      type,
      file: photo,
      latLng: parseLatLng({
        lat: formData.get("lat"),
        lng: formData.get("lng"),
      }),
    });

    return jsonOk({ reading }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\sessions\end\route.ts

```ts
import { endWorkdaySession } from "@/lib/repository";
import { jsonError, jsonOk, parseLatLng, requireApiUser } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json().catch(() => ({}))) as { lat?: string; lng?: string };

    if (user.role !== "SALES_AGENT") {
      return jsonOk({ ended: false, message: "No workday session needed for this role." });
    }

    const session = await endWorkdaySession(user, parseLatLng(body));
    return jsonOk({ ended: true, session });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\sessions\start\route.ts

```ts
import { jsonError, jsonOk, parseLatLng, requireApiUser } from "@/lib/api";
import { startWorkdaySession } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json().catch(() => ({}))) as { lat?: string; lng?: string };

    if (user.role !== "SALES_AGENT") {
      return jsonOk({ started: false, message: "No workday session needed for this role." });
    }

    const session = await startWorkdaySession(user, parseLatLng(body));
    return jsonOk({ started: true, session });
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\site-visits\route.ts

```ts
import { ApiError, jsonError, jsonOk, parseLatLng, requireApiUser, requireNumber, requireString, toIsoDateTime } from "@/lib/api";
import { createSiteVisit } from "@/lib/repository";
import type { LeadStage } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const formData = await request.formData();
    const arrivalPhoto = formData.get("arrivalPhoto");

    if (!(arrivalPhoto instanceof File)) {
      throw new ApiError(400, "Arrival photo is required.");
    }

    const visit = await createSiteVisit(user, {
      file: arrivalPhoto,
      leadId: `${formData.get("leadId") ?? ""}`.trim() || null,
      siteName: requireString(formData.get("siteName"), "Site name is required."),
      siteAddress: requireString(formData.get("siteAddress"), "Site address is required."),
      stakeholders: requireString(formData.get("stakeholders"), "Stakeholder details are required."),
      concreteGrade: requireString(formData.get("concreteGrade"), "Concrete grade is required."),
      quantityCum: requireNumber(formData.get("quantityCum"), "Quantity is required."),
      stageOfWork: requireString(formData.get("stageOfWork"), "Stage of work is required."),
      futureScope: requireString(formData.get("futureScope"), "Future scope is required."),
      currentSupplier: requireString(formData.get("currentSupplier"), "Current supplier is required."),
      priceExpectation: requireString(formData.get("priceExpectation"), "Price expectation is required."),
      score: requireNumber(formData.get("score"), "Score is required."),
      leadStage: requireString(formData.get("leadStage"), "Lead stage is required.") as LeadStage,
      nextFollowUpAt: toIsoDateTime(requireString(formData.get("nextFollowUpAt"), "Follow-up date is required."), "Invalid follow-up date."),
      latLng: parseLatLng({
        lat: formData.get("lat"),
        lng: formData.get("lng"),
      }),
    });

    return jsonOk({ visit }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\targets\route.ts

```ts
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { upsertTarget } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as Record<string, string>;
    const target = await upsertTarget(user, `${body.agentId}`, `${body.month}`, Number(body.quantityTarget));
    return jsonOk({ target }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\api\tasks\route.ts

```ts
import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { createTask } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["MANAGER", "ACCOUNTING"]);
    const body = (await request.json()) as Record<string, string>;
    const task = await createTask(user, {
      subject: `${body.subject ?? ""}`,
      explanation: `${body.explanation ?? ""}`,
      deadline: new Date(`${body.deadline ?? ""}`).toISOString(),
      assignedTo: `${body.assignedTo ?? ""}`,
    });
    return jsonOk({ task }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
```

## File: app\dashboard\page.tsx

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role === "SALES_AGENT") {
    redirect("/agent");
  }

  if (user.role === "MANAGER") {
    redirect("/manager");
  }

  redirect("/accounting");
}
```

## File: app\globals.css

```css
:root {
  --bg: #f6f4ef;
  --surface: rgba(255, 255, 255, 0.82);
  --surface-strong: #ffffff;
  --ink: #112031;
  --muted: #546477;
  --line: rgba(17, 32, 49, 0.12);
  --brand: #10233f;
  --brand-soft: #d8e6ff;
  --accent: #f59e0b;
  --success: #0f766e;
  --danger: #b91c1c;
  --warning: #b45309;
  --shadow: 0 22px 48px rgba(16, 35, 63, 0.12);
  --radius: 24px;
  --font-body: "Segoe UI", "Helvetica Neue", sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--font-body);
  color: var(--ink);
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.22), transparent 28%),
    radial-gradient(circle at left center, rgba(16, 35, 63, 0.08), transparent 24%),
    linear-gradient(180deg, #fbfaf7 0%, #f2efe7 100%);
}

a {
  color: inherit;
  text-decoration: none;
}

img {
  max-width: 100%;
  display: block;
}

button,
input,
select,
textarea {
  font: inherit;
}

.page-shell {
  width: min(1280px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.hero {
  display: grid;
  gap: 20px;
  padding: 32px;
  border-radius: calc(var(--radius) + 8px);
  background:
    linear-gradient(135deg, rgba(16, 35, 63, 0.96), rgba(27, 56, 95, 0.88)),
    linear-gradient(135deg, rgba(245, 158, 11, 0.18), transparent 60%);
  color: #fff;
  box-shadow: var(--shadow);
}

.hero-compact {
  gap: 16px;
  padding: 24px 26px;
}

.hero-compact .panel-copy {
  max-width: 56ch;
}

.hero-compact .hero-actions {
  gap: 8px;
}

.hero h1,
.hero h2,
.hero h3,
.panel h2,
.panel h3 {
  margin: 0;
}

.hero-grid,
.dashboard-grid,
.panel-grid,
.metric-grid,
.three-grid {
  display: grid;
  gap: 16px;
}

.dashboard-grid {
  margin-top: 24px;
}

.manager-command-bar,
.manager-plant-strip,
.manager-kpi-grid,
.manager-layout-grid {
  margin-top: 24px;
}

.agent-secondary-grid,
.section-stack,
.daily-log-section,
.action-workflow,
.summary-card-list {
  display: grid;
  gap: 18px;
}

.metric-grid-compact {
  margin-top: 24px;
}

.metric-grid-compact .metric-card {
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.76);
}

.metric-grid-compact .metric-value {
  margin-top: 8px;
  font-size: 1.5rem;
}

.metric-grid-compact .metric-note {
  margin-top: 4px;
}

.panel {
  padding: 22px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.manager-command-bar,
.manager-plant-strip,
.manager-kpi-card,
.manager-summary-card {
  padding: 20px 22px;
  border-radius: calc(var(--radius) - 2px);
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.manager-command-bar,
.manager-plant-strip {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
}

.manager-command-title {
  margin: 8px 0 0;
  font-size: clamp(1.4rem, 2.6vw, 2.1rem);
}

.manager-plant-strip-copy h3 {
  margin: 8px 0 0;
  font-size: 1.4rem;
}

.manager-plant-tabs,
.manager-kpi-grid,
.manager-layout-grid,
.profitability-heatmap,
.profitability-list,
.activity-stream-list {
  display: grid;
  gap: 14px;
}

.manager-plant-tabs {
  flex: 1;
  min-width: 0;
}

.manager-plant-tab {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgba(16, 35, 63, 0.08);
  border-radius: 18px;
  background: rgba(16, 35, 63, 0.04);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.manager-plant-tab small {
  color: var(--muted);
}

.manager-plant-tab.is-active {
  background:
    linear-gradient(135deg, rgba(16, 35, 63, 0.96), rgba(27, 56, 95, 0.9)),
    linear-gradient(135deg, rgba(245, 158, 11, 0.18), transparent 60%);
  color: #fff;
  box-shadow: 0 20px 40px rgba(16, 35, 63, 0.18);
}

.manager-plant-tab.is-active small {
  color: rgba(255, 255, 255, 0.74);
}

.manager-kpi-card {
  display: grid;
  gap: 8px;
}

.manager-kpi-value {
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  line-height: 1.05;
}

.manager-layout-grid {
  align-items: start;
}

.manager-summary-card {
  display: grid;
  gap: 10px;
  background:
    linear-gradient(145deg, rgba(16, 35, 63, 0.9), rgba(38, 73, 123, 0.86)),
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.18), transparent 38%);
  color: #fff;
}

.manager-summary-card p {
  margin: 0;
  color: rgba(255, 255, 255, 0.84);
}

.profitability-row {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(16, 35, 63, 0.05);
}

.heatbar-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(16, 35, 63, 0.08);
  overflow: hidden;
}

.heatbar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.9), rgba(15, 118, 110, 0.92));
}

.heatmap-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}

.heatmap-pill {
  padding: 8px 12px;
  border-radius: 999px;
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 700;
}

.activity-stream-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.activity-stream-marker {
  width: 12px;
  height: 12px;
  margin-top: 16px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--accent), var(--brand));
  box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.12);
}

.activity-stream-content {
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(16, 35, 63, 0.08);
}

.manager-overlay-shell,
.manager-drawer-shell {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(17, 32, 49, 0.34);
  backdrop-filter: blur(6px);
}

.manager-overlay-shell {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 128px 24px 24px;
}

.manager-overlay-card {
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 20px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 32px 60px rgba(16, 35, 63, 0.22);
}

.manager-history-drawer {
  position: absolute;
  top: 0;
  right: 0;
  width: min(460px, 100vw);
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  background: rgba(249, 247, 241, 0.98);
  box-shadow: -18px 0 40px rgba(16, 35, 63, 0.18);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-copy {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.95rem;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 1.02rem;
}

.section-copy {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.metric-card {
  padding: 18px;
  border-radius: 20px;
  background: var(--surface-strong);
  border: 1px solid var(--line);
}

.metric-label {
  color: var(--muted);
  font-size: 0.88rem;
}

.metric-value {
  display: block;
  margin-top: 10px;
  font-size: 1.8rem;
  font-weight: 700;
}

.metric-note {
  display: block;
  margin-top: 6px;
  font-size: 0.9rem;
  color: var(--muted);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.status-confirmed,
.status-approved,
.status-finalized,
.status-resolved,
.status-open-good {
  background: rgba(15, 118, 110, 0.13);
  color: var(--success);
}

.status-pending,
.status-negotiating,
.status-awaiting_confirmation {
  background: rgba(180, 83, 9, 0.13);
  color: var(--warning);
}

.status-rejected,
.status-missed,
.status-danger {
  background: rgba(185, 28, 28, 0.13);
  color: var(--danger);
}

.status-manual_review_required,
.status-manual_verified,
.status-talks {
  background: rgba(16, 35, 63, 0.1);
  color: var(--brand);
}

.status-workday_open,
.status-ready,
.status-manager_view,
.status-accounting_view {
  background: rgba(216, 230, 255, 0.72);
  color: var(--brand);
}

.data-list {
  display: grid;
  gap: 14px;
}

.data-row {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.66);
}

.action-item {
  border: 1px solid var(--line);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.72);
  overflow: hidden;
}

.action-item.is-open {
  background: rgba(255, 255, 255, 0.94);
}

.action-trigger {
  width: 100%;
  padding: 18px 20px;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  text-align: left;
}

.action-step {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: rgba(16, 35, 63, 0.08);
  color: var(--brand);
  font-weight: 700;
}

.action-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
}

.action-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.action-title {
  font-size: 1rem;
}

.action-meta {
  color: var(--muted);
  font-size: 0.85rem;
}

.action-description {
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.45;
}

.action-indicator {
  flex-shrink: 0;
  color: var(--brand);
  font-size: 1.5rem;
  line-height: 1;
}

.action-panel {
  padding: 0 20px 20px;
  border-top: 1px solid var(--line);
}

.data-row h4,
.data-row p {
  margin: 0;
}

.data-row p {
  color: var(--muted);
}

.detail-toggle {
  width: 100%;
  display: grid;
  gap: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.detail-toggle .panel-header {
  margin-bottom: 0;
}

.dashboard-switcher {
  position: relative;
}

.dashboard-switcher[open] {
  z-index: 12;
}

.dashboard-switcher summary {
  list-style: none;
}

.dashboard-switcher summary::-webkit-details-marker {
  display: none;
}

.dashboard-switcher-trigger {
  min-height: 40px;
  padding: 0 14px;
}

.dashboard-switcher-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 180px;
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid var(--line);
  box-shadow: 0 18px 40px rgba(16, 35, 63, 0.18);
}

.dashboard-switcher-option {
  min-height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: rgba(16, 35, 63, 0.06);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}

.dashboard-switcher-option.is-active {
  background: rgba(16, 35, 63, 0.14);
  color: var(--brand);
  font-weight: 700;
}

.dashboard-switcher-error {
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(185, 28, 28, 0.12);
  color: var(--danger);
  font-size: 0.82rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(17, 32, 49, 0.38);
  backdrop-filter: blur(8px);
}

.modal-card {
  width: min(760px, 100%);
  max-height: min(88vh, 900px);
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 246, 240, 0.96));
  box-shadow: 0 28px 60px rgba(16, 35, 63, 0.26);
}

.modal-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.modal-card-header .panel-header {
  margin-bottom: 0;
}

.modal-scroll {
  overflow-y: auto;
  padding-right: 2px;
}

.modal-close {
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(16, 35, 63, 0.08);
  color: var(--brand);
  cursor: pointer;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.detail-cell {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(16, 35, 63, 0.05);
}

.detail-label {
  color: var(--muted);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.detail-value {
  word-break: break-word;
}

.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--muted);
  font-size: 0.9rem;
}

.form-grid {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
}

.field label {
  font-weight: 600;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(16, 35, 63, 0.16);
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink);
}

.field textarea {
  min-height: 120px;
  resize: vertical;
}

.hint {
  color: var(--muted);
  font-size: 0.85rem;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.button,
.button-secondary,
.button-ghost,
.button-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.button:hover,
.button-secondary:hover,
.button-ghost:hover,
.button-danger:hover {
  transform: translateY(-1px);
}

.reading-card,
.summary-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.82);
}

.reading-card .panel-header,
.summary-card .panel-header {
  margin-bottom: 0;
}

.reading-stat-grid,
.summary-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.reading-stat,
.summary-cell {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(16, 35, 63, 0.05);
}

.reading-stat-label,
.summary-label {
  color: var(--muted);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.history-toggle {
  border: 1px solid var(--line);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.68);
  overflow: hidden;
}

.history-toggle summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  font-weight: 700;
}

.history-toggle summary::-webkit-details-marker {
  display: none;
}

.history-toggle-copy {
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 500;
}

.history-panel {
  padding: 0 18px 18px;
}

.mobile-only {
  display: grid;
}

.desktop-only {
  display: none;
}

.button {
  background: var(--brand);
  color: #fff;
}

.button-secondary {
  background: var(--accent);
  color: #1b1b1b;
}

.button-ghost {
  background: rgba(16, 35, 63, 0.08);
  color: var(--brand);
}

.button-danger {
  background: rgba(185, 28, 28, 0.12);
  color: var(--danger);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}

th {
  color: var(--muted);
  font-size: 0.9rem;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.note-box,
.success-box,
.warning-box,
.error-box {
  padding: 14px 16px;
  border-radius: 18px;
  font-size: 0.95rem;
}

.mt-12 {
  margin-top: 12px;
}

.mt-16 {
  margin-top: 16px;
}

.mt-24 {
  margin-top: 24px;
}

.note-box {
  background: rgba(16, 35, 63, 0.08);
}

.success-box {
  background: rgba(15, 118, 110, 0.12);
  color: var(--success);
}

.warning-box {
  background: rgba(180, 83, 9, 0.14);
  color: var(--warning);
}

.error-box {
  background: rgba(185, 28, 28, 0.14);
  color: var(--danger);
}

.login-shell {
  min-height: 100vh;
  display: grid;
  align-items: center;
  padding: 24px 0;
}

.login-grid {
  display: grid;
  gap: 24px;
}

@media (min-width: 720px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .manager-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .manager-plant-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .desktop-only {
    display: block;
  }

  .mobile-only {
    display: none;
  }

  .agent-secondary-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
    align-items: start;
  }

  .dashboard-grid {
    grid-template-columns: 1.15fr 0.85fr;
  }

  .manager-layout-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero-grid,
  .three-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 719px) {
  .manager-command-bar,
  .manager-plant-strip {
    display: grid;
  }

  .manager-overlay-shell {
    align-items: end;
    justify-content: stretch;
    padding: 12px;
  }

  .manager-overlay-card {
    width: 100%;
    max-height: 78vh;
    border-radius: 24px;
  }

  .manager-history-drawer {
    width: 100%;
    padding: 18px;
  }

  .dashboard-switcher-menu {
    right: auto;
    left: 0;
    width: min(220px, calc(100vw - 48px));
  }

  .modal-backdrop {
    align-items: end;
    padding: 12px;
  }

  .modal-card {
    width: 100%;
    max-height: 86vh;
    padding: 18px;
    border-radius: 24px 24px 18px 18px;
  }

  .modal-card-header {
    display: grid;
  }

  .details-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (min-width: 1080px) {
  .metric-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .manager-kpi-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .manager-layout-grid {
    grid-template-columns: 0.95fr 0.95fr 1.1fr;
  }

  .panel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .login-grid {
    grid-template-columns: 1.1fr 0.9fr;
    align-items: center;
  }
}
```

## File: app\icon.svg

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#10233f" />
  <path d="M26 38h76v16H26zM26 60h44v30H26zM78 60h24v30H78z" fill="#f59e0b" />
  <path d="M36 34h56v8H36zM36 68h24v8H36zM36 82h24v8H36zM86 68h8v14h-8z" fill="#fff" />
</svg>
```

## File: app\layout.tsx

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPD Field Sales",
  description: "Mobile-first field sales workflow for odometer, lead, and reimbursement tracking.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

## File: app\manager\page.tsx

```tsx
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { ManagerWorkspace } from "@/components/manager/ManagerWorkspace";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);

  return (
    <AppShell
      user={user}
      title="Manager Dashboard"
      subtitle="Review manual verification, assign work, set targets, and decide commercial approvals."
      statusLabel="MANAGER_VIEW"
    >
      <section className="metric-grid mt-24">
        <MetricCard label="Holdings waiting" value={data.verificationQueue.length} note="Manager input required" />
        <MetricCard label="Pending decisions" value={data.approvals.filter((entry) => entry.status === "PENDING").length} note="Commercial approvals waiting" />
        <MetricCard label="Open corrections" value={data.helpRequests.filter((entry) => entry.status === "OPEN").length} note="Agent support requests" />
        <MetricCard label="Tracked leads" value={data.leads.length} note="Sorted by follow-up urgency" />
      </section>
      <ManagerWorkspace data={data} />
    </AppShell>
  );
}
```

## File: app\manifest.ts

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SPD Field Sales",
    short_name: "SPD",
    description: "Internal field-sales workflow for agents, managers, and accounting.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#10233f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
```

## File: app\page.tsx

```tsx
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="page-shell login-shell">
      <div className="login-grid">
        <section className="hero">
          <div>
            <p className="metric-label">SPD Internal Platform</p>
            <h1>Field sales, approvals, and reimbursements in one workflow.</h1>
            <p className="panel-copy">
              This MVP is tailored to the workflow in the SPD document: odometer capture, site visits, lead scoring,
              manager verification, and accounting exports.
            </p>
          </div>
          <div className="hero-grid">
            <article className="metric-card">
              <span className="metric-label">Sales agent demo</span>
              <strong className="metric-value">SA1001</strong>
              <span className="metric-note">Password: password123</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Manager demo</span>
              <strong className="metric-value">MG2001</strong>
              <span className="metric-note">Password: password123</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Accounting demo</span>
              <strong className="metric-value">AC3001</strong>
              <span className="metric-note">Password: password123</span>
            </article>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Sign in</h2>
              <p className="panel-copy">Location is requested after login so office-in time can be recorded.</p>
            </div>
          </div>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
```

## File: next.config.mjs

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  }
};

export default nextConfig;
```

## File: next-env.d.ts

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
/// <reference path="./.next/types/routes.d.ts" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

## File: package.json

```json
{
  "name": "spd-field-sales",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.9.1",
    "@prisma/client": "^5.19.1",
    "firebase-admin": "^13.8.0",
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/node": "^22.15.18",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "prisma": "^5.19.1",
    "typescript": "^5.8.3",
    "vitest": "^2.1.9"
  }
}
```

## File: prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  SALES_AGENT
  MANAGER
  ACCOUNTING
}

enum UserStatus {
  ACTIVE
  INACTIVE
}

enum SessionStatus {
  OPEN
  CLOSED
}

enum ReadingType {
  START
  END
}

enum ReadingStatus {
  OCR_PENDING
  AWAITING_CONFIRMATION
  CONFIRMED
  MANUAL_REVIEW_REQUIRED
  MANUAL_VERIFIED
}

enum LeadStage {
  TALKS
  NEGOTIATING
  FINALIZED
  MISSED
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

enum TaskStatus {
  OPEN
  DONE
}

enum HelpRequestStatus {
  OPEN
  RESOLVED
}

model User {
  id             String           @id @default(cuid())
  employeeId     String           @unique
  name           String
  role           UserRole
  status         UserStatus       @default(ACTIVE)
  passwordHash   String
  sessions       WorkdaySession[]
  targets        Target[]
  assignedTasks  Task[]           @relation("AssignedTasks")
  createdTasks   Task[]           @relation("CreatedTasks")
  decidedApprovals ApprovalRequest[] @relation("ApprovalDecisions")
  verifiedReadings OdometerReading[] @relation("ReadingVerifier")
}

model WorkdaySession {
  id             String            @id @default(cuid())
  userId         String
  date           DateTime
  loginAt        DateTime
  logoutAt       DateTime?
  loginLat       Float?
  loginLng       Float?
  logoutLat      Float?
  logoutLng      Float?
  status         SessionStatus     @default(OPEN)
  user           User              @relation(fields: [userId], references: [id])
  odometerReadings OdometerReading[]
  siteVisits     SiteVisit[]
}

model OdometerReading {
  id             String         @id @default(cuid())
  sessionId      String
  type           ReadingType
  photoUrl       String
  capturedAt     DateTime
  capturedLat    Float?
  capturedLng    Float?
  ocrValue       Int?
  finalValue     Int?
  ocrConfidence  Float?
  status         ReadingStatus
  verifiedById   String?
  verificationNote String?
  session        WorkdaySession  @relation(fields: [sessionId], references: [id])
  verifiedBy     User?           @relation("ReadingVerifier", fields: [verifiedById], references: [id])
}

model Lead {
  id                   String          @id @default(cuid())
  siteName             String
  siteAddress          String
  score                Int
  stage                LeadStage
  nextFollowUpAt       DateTime
  lastVisitedAt        DateTime
  currentSupplier      String?
  priceExpectation     String?
  futureScope          String?
  builderName          String?
  contractorName       String?
  supervisorName       String?
  supervisorPhone      String?
  currentConcreteGrade String?
  currentQuantityCum   Float?
  agentId              String
  siteVisits           SiteVisit[]
  approvals            ApprovalRequest[]
}

model SiteVisit {
  id               String        @id @default(cuid())
  sessionId        String
  leadId           String
  siteName         String
  siteAddress      String
  arrivalPhotoUrl  String
  visitedAt        DateTime
  lat              Float?
  lng              Float?
  concreteGrade    String
  quantityCum      Float
  stageOfWork      String
  futureScope      String
  currentSupplier  String
  priceExpectation String
  score            Int
  leadStage        LeadStage
  nextFollowUpAt   DateTime
  stakeholderJson  String
  session          WorkdaySession @relation(fields: [sessionId], references: [id])
  lead             Lead          @relation(fields: [leadId], references: [id])
}

model ApprovalRequest {
  id                  String         @id @default(cuid())
  leadId              String
  customerName        String
  grade               String
  quantity            Float
  requiredDate        DateTime
  distanceFromPlantKm Float
  trafficCount        Int
  castingType         String
  quotedPrice         Float
  status              ApprovalStatus @default(PENDING)
  decidedById         String?
  decidedAt           DateTime?
  decisionNote        String?
  createdById         String
  createdAt           DateTime       @default(now())
  lead                Lead           @relation(fields: [leadId], references: [id])
  decidedBy           User?          @relation("ApprovalDecisions", fields: [decidedById], references: [id])
}

model Task {
  id           String      @id @default(cuid())
  subject      String
  explanation  String
  deadline     DateTime
  status       TaskStatus  @default(OPEN)
  assignedToId String
  assignedById String
  assignedTo   User        @relation("AssignedTasks", fields: [assignedToId], references: [id])
  assignedBy   User        @relation("CreatedTasks", fields: [assignedById], references: [id])
}

model HelpRequest {
  id             String            @id @default(cuid())
  agentId        String
  sessionDate    DateTime
  requestedField String
  explanation    String
  status         HelpRequestStatus @default(OPEN)
  resolvedById   String?
  resolutionNote String?
}

model Target {
  id            String   @id @default(cuid())
  userId        String
  month         String
  quantityTarget Float
  user          User     @relation(fields: [userId], references: [id])
}
```

## File: PROJECT_STATUS.md

```md
# SPD Field Sales App Status

Last updated: 2026-04-22

## Current state

- Project type: `Next.js + TypeScript` internal web app
- Data mode: `Firebase Firestore` enabled
- Upload mode: `local file storage` enabled
- OCR mode: `Gemini API` enabled
- Auth mode for local testing: `login disabled` with dashboard role switcher
- Prisma schema exists, but runtime is currently using the repository layer instead of Prisma

## Working setup

- Firestore project: `spd-appilation`
- Firestore database id: `spddata`
- Firebase service account is configured through `.env.local`
- Local uploads are saved under `public/uploads`
- Gemini API key is present in `.env.local`
- `DISABLE_LOGIN="true"` is enabled in `.env.local`

## Implemented features

- Role-based dashboards:
  - Sales Agent
  - Manager
  - Accounting
- Login/logout flow with workday session start and end
- Odometer upload with required `START` / `END` type
- OCR extraction workflow with status handling:
  - `AWAITING_CONFIRMATION`
  - `MANUAL_REVIEW_REQUIRED`
  - `CONFIRMED`
  - `MANUAL_VERIFIED`
- Persistent confirmation UI from the reading log
- Site visit entry and lead tracking
- Approval request workflow
- Help/correction request workflow
- Manager verification queue
- Manager approval summary popup
- Accounting reimbursement ledger and export
- Small header dashboard switcher for Agent / Manager / Accounting during local testing

## OCR behavior now

- OCR provider: Gemini image understanding via API key
- Rules currently tuned for:
  - digital `ODO`
  - digital `TOTAL`
  - `TRIP`
  - analog/mechanical odometer images
- `TRIP` readings are allowed and are not auto-rejected
- OCR ignores:
  - speed values
  - time/clock
  - GPS watermark text
  - dial scale numbers
- If OCR is uncertain, the reading falls back to manual review

## Firebase/storage decision

- Firestore is real and active
- Firebase Storage is not being used right now
- Reason: project Storage requires upgrade from Spark plan
- Chosen workaround: keep real Firestore, store uploaded files locally

## Latest verified app state

- Production build passes
- App is running locally on `http://localhost:3005`
- Gemini OCR smoke tests succeeded on sample dashboard images
- Persistent confirmation buttons were added to `Daily Logs`
- Login is bypassed for testing and dashboards can be switched from the header
- Manager approval popup now opens as a page-level portal instead of inside the card layout
- Latest manager popup issue fixed:
  - overlap with lower cards
  - dashboard freeze when opening

## Current dev server

- Current local app URL:
  - `http://localhost:3005`
- Server mode:
  - production build via `next build` + `next start`
- Reason:
  - this was more stable than the earlier dev servers that kept dying or hitting stale cache issues

## Important files

- App status snapshot: `PROJECT_STATUS.md`
- Auth logic and test-mode switch: `src/lib/auth.ts`
- Dashboard switcher: `src/components/DashboardSwitcher.tsx`
- Main agent page: `app/agent/page.tsx`
- Agent actions: `src/components/agent/AgentActions.tsx`
- Persistent reading log UI: `src/components/agent/ReadingLogList.tsx`
- Manager workflow UI: `src/components/manager/ManagerActions.tsx`
- OCR logic: `src/lib/ocr.ts`
- Firebase setup: `src/lib/firebase-admin.ts`
- Data layer: `src/lib/db.ts`
- Storage layer: `src/lib/storage.ts`
- Business logic: `src/lib/repository.ts`
- Environment config: `.env.local`

## Known limitations

- Local app still depends on a restarted local server when the machine/session changes
- Firebase Storage is not active yet
- Prisma is not yet the live runtime persistence layer
- OCR confirmation flow is now persistent, but broader notification UX can still be improved later
- One older TypeScript test issue remains in `tests/repository.test.ts` around a missing `mimeType` in test input
- The user-provided popup reference video path existed but the file was `0 bytes`, so that visual reference could not be used

## Good next discussion topics

- better confirmation/notification UX
- richer manager review tools
- polish the manager approval popup further if needed
- cleaner mobile workflow
- stronger OCR validation rules
- Firestore data normalization
- production auth and user management
```

## File: README.md

```md
# SPD Field Sales Web App

Mobile-first internal web application for the workflow described in `spd workflow.pdf`.

## What is implemented

- Role-based dashboards for Sales Agent, Manager, and Accounting
- Cookie-based authentication with seeded demo users
- Workday session start/end tracking
- Odometer photo upload flow with mock OCR, agent confirmation, and manager fallback
- Site visit capture, lead tracking, follow-up prioritization, and stage/status updates
- Approval requests with manager approval/rejection
- Secondary task assignment from manager/accounting to agents
- Help/correction requests for missed entries
- Computed reimbursement ledger with CSV/XLSX export
- Prisma schema matching the intended PostgreSQL production data model
- File-backed local repository so the MVP can run before PostgreSQL is wired in

## Demo users

- Sales agent: `SA1001` / `password123`
- Manager: `MG2001` / `password123`
- Accounting: `AC3001` / `password123`

## Local setup

1. Install Node.js with `npm`.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Run `npm run dev`.

Uploads are stored in `public/uploads`, and local mock data is stored in `data/mock-db.json`.

## Firebase test mode

To run against your Firebase project instead of local mock storage:

1. Enable Firestore and Firebase Storage in your Firebase project.
2. Download a Firebase service account JSON file from Google Cloud / Firebase Admin settings.
3. Put the JSON file somewhere on your machine.
4. Add these values to `.env.local`:

```env
FIREBASE_SERVICE_ACCOUNT_JSON_PATH="C:/absolute/path/to/service-account.json"
FIREBASE_STORAGE_BUCKET="your-project-id.firebasestorage.app"
FIREBASE_USE_STORAGE="true"
FIREBASE_APP_STATE_COLLECTION="app_state"
FIREBASE_APP_STATE_DOC="main"
```

You can also use `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` instead of a JSON file, but the file path is easier on Windows.

When Firebase is configured:

- app data is stored in a Firestore document
- uploaded photos go to Firebase Storage
- the existing employee ID/password login flow continues to work, now backed by Firebase-stored data

If you want to test with Firestore but keep uploads on the local machine, set:

```env
FIREBASE_USE_STORAGE="false"
```

This Firebase adapter is designed for real workflow testing. It stores the current app state in one Firestore document for simplicity, which is fine for pilot testing but should be normalized into collections for production scale.

## Render + Supabase free path

If you want the zero-card testing path:

1. Host the Next.js app on Render as a web service.
2. Keep Firebase for app data.
3. Store uploaded photos in a public Supabase Storage bucket.

Add these environment variables in Render:

```env
SUPABASE_USE_STORAGE="true"
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
SUPABASE_STORAGE_BUCKET="spd-uploads"

FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="your-firebase-client-email"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_FIRESTORE_DATABASE_ID="spddata"
FIREBASE_USE_STORAGE="false"
FIREBASE_APP_STATE_COLLECTION="app_state"
FIREBASE_APP_STATE_DOC="main"
GEMINI_API_KEY="your-gemini-api-key"
```

Supabase bucket setup for this app:

- Create a bucket such as `spd-uploads`
- Mark it as `public`
- Keep the `service role key` server-side only; never expose it in browser code

Render deployment notes:

- Build command: `npm install && npm run build`
- Start command: `npm run start -- -p $PORT`
- Render free instances lose local filesystem changes, so do not use local uploads there

This free path is good for demos and small pilot testing. For larger multi-user pilots, move app data out of the single Firestore document shape and keep using durable object storage.

## Notes

- The OCR service is intentionally abstracted and currently uses a mock filename-based extractor.
- The repository layer is file-backed today, while `prisma/schema.prisma` is ready for PostgreSQL migration work.
- The default build does not run `prisma generate` yet because the MVP is not importing Prisma client in runtime code.
- Accounting export supports both CSV and XLSX endpoints.

## Tests

- `npm test` runs the reimbursement and OCR unit tests with Vitest.
```

## File: render.yaml

```yaml
services:
  - type: web
    name: spd-field-sales
    runtime: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm run start -- -p $PORT
    autoDeploy: true
```

## File: src\components\accounting\AccountingActions.tsx

```tsx
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
```

## File: src\components\agent\AgentActions.tsx

```tsx
"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ApprovalRequest, Lead, OdometerReading } from "@/lib/types";

type ActionSectionId = "odometer" | "site-visit" | "approval" | "help";

async function getLocationPayload() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: "", lng: "" };
  }

  return new Promise<{ lat: string; lng: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        }),
      () => resolve({ lat: "", lng: "" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

interface AgentActionPanelProps {
  leads: Lead[];
  approvals: ApprovalRequest[];
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

export function AgentActionPanel({ leads, approvals }: AgentActionPanelProps) {
  const [activeSection, setActiveSection] = useState<ActionSectionId>("odometer");
  const pendingApprovals = approvals.filter((approval) => approval.status === "PENDING").length;

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
        <OdometerUploadCard />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="02"
        title="Site Visit Entry"
        description="Save the site visit details, project notes, and next follow-up in one place."
        meta={`${leads.length} tracked lead${leads.length === 1 ? "" : "s"}`}
        isOpen={activeSection === "site-visit"}
        onOpen={() => setActiveSection("site-visit")}
      >
        <SiteVisitCard leads={leads} />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="03"
        title="Raise Approval Request"
        description="Send negotiated price requests to the manager without leaving the dashboard."
        meta={`${pendingApprovals} pending`}
        isOpen={activeSection === "approval"}
        onOpen={() => setActiveSection("approval")}
      >
        <ApprovalRequestCard leads={leads} approvals={approvals} />
      </ActionAccordionSection>

      <ActionAccordionSection
        step="04"
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

function OdometerUploadCard() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingReading, setPendingReading] = useState<OdometerReading | null>(null);

  async function submitReading(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const type = `${formData.get("type") ?? ""}`;

    if (!type) {
      setError("Select whether this is a start or end reading.");
      setBusy(false);
      return;
    }

    const location = await getLocationPayload();
    formData.set("lat", location.lat);
    formData.set("lng", location.lng);

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
    formElement.reset();
    setBusy(false);

    if (payload.reading?.status === "AWAITING_CONFIRMATION") {
      setPendingReading(payload.reading);
      setMessage("OCR finished. Confirm the extracted value before it moves into today's log.");
      return;
    }

    if (payload.reading?.status === "OCR_PENDING") {
      setPendingReading(null);
      setMessage("Upload received. OCR is still processing and will appear in Needs Action soon.");
      startTransition(() => router.refresh());
      return;
    }

    setPendingReading(null);
    setMessage("Uploaded. This reading moved to Reading History for manager review.");
    startTransition(() => router.refresh());
  }

  async function confirmReading() {
    if (!pendingReading) {
      return;
    }

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
    if (!pendingReading) {
      return;
    }

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
      <div className="field">
        <label htmlFor="type">Reading type</label>
        <select id="type" name="type" defaultValue="" required>
          <option value="" disabled>
            Select reading type
          </option>
          <option value="START">Start reading</option>
          <option value="END">End reading</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="photo">Photo</label>
        <input id="photo" name="photo" type="file" accept="image/*" required />
        <span className="hint">Use a clear dashboard photo. GPS watermark text can stay in the image.</span>
      </div>
      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
      {pendingReading ? (
        <div className="warning-box">
          Extracted value: <strong>{pendingReading.ocrValue ?? "Not found"}</strong>.
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
      <button className="button" type="submit" disabled={busy || isRefreshing}>
        {busy ? "Uploading..." : isRefreshing ? "Refreshing..." : "Upload reading"}
      </button>
    </form>
  );
}

function SiteVisitCard({ leads }: { leads: Lead[] }) {
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
    const location = await getLocationPayload();
    formData.set("lat", location.lat);
    formData.set("lng", location.lng);

    const response = await fetch("/api/site-visits", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    setBusy(false);
    setFeedback("Site visit recorded and lead summary updated.");
    form.reset();
    startTransition(() => router.refresh());
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="leadId">Existing lead</label>
        <select id="leadId" name="leadId" defaultValue="">
          <option value="">Create a new site lead</option>
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.siteName}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="siteName">Site name</label>
        <input id="siteName" name="siteName" required />
      </div>
      <div className="field">
        <label htmlFor="siteAddress">Site address</label>
        <input id="siteAddress" name="siteAddress" required />
      </div>
      <div className="field">
        <label htmlFor="arrivalPhoto">Arrival photo</label>
        <input id="arrivalPhoto" name="arrivalPhoto" type="file" accept="image/*" required />
      </div>
      <div className="field">
        <label htmlFor="stakeholders">Stakeholders</label>
        <textarea
          id="stakeholders"
          name="stakeholders"
          placeholder="Contractor Name, Phone&#10;Builder Name, Phone&#10;Supervisor Name, Phone"
          required
        />
      </div>
      <div className="three-grid">
        <div className="field">
          <label htmlFor="concreteGrade">Concrete grade</label>
          <input id="concreteGrade" name="concreteGrade" placeholder="M25" required />
        </div>
        <div className="field">
          <label htmlFor="quantityCum">Quantity (CUM)</label>
          <input id="quantityCum" name="quantityCum" type="number" min="0" step="0.01" required />
        </div>
        <div className="field">
          <label htmlFor="stageOfWork">Stage</label>
          <input id="stageOfWork" name="stageOfWork" placeholder="Slab / Foundation" required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="futureScope">Future scope</label>
        <textarea id="futureScope" name="futureScope" required />
      </div>
      <div className="three-grid">
        <div className="field">
          <label htmlFor="currentSupplier">Current supplier</label>
          <input id="currentSupplier" name="currentSupplier" required />
        </div>
        <div className="field">
          <label htmlFor="priceExpectation">Price expectation</label>
          <input id="priceExpectation" name="priceExpectation" required />
        </div>
        <div className="field">
          <label htmlFor="score">Score</label>
          <input id="score" name="score" type="number" min="1" max="10" required />
        </div>
      </div>
      <div className="three-grid">
        <div className="field">
          <label htmlFor="leadStage">Lead stage</label>
          <select id="leadStage" name="leadStage" defaultValue="TALKS">
            <option value="TALKS">Talks</option>
            <option value="NEGOTIATING">Negotiating</option>
            <option value="FINALIZED">Finalized</option>
            <option value="MISSED">Missed</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="nextFollowUpAt">Next follow-up</label>
          <input id="nextFollowUpAt" name="nextFollowUpAt" type="datetime-local" required />
        </div>
      </div>
      {feedback ? <div className="success-box">{feedback}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
      <button className="button" type="submit" disabled={busy || isRefreshing}>
        {busy ? "Saving..." : isRefreshing ? "Refreshing..." : "Save site visit"}
      </button>
    </form>
  );
}

function ApprovalRequestCard({ leads, approvals }: { leads: Lead[]; approvals: ApprovalRequest[] }) {
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
    const response = await fetch("/api/approval-requests", {
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
    setFeedback("Approval request submitted.");
    form.reset();
    startTransition(() => router.refresh());
  }

  return (
    <>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="leadId">Lead</label>
          <select id="leadId" name="leadId" defaultValue="" required>
            <option value="" disabled>
              Select lead
            </option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.siteName}
              </option>
            ))}
          </select>
        </div>
        <div className="three-grid">
          <div className="field">
            <label htmlFor="customerName">Client name</label>
            <input id="customerName" name="customerName" required />
          </div>
          <div className="field">
            <label htmlFor="grade">Concrete grade</label>
            <input id="grade" name="grade" required />
          </div>
          <div className="field">
            <label htmlFor="quantity">Total quantity</label>
            <input id="quantity" name="quantity" type="number" min="0" step="0.01" required />
          </div>
        </div>
        <div className="three-grid">
          <div className="field">
            <label htmlFor="requiredDate">Date of requirement</label>
            <input id="requiredDate" name="requiredDate" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="distanceFromPlantKm">Distance from plant (km)</label>
            <input id="distanceFromPlantKm" name="distanceFromPlantKm" type="number" min="0" step="0.1" required />
          </div>
          <div className="field">
            <label htmlFor="trafficCount">Number of traffic</label>
            <input id="trafficCount" name="trafficCount" type="number" min="0" required />
          </div>
        </div>
        <div className="three-grid">
          <div className="field">
            <label htmlFor="castingType">Casting type</label>
            <select id="castingType" name="castingType" defaultValue="Pump">
              <option value="Pump">Pump</option>
              <option value="Dump">Dump</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="quotedPrice">Final quoted price</label>
            <input id="quotedPrice" name="quotedPrice" type="number" min="0" step="0.01" required />
          </div>
        </div>
        {feedback ? <div className="success-box">{feedback}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button-secondary" type="submit" disabled={busy || isRefreshing}>
          {busy ? "Submitting..." : isRefreshing ? "Refreshing..." : "Submit request"}
        </button>
      </form>

      {approvals.length ? (
        <div className="data-list mt-16">
          {approvals.slice(0, 3).map((approval) => (
            <div key={approval.id} className="data-row">
              <div className="panel-header">
                <h4>{approval.customerName}</h4>
                <span className={`status-badge status-${approval.status.toLowerCase()}`}>{approval.status}</span>
              </div>
              <p>
                Qty {approval.quantity} CUM, quoted price {approval.quotedPrice}, requirement {approval.requiredDate}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
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
```

## File: src\components\agent\ReadingLogList.tsx

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { toIndiaTimeLabel } from "@/lib/date";
import { groupAgentReadings } from "@/lib/agent-dashboard";
import type { OdometerReading } from "@/lib/types";

function formatReadingValue(value: number | null, fallback: string) {
  return value ?? fallback;
}

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

interface ReadingRowProps {
  reading: OdometerReading;
  busy: boolean;
  onConfirm?: (readingId: string) => void;
  onReject?: (readingId: string) => void;
}

function ReadingRow({ reading, busy, onConfirm, onReject }: ReadingRowProps) {
  const isAwaitingConfirmation = reading.status === "AWAITING_CONFIRMATION";
  const isOcrPending = reading.status === "OCR_PENDING";

  return (
    <article className="reading-card">
      <div className="panel-header">
        <div>
          <h4>{reading.type} reading</h4>
          <p className="panel-copy">Captured {toIndiaTimeLabel(reading.capturedAt)}</p>
        </div>
        <StatusBadge value={reading.status} />
      </div>

      <div className="reading-stat-grid">
        <div className="reading-stat">
          <span className="reading-stat-label">Extracted value</span>
          <strong>{formatReadingValue(reading.ocrValue, "N/A")}</strong>
        </div>
        <div className="reading-stat">
          <span className="reading-stat-label">Final value</span>
          <strong>{formatReadingValue(reading.finalValue, "Pending")}</strong>
        </div>
      </div>

      {reading.verificationNote ? <p>{reading.verificationNote}</p> : null}
      {isOcrPending ? <p className="hint">OCR is still processing this image.</p> : null}

      <div className="button-row">
        {isAwaitingConfirmation && onConfirm ? (
          <button className="button" type="button" disabled={busy} onClick={() => onConfirm(reading.id)}>
            {busy ? "Saving..." : "Confirm reading"}
          </button>
        ) : null}
        {isAwaitingConfirmation && onReject ? (
          <button className="button-danger" type="button" disabled={busy} onClick={() => onReject(reading.id)}>
            {busy ? "Saving..." : "Send for review"}
          </button>
        ) : null}
        <a className="button-ghost" href={reading.photoUrl} target="_blank" rel="noreferrer">
          View photo
        </a>
      </div>
    </article>
  );
}

export function ReadingLogList({ readings }: { readings: OdometerReading[] }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [readingState, setReadingState] = useState(readings);
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const { needsAction, history } = groupAgentReadings(readingState);

  async function confirmReading(readingId: string) {
    setBusyId(readingId);
    setFeedback("");
    setError("");

    const response = await fetch(`/api/odometer-readings/${readingId}/confirm`, { method: "POST" });
    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    const payload = (await response.json()) as { reading?: OdometerReading };
    setReadingState((currentReadings) =>
      currentReadings.map((reading) =>
        reading.id === readingId ? (payload.reading ?? { ...reading, status: "CONFIRMED" }) : reading,
      ),
    );
    setBusyId("");
    setFeedback("Reading confirmed and moved to Reading History.");
    startTransition(() => router.refresh());
  }

  async function rejectReading(readingId: string) {
    setBusyId(readingId);
    setFeedback("");
    setError("");

    const response = await fetch(`/api/odometer-readings/${readingId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Agent marked OCR as incorrect from the reading log." }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    const payload = (await response.json()) as { reading?: OdometerReading };
    setReadingState((currentReadings) =>
      currentReadings.map((reading) =>
        reading.id === readingId
          ? (payload.reading ?? {
              ...reading,
              status: "MANUAL_REVIEW_REQUIRED",
              verificationNote: "Agent marked OCR as incorrect from the reading log.",
            })
          : reading,
      ),
    );
    setBusyId("");
    setFeedback("Reading sent to manager review and moved to Reading History.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="section-stack">
      <section className="daily-log-section">
        <div className="section-head">
          <div>
            <h3 className="section-title">Needs Action</h3>
            <p className="section-copy">Only reading items that still need agent attention stay visible here.</p>
          </div>
          <span className="status-badge status-awaiting_confirmation">{needsAction.length} active</span>
        </div>

        {needsAction.length ? (
          <div className="warning-box">
            {needsAction.length} reading item{needsAction.length === 1 ? "" : "s"} still need your attention.
          </div>
        ) : (
          <div className="note-box">No reading actions pending. Confirmed items now stay tucked inside history.</div>
        )}

        {feedback ? <div className="success-box">{feedback}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}

        <div className="data-list">
          {needsAction.map((reading) => (
            <ReadingRow
              key={reading.id}
              reading={reading}
              busy={(busyId === reading.id || isRefreshing) && reading.status === "AWAITING_CONFIRMATION"}
              onConfirm={reading.status === "AWAITING_CONFIRMATION" ? confirmReading : undefined}
              onReject={reading.status === "AWAITING_CONFIRMATION" ? rejectReading : undefined}
            />
          ))}
        </div>
      </section>

      {history.length ? (
        <details className="history-toggle">
          <summary>
            <span>Reading History ({history.length})</span>
            <span className="history-toggle-copy">Show resolved items</span>
          </summary>
          <div className="history-panel">
            <div className="data-list">
              {history.map((reading) => (
                <ReadingRow key={reading.id} reading={reading} busy={false} />
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
```

## File: src\components\agent\ReimbursementSummaryList.tsx

```tsx
import { toIndiaTimeLabel } from "@/lib/date";
import type { ReimbursementSummary } from "@/lib/types";

function renderValue(value: number | string | null) {
  return value ?? "-";
}

export function ReimbursementSummaryList({ summaries }: { summaries: ReimbursementSummary[] }) {
  if (!summaries.length) {
    return <div className="note-box">No reimbursement summaries available yet.</div>;
  }

  return (
    <>
      <div className="mobile-only summary-card-list">
        {summaries.map((summary) => (
          <article key={`${summary.userId}-${summary.date}`} className="summary-card">
            <div className="panel-header">
              <div>
                <h4>{summary.date}</h4>
                <p className="panel-copy">Daily reimbursement snapshot</p>
              </div>
              <span className={`status-badge status-${summary.status.toLowerCase()}`}>{summary.status}</span>
            </div>
            <div className="summary-card-grid">
              <div className="summary-cell">
                <span className="summary-label">Office in</span>
                <strong>{toIndiaTimeLabel(summary.officeInTime)}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Office out</span>
                <strong>{summary.officeOutTime ? toIndiaTimeLabel(summary.officeOutTime) : "-"}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Start</span>
                <strong>{renderValue(summary.startReading)}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">End</span>
                <strong>{renderValue(summary.endReading)}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Distance</span>
                <strong>{renderValue(summary.totalDistance)}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Visits</span>
                <strong>{summary.totalSiteVisits}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Lunch</span>
                <strong>{summary.lunchAmount}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="desktop-only table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Office In</th>
              <th>Start</th>
              <th>End</th>
              <th>Distance</th>
              <th>Visits</th>
              <th>Lunch</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={`${summary.userId}-${summary.date}`}>
                <td>{summary.date}</td>
                <td>{toIndiaTimeLabel(summary.officeInTime)}</td>
                <td>{renderValue(summary.startReading)}</td>
                <td>{renderValue(summary.endReading)}</td>
                <td>{renderValue(summary.totalDistance)}</td>
                <td>{summary.totalSiteVisits}</td>
                <td>{summary.lunchAmount}</td>
                <td>{summary.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

## File: src\components\AppShell.tsx

```tsx
import type { ReactNode } from "react";
import { toIndiaTimeLabel } from "@/lib/date";
import { isLoginDisabled } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import { LogoutButton } from "@/components/LogoutButton";
import type { User } from "@/lib/types";

interface AppShellProps {
  user: User;
  title: string;
  subtitle: string;
  statusLabel?: string;
  compact?: boolean;
  children: ReactNode;
}

export function AppShell({ user, title, subtitle, statusLabel, compact = false, children }: AppShellProps) {
  const loginDisabled = isLoginDisabled();

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
            {loginDisabled ? <DashboardSwitcher currentRole={user.role} /> : <LogoutButton />}
          </div>
        </div>
        <div className="hero-actions">
          <span className="status-badge status-open-good">{user.name}</span>
          <span className="status-badge status-talks">Employee ID {user.employeeId}</span>
          <span className="status-badge status-awaiting_confirmation">{toIndiaTimeLabel(new Date().toISOString())}</span>
          {loginDisabled ? <span className="status-badge status-manager_view">Login disabled for testing</span> : null}
        </div>
      </section>
      {children}
    </main>
  );
}
```

## File: src\components\DashboardSwitcher.tsx

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/types";

const ROLE_OPTIONS: Array<{ role: UserRole; label: string; path: string }> = [
  { role: "SALES_AGENT", label: "Agent", path: "/agent" },
  { role: "MANAGER", label: "Manager", path: "/manager" },
  { role: "ACCOUNTING", label: "Accounting", path: "/accounting" },
];

export function DashboardSwitcher({ currentRole }: { currentRole: UserRole }) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleSwitch(role: UserRole, path: string) {
    setError("");

    const response = await fetch("/api/auth/switch-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
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
        {isPending ? "Switching..." : `Switch: ${ROLE_OPTIONS.find((option) => option.role === currentRole)?.label ?? "Dashboard"}`}
      </summary>
      <div className="dashboard-switcher-menu">
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option.role}
            type="button"
            className={option.role === currentRole ? "dashboard-switcher-option is-active" : "dashboard-switcher-option"}
            disabled={isPending}
            onClick={() => void handleSwitch(option.role, option.path)}
          >
            {option.label}
          </button>
        ))}
        {error ? <div className="dashboard-switcher-error">{error}</div> : null}
      </div>
    </details>
  );
}
```

## File: src\components\LoginForm.tsx

```tsx
"use client";

import { useState } from "react";

async function getLocationPayload() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: "", lng: "" };
  }

  return new Promise<{ lat: string; lng: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        }),
      () => resolve({ lat: "", lng: "" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const employeeId = `${formData.get("employeeId") ?? ""}`.trim();
    const password = `${formData.get("password") ?? ""}`;

    const loginResponse = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, password }),
    });

    if (!loginResponse.ok) {
      const payload = await loginResponse.json().catch(() => ({ error: "Login failed." }));
      setError(payload.error ?? "Login failed.");
      setLoading(false);
      return;
    }

    const location = await getLocationPayload();
    await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(location),
    });

    window.location.href = "/dashboard";
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="employeeId">Employee ID</label>
        <input id="employeeId" name="employeeId" placeholder="SA1001" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" placeholder="password123" required />
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="button-row">
        <button className="button" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in and start workday"}
        </button>
      </div>
    </form>
  );
}
```

## File: src\components\LogoutButton.tsx

```tsx
"use client";

import { useState } from "react";

async function getLocationPayload() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: "", lng: "" };
  }

  return new Promise<{ lat: string; lng: string }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        }),
      () => resolve({ lat: "", lng: "" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    const location = await getLocationPayload();
    await fetch("/api/sessions/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(location),
    });
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <button type="button" className="button-ghost" onClick={handleLogout} disabled={busy}>
      {busy ? "Logging out..." : "Logout"}
    </button>
  );
}
```

## File: src\components\manager\ManagerActions.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toIndiaTimeLabel } from "@/lib/date";
import type { ApprovalRequest, HelpRequest, Lead, OdometerReading, Target, User } from "@/lib/types";

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

export function ManagerActions({
  agents,
  leads,
  verificationQueue,
  approvals,
  helpRequests,
  targets,
}: {
  agents: User[];
  leads: Lead[];
  verificationQueue: OdometerReading[];
  approvals: ApprovalRequest[];
  helpRequests: HelpRequest[];
  targets: Target[];
}) {
  return (
    <div className="panel-grid">
      <VerificationCard verificationQueue={verificationQueue} />
      <ApprovalDecisionCard approvals={approvals} agents={agents} leads={leads} />
      <TargetCard agents={agents} targets={targets} />
      <HelpResolutionCard helpRequests={helpRequests} />
      <TaskAssignmentCard agents={agents} />
    </div>
  );
}

export function VerificationCard({ verificationQueue }: { verificationQueue: OdometerReading[] }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function resolve(readingId: string, formData: FormData) {
    setBusyId(readingId);
    setError("");

    const response = await fetch(`/api/manager/verifications/${readingId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manualValue: formData.get(`manualValue-${readingId}`),
        note: formData.get(`note-${readingId}`),
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Manual Verification Queue</h2>
          <p className="panel-copy">Enter the correct reading when OCR fails or the agent rejects the result.</p>
        </div>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="data-list">
        {verificationQueue.length ? (
          verificationQueue.map((reading) => (
            <form key={reading.id} className="data-row" action={() => undefined}>
              <div className="panel-header">
                <h4>{reading.type} reading</h4>
                <a className="button-ghost" href={reading.photoUrl} target="_blank" rel="noreferrer">
                  View photo
                </a>
              </div>
              <p>{reading.verificationNote ?? "No note"}</p>
              <div className="three-grid">
                <div className="field">
                  <label htmlFor={`manualValue-${reading.id}`}>Manual value</label>
                  <input id={`manualValue-${reading.id}`} name={`manualValue-${reading.id}`} type="number" required />
                </div>
                <div className="field">
                  <label htmlFor={`note-${reading.id}`}>Audit note</label>
                  <input id={`note-${reading.id}`} name={`note-${reading.id}`} required />
                </div>
              </div>
              <button
                className="button"
                type="button"
                onClick={(event) => {
                  const formData = new FormData(event.currentTarget.form as HTMLFormElement);
                  void resolve(reading.id, formData);
                }}
                disabled={busyId === reading.id}
              >
                {busyId === reading.id ? "Saving..." : "Resolve"}
              </button>
            </form>
          ))
        ) : (
          <div className="success-box">No manual verification items are pending.</div>
        )}
      </div>
    </section>
  );
}

export function ApprovalDecisionCard({
  approvals,
  agents,
  leads,
}: {
  approvals: ApprovalRequest[];
  agents: User[];
  leads: Lead[];
}) {
  const [busyId, setBusyId] = useState("");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const pendingApprovals = approvals.filter((entry) => entry.status === "PENDING");
  const selectedApproval = pendingApprovals.find((entry) => entry.id === selectedApprovalId);
  const selectedLead = selectedApproval ? leads.find((entry) => entry.id === selectedApproval.leadId) : undefined;
  const selectedRequestedBy = selectedApproval ? agents.find((agent) => agent.id === selectedApproval.createdBy) : undefined;

  useEffect(() => {
    if (!selectedApprovalId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedApprovalId("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedApprovalId]);

  async function decide(id: string, status: "APPROVED" | "REJECTED", note: string) {
    setBusyId(id);
    const response = await fetch(`/api/approval-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, decisionNote: note }),
    });

    if (!response.ok) {
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Pending Approvals</h2>
          <p className="panel-copy">Managers are the only role allowed to approve or reject final prices.</p>
        </div>
      </div>
      <div className="data-list">
        {pendingApprovals.length ? (
          pendingApprovals.map((approval) => (
            <div key={approval.id} className="data-row">
              <button
                className="detail-toggle"
                type="button"
                onClick={() => setSelectedApprovalId(approval.id)}
                aria-haspopup="dialog"
                aria-expanded={selectedApprovalId === approval.id}
              >
                <div className="panel-header">
                  <h4>{approval.customerName}</h4>
                  <span className="status-badge status-pending">{approval.status}</span>
                </div>
                <p>
                  Grade {approval.grade}, quantity {approval.quantity}, quoted price {approval.quotedPrice}
                </p>
                <span className="hint">Tap to open full summary</span>
              </button>
              <div className="button-row">
                <button
                  className="button"
                  type="button"
                  disabled={busyId === approval.id}
                  onClick={() => void decide(approval.id, "APPROVED", "Approved from manager dashboard.")}
                >
                  Approve
                </button>
                <button
                  className="button-danger"
                  type="button"
                  disabled={busyId === approval.id}
                  onClick={() => void decide(approval.id, "REJECTED", "Rejected from manager dashboard.")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="success-box">No pending approvals right now.</div>
        )}
      </div>
      <ApprovalSummaryModal
        approval={selectedApproval}
        requestedBy={selectedRequestedBy}
        lead={selectedLead}
        busyId={busyId}
        onClose={() => setSelectedApprovalId("")}
        onDecide={decide}
      />
    </section>
  );
}

function ApprovalSummaryModal({
  approval,
  requestedBy,
  lead,
  busyId,
  onClose,
  onDecide,
}: {
  approval?: ApprovalRequest;
  requestedBy?: User;
  lead?: Lead;
  busyId: string;
  onClose: () => void;
  onDecide: (id: string, status: "APPROVED" | "REJECTED", note: string) => Promise<void>;
}) {
  if (!approval || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`approval-dialog-title-${approval.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card-header">
          <div>
            <div className="panel-header">
              <h3 id={`approval-dialog-title-${approval.id}`}>{approval.customerName}</h3>
              <span className="status-badge status-pending">{approval.status}</span>
            </div>
            <p className="panel-copy">Full approval summary for manager review.</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close approval summary">
            Close
          </button>
        </div>
        <div className="modal-scroll">
          <ApprovalDetails approval={approval} requestedBy={requestedBy} lead={lead} />
        </div>
        <div className="button-row">
          <button
            className="button"
            type="button"
            disabled={busyId === approval.id}
            onClick={() => void onDecide(approval.id, "APPROVED", "Approved from manager dashboard.")}
          >
            Approve
          </button>
          <button
            className="button-danger"
            type="button"
            disabled={busyId === approval.id}
            onClick={() => void onDecide(approval.id, "REJECTED", "Rejected from manager dashboard.")}
          >
            Reject
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ApprovalDetails({
  approval,
  requestedBy,
  lead,
}: {
  approval: ApprovalRequest;
  requestedBy?: User;
  lead?: Lead;
}) {
  return (
    <div className="details-grid">
      <DetailCell label="Customer" value={approval.customerName} />
      <DetailCell label="Requested by" value={requestedBy?.name ?? approval.createdBy} />
      <DetailCell label="Grade" value={approval.grade} />
      <DetailCell label="Quantity (CUM)" value={`${approval.quantity}`} />
      <DetailCell label="Quoted price" value={`${approval.quotedPrice}`} />
      <DetailCell label="Required date" value={toIndiaTimeLabel(approval.requiredDate)} />
      <DetailCell label="Distance from plant" value={`${approval.distanceFromPlantKm} km`} />
      <DetailCell label="Traffic count" value={`${approval.trafficCount}`} />
      <DetailCell label="Casting type" value={approval.castingType} />
      <DetailCell label="Request created" value={toIndiaTimeLabel(approval.createdAt)} />
      <DetailCell label="Lead ID" value={approval.leadId} />
      <DetailCell label="Decision note" value={approval.decisionNote ?? "Pending manager decision"} />
      <DetailCell label="Site name" value={lead?.siteName ?? "Not linked"} />
      <DetailCell label="Site address" value={lead?.siteAddress ?? "Not linked"} />
      <DetailCell label="Lead stage" value={lead?.stage ?? "Not linked"} />
      <DetailCell label="Lead score" value={lead ? `${lead.score}` : "Not linked"} />
      <DetailCell label="Current supplier" value={lead?.currentSupplier ?? "Not linked"} />
      <DetailCell label="Price expectation" value={lead?.priceExpectation ?? "Not linked"} />
      <DetailCell label="Future scope" value={lead?.futureScope ?? "Not linked"} />
      <DetailCell label="Next follow-up" value={lead ? toIndiaTimeLabel(lead.nextFollowUpAt) : "Not linked"} />
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-cell">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

export function TargetCard({ agents, targets }: { agents: User[]; targets: Target[] }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      return;
    }

    setMessage("Target saved.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Set Targets</h2>
          <p className="panel-copy">Targets drive the agent target-vs-achievement widget.</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="three-grid">
          <div className="field">
            <label htmlFor="agentId">Agent</label>
            <select id="agentId" name="agentId" defaultValue="" required>
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
            <label htmlFor="month">Month</label>
            <input id="month" name="month" type="month" required />
          </div>
          <div className="field">
            <label htmlFor="quantityTarget">Quantity target</label>
            <input id="quantityTarget" name="quantityTarget" type="number" min="0" step="0.01" required />
          </div>
        </div>
        {message ? <div className="success-box">{message}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button-secondary" type="submit">
          Save target
        </button>
      </form>
      <div className="data-list mt-16">
        {targets.slice(0, 5).map((target) => (
          <div key={target.id} className="data-row">
            <h4>{target.month}</h4>
            <p>Target quantity {target.quantityTarget}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HelpResolutionCard({ helpRequests }: { helpRequests: HelpRequest[] }) {
  const [busyId, setBusyId] = useState("");
  const openRequests = helpRequests.filter((entry) => entry.status === "OPEN");

  async function resolve(id: string) {
    setBusyId(id);
    const response = await fetch(`/api/help-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionNote: "Reviewed and resolved by manager." }),
    });

    if (!response.ok) {
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Correction Requests</h2>
          <p className="panel-copy">Resolve missed odometer or timing issues here.</p>
        </div>
      </div>
      <div className="data-list">
        {openRequests.length ? (
          openRequests.map((request) => (
            <div key={request.id} className="data-row">
              <h4>{request.requestedField}</h4>
              <p>{request.explanation}</p>
              <button className="button-ghost" type="button" disabled={busyId === request.id} onClick={() => void resolve(request.id)}>
                {busyId === request.id ? "Resolving..." : "Mark resolved"}
              </button>
            </div>
          ))
        ) : (
          <div className="success-box">No open correction requests.</div>
        )}
      </div>
    </section>
  );
}

export function TaskAssignmentCard({ agents }: { agents: User[] }) {
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
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Assign Secondary Task</h2>
          <p className="panel-copy">These tasks appear in the sales agent secondary task section.</p>
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
        <button className="button" type="submit">
          Assign task
        </button>
      </form>
    </section>
  );
}
```

## File: src\components\manager\ManagerWorkspace.tsx

```tsx
"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { toDateKey, toIndiaTimeLabel } from "@/lib/date";
import {
  ApprovalDecisionCard,
  HelpResolutionCard,
  TargetCard,
  TaskAssignmentCard,
  VerificationCard,
} from "@/components/manager/ManagerActions";
import type {
  ApprovalRequest,
  AuditLogEntry,
  CustomerAccount,
  CustomerInvoice,
  FleetVehicle,
  HelpRequest,
  Lead,
  ManagerDashboardData,
  MaterialCostSnapshot,
  OdometerReading,
  Plant,
  PlantPriceBenchmark,
  Target,
  Task,
  User,
  WorkdaySession,
} from "@/lib/types";

type ManagerPlantView = {
  plant: Plant;
  leads: Lead[];
  approvals: ApprovalRequest[];
  helpRequests: HelpRequest[];
  tasks: Task[];
  targets: Target[];
  verificationQueue: OdometerReading[];
  activity: AuditLogEntry[];
  fleetVehicles: FleetVehicle[];
  accounts: CustomerAccount[];
  invoices: CustomerInvoice[];
  materialCost: MaterialCostSnapshot | null;
  priceBenchmarks: PlantPriceBenchmark[];
  volumeSold: number;
  deliveryEfficiency: number;
  activeFleet: number;
  leadConversionRate: number;
  activeSites: number;
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
    badge: string;
  }>;
  aiSummary: string;
  profitabilityRows: Array<{
    grade: string;
    sellingPrice: number;
    estimatedCost: number;
    margin: number;
    ratio: number;
  }>;
  cashFlowRows: Array<{
    id: string;
    customerName: string;
    outstandingAmount: number;
    creditUsedPercent: number;
    dueInDays: number;
    reminderSuggested: boolean;
    alertLabel: string;
  }>;
  dsoDays: number;
};

const GRADE_RECIPES: Record<
  string,
  {
    cement: number;
    ggbs: number;
    flyAsh: number;
    aggregate: number;
    sand: number;
    diesel: number;
  }
> = {
  M20: { cement: 0.22, ggbs: 0.05, flyAsh: 0.07, aggregate: 1.08, sand: 0.52, diesel: 3.2 },
  M25: { cement: 0.25, ggbs: 0.06, flyAsh: 0.06, aggregate: 1.1, sand: 0.53, diesel: 3.3 },
  M30: { cement: 0.29, ggbs: 0.07, flyAsh: 0.05, aggregate: 1.12, sand: 0.55, diesel: 3.5 },
  M35: { cement: 0.32, ggbs: 0.08, flyAsh: 0.04, aggregate: 1.14, sand: 0.56, diesel: 3.7 },
};

function estimateCostPerCum(cost: MaterialCostSnapshot | null, grade: string) {
  if (!cost) {
    return 0;
  }

  const recipe = GRADE_RECIPES[grade] ?? GRADE_RECIPES.M25;
  const rawMaterialCost =
    recipe.cement * cost.cementPerTon +
    recipe.ggbs * cost.ggbsPerTon +
    recipe.flyAsh * cost.flyAshPerTon +
    recipe.aggregate * cost.aggregatePerTon +
    recipe.sand * cost.sandPerTon;
  const logisticsCost = recipe.diesel * cost.dieselPerLitre + 280;

  return Math.round(rawMaterialCost + logisticsCost);
}

function getAverageSellingPrice(priceBenchmarks: PlantPriceBenchmark[]) {
  if (!priceBenchmarks.length) {
    return 0;
  }

  return priceBenchmarks.reduce((sum, entry) => sum + entry.sellingPricePerCum, 0) / priceBenchmarks.length;
}

function getAuditPlantId(
  entry: AuditLogEntry,
  {
    leadsById,
    approvalsById,
    tasksById,
    helpRequestsById,
    sessionsById,
    readingsById,
    visitsById,
    targetsById,
    usersById,
  }: {
    leadsById: Map<string, Lead>;
    approvalsById: Map<string, ApprovalRequest>;
    tasksById: Map<string, Task>;
    helpRequestsById: Map<string, HelpRequest>;
    sessionsById: Map<string, WorkdaySession>;
    readingsById: Map<string, OdometerReading>;
    visitsById: Map<string, { plantId: string }>;
    targetsById: Map<string, Target>;
    usersById: Map<string, User>;
  },
) {
  if (entry.entityType === "Lead") {
    return leadsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "ApprovalRequest") {
    return approvalsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "Task") {
    return tasksById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "HelpRequest") {
    return helpRequestsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "WorkdaySession") {
    return sessionsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "OdometerReading") {
    const reading = readingsById.get(entry.entityId);
    return reading ? sessionsById.get(reading.sessionId)?.plantId ?? null : null;
  }

  if (entry.entityType === "SiteVisit") {
    return visitsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "Target") {
    const target = targetsById.get(entry.entityId);
    return target ? usersById.get(target.userId)?.homePlantId ?? null : null;
  }

  return usersById.get(entry.actorId)?.homePlantId ?? null;
}

function buildPlantViews(data: ManagerDashboardData) {
  const usersById = new Map<string, User>([data.user, ...data.agents].map((entry) => [entry.id, entry]));
  const leadsById = new Map(data.leads.map((entry) => [entry.id, entry]));
  const approvalsById = new Map(data.approvals.map((entry) => [entry.id, entry]));
  const tasksById = new Map(data.tasks.map((entry) => [entry.id, entry]));
  const helpRequestsById = new Map(data.helpRequests.map((entry) => [entry.id, entry]));
  const sessionsById = new Map(data.workdaySessions.map((entry) => [entry.id, entry]));
  const readingsById = new Map(data.odometerReadings.map((entry) => [entry.id, entry]));
  const visitsById = new Map(data.siteVisits.map((entry) => [entry.id, { plantId: entry.plantId }]));
  const targetsById = new Map(data.targets.map((entry) => [entry.id, entry]));

  return data.plants.map<ManagerPlantView>((plant) => {
    const leads = data.leads.filter((entry) => entry.plantId === plant.id);
    const approvals = data.approvals.filter((entry) => entry.plantId === plant.id);
    const helpRequests = data.helpRequests.filter((entry) => entry.plantId === plant.id);
    const tasks = data.tasks.filter((entry) => entry.plantId === plant.id);
    const targets = data.targets.filter((entry) => usersById.get(entry.userId)?.homePlantId === plant.id);
    const verificationQueue = data.verificationQueue.filter((entry) => sessionsById.get(entry.sessionId)?.plantId === plant.id);
    const activity = data.auditLogs.filter(
      (entry) =>
        getAuditPlantId(entry, {
          leadsById,
          approvalsById,
          tasksById,
          helpRequestsById,
          sessionsById,
          readingsById,
          visitsById,
          targetsById,
          usersById,
        }) === plant.id,
    );
    const fleetVehicles = data.fleetVehicles.filter((entry) => entry.plantId === plant.id);
    const accounts = data.customerAccounts.filter((entry) => entry.plantId === plant.id);
    const invoices = data.customerInvoices.filter((entry) => entry.plantId === plant.id);
    const materialCost =
      data.materialCostSnapshots
        .filter((entry) => entry.plantId === plant.id)
        .sort((left, right) => right.effectiveAt.localeCompare(left.effectiveAt))[0] ?? null;
    const priceBenchmarks = data.priceBenchmarks.filter((entry) => entry.plantId === plant.id);

    const averageSellingPrice = getAverageSellingPrice(priceBenchmarks);
    const volumeFromInvoices = averageSellingPrice
      ? Math.round(invoices.reduce((sum, invoice) => sum + invoice.amount, 0) / averageSellingPrice)
      : 0;
    const approvedQuantity = approvals
      .filter((entry) => entry.status === "APPROVED")
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const volumeSold = approvedQuantity || volumeFromInvoices;
    const activeFleet = fleetVehicles.filter((entry) => entry.status === "ACTIVE").length;
    const deliveryEfficiency = fleetVehicles.length
      ? Math.round(fleetVehicles.reduce((sum, vehicle) => sum + vehicle.onTimeRate, 0) / fleetVehicles.length)
      : 0;
    const activeSites = leads.filter((entry) => entry.stage !== "MISSED").length;
    const leadConversionRate = leads.length
      ? Math.round((leads.filter((entry) => entry.stage === "FINALIZED").length / leads.length) * 100)
      : 0;

    const profitabilityRows = priceBenchmarks.map((benchmark) => {
      const estimatedCost = estimateCostPerCum(materialCost, benchmark.grade);
      const margin = Math.max(benchmark.sellingPricePerCum - estimatedCost, 0);
      return {
        grade: benchmark.grade,
        sellingPrice: benchmark.sellingPricePerCum,
        estimatedCost,
        margin,
        ratio: Math.min(Math.max(Math.round((margin / Math.max(benchmark.sellingPricePerCum, 1)) * 100), 4), 92),
      };
    });

    const cashFlowRows = accounts.map((account) => {
      const relevantInvoices = invoices.filter((invoice) => invoice.accountId === account.id && invoice.status !== "PAID");
      const nearestDueAt = relevantInvoices
        .map((invoice) => new Date(invoice.dueAt).getTime())
        .sort((left, right) => left - right)[0];
      const dueInDays = nearestDueAt ? Math.ceil((nearestDueAt - Date.now()) / (24 * 60 * 60 * 1000)) : account.creditPeriodDays;
      const creditUsedPercent = Math.round((account.outstandingAmount / Math.max(account.creditLimit, 1)) * 100);
      const reminderSuggested = creditUsedPercent >= 90 || dueInDays <= 2;

      return {
        id: account.id,
        customerName: account.customerName,
        outstandingAmount: account.outstandingAmount,
        creditUsedPercent,
        dueInDays,
        reminderSuggested,
        alertLabel:
          creditUsedPercent >= 90
            ? "WhatsApp reminder suggested"
            : dueInDays < 0
              ? "Credit period exceeded"
              : "Within credit window",
      };
    });

    const dsoDays = invoices.length
      ? Math.round(
          invoices.reduce((sum, invoice) => {
            const settledAt = invoice.paidAt ? new Date(invoice.paidAt).getTime() : Date.now();
            return sum + Math.max(1, Math.round((settledAt - new Date(invoice.issuedAt).getTime()) / (24 * 60 * 60 * 1000)));
          }, 0) / invoices.length,
        )
      : 0;

    const notifications = [
      verificationQueue.length
        ? {
            id: `${plant.id}-verification`,
            title: `${verificationQueue.length} manual verification items`,
            detail: "Odometer readings are waiting for manager correction.",
            badge: "status-pending",
          }
        : null,
      approvals.filter((entry) => entry.status === "PENDING").length
        ? {
            id: `${plant.id}-approvals`,
            title: `${approvals.filter((entry) => entry.status === "PENDING").length} pending commercial decisions`,
            detail: "Final prices still need a manager decision.",
            badge: "status-danger",
          }
        : null,
      cashFlowRows.some((entry) => entry.creditUsedPercent >= 90)
        ? {
            id: `${plant.id}-cashflow`,
            title: "Credit threshold reached",
            detail: "One or more contractors crossed the 90% credit usage mark.",
            badge: "status-danger",
          }
        : null,
      fleetVehicles.some((entry) => entry.status === "SERVICE" || entry.status === "OFF_ROUTE")
        ? {
            id: `${plant.id}-fleet`,
            title: "Fleet efficiency watch",
            detail: "At least one vehicle is in service or off route.",
            badge: "status-manager_view",
          }
        : null,
      helpRequests.filter((entry) => entry.status === "OPEN").length
        ? {
            id: `${plant.id}-corrections`,
            title: `${helpRequests.filter((entry) => entry.status === "OPEN").length} open corrections`,
            detail: "Agents are waiting on exception handling.",
            badge: "status-approved",
          }
        : null,
    ].filter(Boolean) as Array<{ id: string; title: string; detail: string; badge: string }>;

    const aiSummary = `${verificationQueue.length} readings are waiting for review, ${approvals.filter((entry) => entry.status === "PENDING").length} commercial approvals are pending, ${cashFlowRows.filter((entry) => entry.reminderSuggested).length} contractor accounts need payment attention, and delivery efficiency is ${deliveryEfficiency}% for ${plant.name}.`;

    return {
      plant,
      leads,
      approvals,
      helpRequests,
      tasks,
      targets,
      verificationQueue,
      activity,
      fleetVehicles,
      accounts,
      invoices,
      materialCost,
      priceBenchmarks,
      volumeSold,
      deliveryEfficiency,
      activeFleet,
      leadConversionRate,
      activeSites,
      notifications,
      aiSummary,
      profitabilityRows,
      cashFlowRows,
      dsoDays,
    };
  });
}

export function ManagerWorkspace({ data }: { data: ManagerDashboardData }) {
  const plantViews = useMemo(() => buildPlantViews(data), [data]);
  const [selectedPlantId, setSelectedPlantId] = useState(plantViews[0]?.plant.id ?? "");
  const [hubOpen, setHubOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyType, setHistoryType] = useState("ALL");
  const [historyDate, setHistoryDate] = useState("");

  const selectedPlant = plantViews.find((entry) => entry.plant.id === selectedPlantId) ?? plantViews[0];
  const usersById = new Map<string, User>([data.user, ...data.agents].map((entry) => [entry.id, entry]));

  if (!selectedPlant) {
    return (
      <div className="note-box mt-24">
        No plant configuration is available yet. Add plant definitions to continue with the manager dashboard.
      </div>
    );
  }

  const historyTypes = Array.from(new Set(selectedPlant.activity.flatMap((entry) => [entry.entityType, entry.action])));
  const filteredHistory = selectedPlant.activity.filter((entry) => {
    const actorName = usersById.get(entry.actorId)?.name ?? entry.actorRole;
    const matchesQuery =
      !historyQuery ||
      `${entry.action} ${entry.entityType} ${entry.detail} ${actorName}`.toLowerCase().includes(historyQuery.toLowerCase());
    const matchesType = historyType === "ALL" || entry.entityType === historyType || entry.action === historyType;
    const matchesDate = !historyDate || toDateKey(entry.createdAt) === historyDate;

    return matchesQuery && matchesType && matchesDate;
  });

  return (
    <>
      <section className="manager-command-bar mt-24">
        <div>
          <p className="metric-label">Operations Header</p>
          <h2 className="manager-command-title">SPD Concrete manager command center across plants, approvals, and cash flow.</h2>
          <p className="panel-copy">
            Use the plant switcher, notification hub, and log archive to keep the main dashboard focused on live decisions.
          </p>
        </div>
        <div className="button-row">
          <button className="button-ghost" type="button" onClick={() => setHubOpen((open) => !open)}>
            Bell Hub {selectedPlant.notifications.length ? `(${selectedPlant.notifications.length})` : ""}
          </button>
          <button className="button-ghost" type="button" onClick={() => setHistoryOpen(true)}>
            History
          </button>
        </div>
      </section>

      <section className="manager-plant-strip">
        <div className="manager-plant-strip-copy">
          <span className="metric-label">Multi-Plant Performance Switcher</span>
          <h3>{selectedPlant.plant.name}</h3>
          <p className="panel-copy">{selectedPlant.plant.region}</p>
        </div>
        <div className="manager-plant-tabs">
          {plantViews.map((entry) => (
            <button
              key={entry.plant.id}
              type="button"
              className={entry.plant.id === selectedPlant.plant.id ? "manager-plant-tab is-active" : "manager-plant-tab"}
              onClick={() => setSelectedPlantId(entry.plant.id)}
            >
              <span>{entry.plant.name}</span>
              <small>{entry.plant.region}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="manager-kpi-grid">
        <ManagerInsightCard
          label="Concrete volume sold"
          value={`${selectedPlant.volumeSold.toLocaleString()} m3`}
          note={`${Math.round((selectedPlant.volumeSold / Math.max(selectedPlant.plant.monthlyVolumeTarget, 1)) * 100)}% of ${selectedPlant.plant.monthlyVolumeTarget.toLocaleString()} m3 target`}
        />
        <ManagerInsightCard
          label="Fleet status"
          value={`${selectedPlant.activeFleet}/${selectedPlant.fleetVehicles.length}`}
          note={`${selectedPlant.deliveryEfficiency}% average delivery efficiency`}
        />
        <ManagerInsightCard
          label="Lead conversion"
          value={`${selectedPlant.leadConversionRate}%`}
          note="Based on finalized vs tracked leads for this plant"
        />
        <ManagerInsightCard
          label="Current active sites"
          value={selectedPlant.activeSites}
          note={`Target ${selectedPlant.plant.currentActiveSitesTarget} active sites`}
        />
      </section>

      <section className="manager-layout-grid">
        <div className="section-stack">
          <VerificationCard verificationQueue={selectedPlant.verificationQueue} />
          <TargetCard agents={data.agents.filter((agent) => agent.homePlantId === selectedPlant.plant.id)} targets={selectedPlant.targets} />
          <TaskAssignmentCard agents={data.agents.filter((agent) => agent.homePlantId === selectedPlant.plant.id)} />
        </div>

        <div className="section-stack">
          <ApprovalDecisionCard approvals={selectedPlant.approvals} agents={data.agents} leads={selectedPlant.leads} />
          <HelpResolutionCard helpRequests={selectedPlant.helpRequests} />
          <ProfitabilityPanel selectedPlant={selectedPlant} plantViews={plantViews} />
          <CashFlowPanel selectedPlant={selectedPlant} />
        </div>

        <div className="section-stack">
          <LeadAuditOverviewPanel selectedPlant={selectedPlant} />
          <ActivityStreamPanel selectedPlant={selectedPlant} usersById={usersById} />
        </div>
      </section>

      {hubOpen ? (
        <div className="manager-overlay-shell" onClick={() => setHubOpen(false)}>
          <div className="manager-overlay-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <h3>Smart Notification Hub</h3>
                <p className="panel-copy">Only live plant events appear here so the main workspace stays clean.</p>
              </div>
              <button className="button-ghost" type="button" onClick={() => setHubOpen(false)}>
                Close
              </button>
            </div>
            <div className="manager-summary-card">
              <span className="metric-label">AI summarized logs</span>
              <p>{selectedPlant.aiSummary}</p>
            </div>
            <div className="data-list mt-16">
              {selectedPlant.notifications.length ? (
                selectedPlant.notifications.map((item) => (
                  <div key={item.id} className="data-row">
                    <div className="panel-header">
                      <h4>{item.title}</h4>
                      <span className={`status-badge ${item.badge}`}>{item.badge.replace("status-", "").replaceAll("_", " ")}</span>
                    </div>
                    <p>{item.detail}</p>
                  </div>
                ))
              ) : (
                <div className="success-box">No active notifications for this plant right now.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="manager-drawer-shell" onClick={() => setHistoryOpen(false)}>
          <aside className="manager-history-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <h3>Log Archive</h3>
                <p className="panel-copy">Search by event type, date, or agent to inspect the plant activity history.</p>
              </div>
              <button className="button-ghost" type="button" onClick={() => setHistoryOpen(false)}>
                Close
              </button>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="historyQuery">Search</label>
                <input id="historyQuery" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search action, entity, or detail" />
              </div>
              <div className="three-grid">
                <div className="field">
                  <label htmlFor="historyType">Event type</label>
                  <select id="historyType" value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
                    <option value="ALL">All</option>
                    {historyTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="historyDate">Date</label>
                  <input id="historyDate" type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} />
                </div>
              </div>
            </div>

            <div className="data-list mt-16">
              {filteredHistory.length ? (
                filteredHistory.map((entry) => (
                  <div key={entry.id} className="data-row">
                    <div className="panel-header">
                      <h4>{entry.action}</h4>
                      <span className="metric-label">{entry.entityType}</span>
                    </div>
                    <p>{entry.detail}</p>
                    <div className="row-meta">
                      <span>{usersById.get(entry.actorId)?.name ?? entry.actorRole}</span>
                      <span>{toIndiaTimeLabel(entry.createdAt)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="note-box">No activity matched your archive filters.</div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function ManagerInsightCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <article className="manager-kpi-card">
      <span className="metric-label">{label}</span>
      <strong className="manager-kpi-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </article>
  );
}

function ProfitabilityPanel({
  selectedPlant,
  plantViews,
}: {
  selectedPlant: ManagerPlantView;
  plantViews: ManagerPlantView[];
}) {
  return (
    <Panel title="Live Profitability Section" description="Grade-based margin estimates built from structured material costs and price benchmarks.">
      <div className="profitability-list">
        {selectedPlant.profitabilityRows.length ? (
          selectedPlant.profitabilityRows.map((entry) => (
            <div key={entry.grade} className="profitability-row">
              <div className="panel-header">
                <h4>{entry.grade}</h4>
                <span className="metric-label">Margin Rs {entry.margin}</span>
              </div>
              <p>Selling Rs {entry.sellingPrice} | Estimated cost Rs {entry.estimatedCost}</p>
              <div className="heatbar-track">
                <span className="heatbar-fill" style={{ width: `${entry.ratio}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="note-box">No price benchmarks are configured for this plant yet.</div>
        )}
      </div>
      <div className="manager-summary-card mt-16">
        <span className="metric-label">Profitability heatmap</span>
        <div className="profitability-heatmap">
          {plantViews.map((entry) => {
            const averageMargin = entry.profitabilityRows.length
              ? Math.round(entry.profitabilityRows.reduce((sum, row) => sum + row.margin, 0) / entry.profitabilityRows.length)
              : 0;
            return (
              <div key={entry.plant.id} className="heatmap-row">
                <span>{entry.plant.name}</span>
                <div
                  className="heatmap-pill"
                  style={{
                    background:
                      averageMargin >= 900
                        ? "rgba(15, 118, 110, 0.18)"
                        : averageMargin >= 600
                          ? "rgba(180, 83, 9, 0.2)"
                          : "rgba(185, 28, 28, 0.18)",
                  }}
                >
                  Avg margin Rs {averageMargin}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function CashFlowPanel({ selectedPlant }: { selectedPlant: ManagerPlantView }) {
  const reminders = selectedPlant.cashFlowRows.filter((entry) => entry.reminderSuggested).length;

  return (
    <Panel title="Pending Payment & Cash Flow Tracker" description="Credit monitoring, DSO pressure, and reminder triggers based on structured receivables.">
      <div className="three-grid">
        <div className="summary-cell">
          <span className="summary-label">DSO alert</span>
          <strong>{selectedPlant.dsoDays} days</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Credit alarms</span>
          <strong>{selectedPlant.cashFlowRows.filter((entry) => entry.creditUsedPercent >= 85).length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Auto reminders</span>
          <strong>{reminders}</strong>
        </div>
      </div>
      <div className="data-list mt-16">
        {selectedPlant.cashFlowRows.length ? (
          selectedPlant.cashFlowRows.map((entry) => (
            <div key={entry.id} className="data-row">
              <div className="panel-header">
                <h4>{entry.customerName}</h4>
                <span className={entry.creditUsedPercent >= 90 ? "status-badge status-danger" : entry.creditUsedPercent >= 80 ? "status-badge status-pending" : "status-badge status-approved"}>
                  {entry.creditUsedPercent}% credit used
                </span>
              </div>
              <p>Outstanding Rs {entry.outstandingAmount.toLocaleString()} | Due in {entry.dueInDays} days</p>
              <div className="row-meta">
                <span>{entry.alertLabel}</span>
                <span>{entry.reminderSuggested ? "Reminder ready" : "Monitoring"}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="note-box">No customer credit profiles are linked to this plant yet.</div>
        )}
      </div>
    </Panel>
  );
}

function LeadAuditOverviewPanel({ selectedPlant }: { selectedPlant: ManagerPlantView }) {
  return (
    <Panel title="Lead And Audit Overview" description="Live site pipeline, talks/negotiation status, and summarized audit context.">
      <div className="manager-summary-card">
        <span className="metric-label">AI summarized logs</span>
        <p>{selectedPlant.aiSummary}</p>
      </div>
      <div className="data-list mt-16">
        {selectedPlant.leads.length ? (
          selectedPlant.leads.slice(0, 5).map((lead) => (
            <div key={lead.id} className="data-row">
              <div className="panel-header">
                <h4>{lead.siteName}</h4>
                <StatusBadge value={lead.stage} />
              </div>
              <div className="row-meta">
                <span>Score {lead.score}</span>
                <span>Follow-up {toIndiaTimeLabel(lead.nextFollowUpAt)}</span>
                <span>Grade {lead.currentConcreteGrade}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="note-box">No active leads are linked to this plant yet.</div>
        )}
      </div>
    </Panel>
  );
}

function ActivityStreamPanel({ selectedPlant, usersById }: { selectedPlant: ManagerPlantView; usersById: Map<string, User> }) {
  return (
    <Panel title="Activity Stream" description="Recent workday, task, OCR, approval, and manual verify actions for the selected plant.">
      <div className="activity-stream-list">
        {selectedPlant.activity.length ? (
          selectedPlant.activity.map((entry) => (
            <div key={entry.id} className="activity-stream-item">
              <span className="activity-stream-marker" />
              <div className="activity-stream-content">
                <div className="panel-header">
                  <h4>{entry.action}</h4>
                  <span className="metric-label">{entry.entityType}</span>
                </div>
                <p>{entry.detail}</p>
                <div className="row-meta">
                  <span>{usersById.get(entry.actorId)?.name ?? entry.actorRole}</span>
                  <span>{toIndiaTimeLabel(entry.createdAt)}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="note-box">No plant activity has been logged yet.</div>
        )}
      </div>
    </Panel>
  );
}
```

## File: src\components\MetricCard.tsx

```tsx
interface MetricCardProps {
  label: string;
  value: string | number;
  note?: string;
}

export function MetricCard({ label, value, note }: MetricCardProps) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {note ? <span className="metric-note">{note}</span> : null}
    </article>
  );
}
```

## File: src\components\Panel.tsx

```tsx
import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, description, action, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p className="panel-copy">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
```

## File: src\components\StatusBadge.tsx

```tsx
export function StatusBadge({ value }: { value: string }) {
  const className = `status-badge status-${value.toLowerCase()}`;
  return <span className={className}>{value.replaceAll("_", " ")}</span>;
}
```

## File: src\lib\agent-dashboard.ts

```ts
import type { OdometerReading, ReadingStatus } from "@/lib/types";

const NEEDS_ACTION_STATUSES = new Set<ReadingStatus>(["AWAITING_CONFIRMATION", "OCR_PENDING"]);
const HISTORY_STATUSES = new Set<ReadingStatus>(["CONFIRMED", "MANUAL_REVIEW_REQUIRED", "MANUAL_VERIFIED"]);

function sortReadingsNewestFirst(readings: OdometerReading[]) {
  return [...readings].sort((left, right) => {
    return new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime();
  });
}

export function groupAgentReadings(
  readings: OdometerReading[],
): {
  needsAction: OdometerReading[];
  history: OdometerReading[];
} {
  const sortedReadings = sortReadingsNewestFirst(readings);

  return {
    needsAction: sortedReadings.filter((reading) => NEEDS_ACTION_STATUSES.has(reading.status)),
    history: sortedReadings.filter((reading) => HISTORY_STATUSES.has(reading.status)),
  };
}
```

## File: src\lib\api.ts

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { LatLng, User, UserRole } from "@/lib/types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Something went wrong." },
    { status: 500 },
  );
}

export async function requireApiUser(roles?: UserRole[]) {
  const user = await getCurrentUser();

  if (!user) {
    throw new ApiError(401, "Please sign in first.");
  }

  if (roles && !roles.includes(user.role)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }

  return user;
}

export function parseLatLng(input: { lat?: unknown; lng?: unknown }) {
  const lat = Number(input.lat);
  const lng = Number(input.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng } satisfies LatLng;
}

export function requireString(value: FormDataEntryValue | string | null | undefined, message: string) {
  const normalized = `${value ?? ""}`.trim();

  if (!normalized) {
    throw new ApiError(400, message);
  }

  return normalized;
}

export function requireNumber(value: FormDataEntryValue | string | null | undefined, message: string) {
  const normalized = Number(`${value ?? ""}`);

  if (!Number.isFinite(normalized)) {
    throw new ApiError(400, message);
  }

  return normalized;
}

export function toIsoDateTime(value: string, message: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, message);
  }
  return date.toISOString();
}
```

## File: src\lib\auth.ts

```ts
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { readDatabase, updateDatabase } from "@/lib/db";
import { nowIso } from "@/lib/date";
import { verifyPassword } from "@/lib/password";
import type { User, UserRole } from "@/lib/types";

const COOKIE_NAME = "spd_auth_token";
const DEMO_ROLE_COOKIE_NAME = "spd_demo_role";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SWITCHABLE_ROLES: UserRole[] = ["SALES_AGENT", "MANAGER", "ACCOUNTING"];

export function isLoginDisabled() {
  return process.env.DISABLE_LOGIN === "true";
}

function normalizeRole(value: string | undefined): UserRole | null {
  if (!value) {
    return null;
  }

  return SWITCHABLE_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

export function getDashboardPathForRole(role: UserRole) {
  if (role === "SALES_AGENT") {
    return "/agent";
  }

  if (role === "MANAGER") {
    return "/manager";
  }

  return "/accounting";
}

async function getDemoUser() {
  const cookieStore = await cookies();
  const selectedRole = normalizeRole(cookieStore.get(DEMO_ROLE_COOKIE_NAME)?.value) ?? "SALES_AGENT";
  const database = await readDatabase();

  return (
    database.users.find((entry) => entry.role === selectedRole && entry.status === "ACTIVE") ??
    database.users.find((entry) => entry.status === "ACTIVE") ??
    null
  );
}

export async function setDemoRole(role: UserRole) {
  const cookieStore = await cookies();
  cookieStore.set(DEMO_ROLE_COOKIE_NAME, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
}

export async function loginWithEmployeeId(employeeId: string, password: string) {
  const database = await readDatabase();
  const user = database.users.find((entry) => entry.employeeId === employeeId && entry.status === "ACTIVE");

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await updateDatabase((draft) => {
    draft.authSessions = draft.authSessions.filter(
      (entry) => !(entry.userId === user.id && new Date(entry.expiresAt).getTime() < Date.now()),
    );
    draft.authSessions.push({
      id: randomUUID(),
      userId: user.id,
      token,
      createdAt: nowIso(),
      expiresAt,
    });
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires: new Date(expiresAt),
  });

  return user;
}

export async function logoutCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    await updateDatabase((draft) => {
      draft.authSessions = draft.authSessions.filter((entry) => entry.token !== token);
    });
  }

  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(DEMO_ROLE_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  if (isLoginDisabled()) {
    return getDemoUser();
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const database = await readDatabase();
  const authSession = database.authSessions.find(
    (entry) => entry.token === token && new Date(entry.expiresAt).getTime() > Date.now(),
  );

  if (!authSession) {
    return null;
  }

  return database.users.find((entry) => entry.id === authSession.userId) ?? null;
}

export async function requireUser(role?: UserRole) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (role && user.role !== role) {
    redirect("/dashboard");
  }

  return user;
}
```

## File: src\lib\date.ts

```ts
const INDIA_TIMEZONE = "Asia/Kolkata";

export function nowIso() {
  return new Date().toISOString();
}

export function toDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function toMonthKey(value: string | Date) {
  const key = toDateKey(value);
  return key.slice(0, 7);
}

export function toIndiaTimeLabel(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function isSameDate(value: string, dateKey: string) {
  return toDateKey(value) === dateKey;
}

export function compareIsoAsc(a: string, b: string) {
  return new Date(a).getTime() - new Date(b).getTime();
}
```

## File: src\lib\db.ts

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase-admin";
import { hashPassword } from "@/lib/password";
import type { Database, User } from "@/lib/types";
import { nowIso, toDateKey } from "@/lib/date";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "mock-db.json");
const DEFAULT_PLANT_IDS = ["plant-a", "plant-b", "plant-c"] as const;

function createUserSeed(employeeId: string, name: string, role: User["role"], password: string, homePlantId: string | null): User {
  return {
    id: randomUUID(),
    employeeId,
    name,
    role,
    status: "ACTIVE",
    homePlantId,
    passwordHash: hashPassword(password),
  };
}

function createPlantSeeds() {
  return [
    {
      id: DEFAULT_PLANT_IDS[0],
      code: "PLANT_A",
      name: "Plant A",
      region: "North Cluster",
      status: "ACTIVE" as const,
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 16,
    },
    {
      id: DEFAULT_PLANT_IDS[1],
      code: "PLANT_B",
      name: "Plant B",
      region: "Central Cluster",
      status: "WATCH" as const,
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 14,
    },
    {
      id: DEFAULT_PLANT_IDS[2],
      code: "PLANT_C",
      name: "Plant C",
      region: "South Cluster",
      status: "ACTIVE" as const,
      monthlyVolumeTarget: 5000,
      currentActiveSitesTarget: 12,
    },
  ];
}

function createFleetSeed() {
  const now = nowIso();

  return [
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      vehicleCode: "OD-02-AA-1101",
      driverName: "Prakash Jena",
      capacityCum: 6,
      status: "ACTIVE" as const,
      deliveriesToday: 5,
      onTimeRate: 94,
      lastDispatchAt: now,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      vehicleCode: "OD-02-AA-1148",
      driverName: "Madan Rout",
      capacityCum: 7,
      status: "IDLE" as const,
      deliveriesToday: 3,
      onTimeRate: 91,
      lastDispatchAt: now,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      vehicleCode: "OD-02-BB-2041",
      driverName: "Sanjay Das",
      capacityCum: 6,
      status: "ACTIVE" as const,
      deliveriesToday: 6,
      onTimeRate: 89,
      lastDispatchAt: now,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      vehicleCode: "OD-02-BB-2190",
      driverName: "Anil Patel",
      capacityCum: 8,
      status: "SERVICE" as const,
      deliveriesToday: 0,
      onTimeRate: 84,
      lastDispatchAt: null,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      vehicleCode: "OD-02-CC-3058",
      driverName: "Rakesh Sahu",
      capacityCum: 6,
      status: "ACTIVE" as const,
      deliveriesToday: 4,
      onTimeRate: 92,
      lastDispatchAt: now,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      vehicleCode: "OD-02-CC-3177",
      driverName: "Nikhil Barik",
      capacityCum: 6,
      status: "OFF_ROUTE" as const,
      deliveriesToday: 1,
      onTimeRate: 78,
      lastDispatchAt: now,
    },
  ];
}

function createMaterialCostSeeds() {
  const now = nowIso();

  return [
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      effectiveAt: now,
      cementPerTon: 7200,
      ggbsPerTon: 2680,
      flyAshPerTon: 1640,
      aggregatePerTon: 1120,
      sandPerTon: 980,
      dieselPerLitre: 92,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      effectiveAt: now,
      cementPerTon: 7340,
      ggbsPerTon: 2740,
      flyAshPerTon: 1680,
      aggregatePerTon: 1090,
      sandPerTon: 1020,
      dieselPerLitre: 94,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      effectiveAt: now,
      cementPerTon: 7100,
      ggbsPerTon: 2620,
      flyAshPerTon: 1590,
      aggregatePerTon: 1150,
      sandPerTon: 1010,
      dieselPerLitre: 91,
    },
  ];
}

function createPriceBenchmarkSeeds() {
  return [
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[0], grade: "M20", sellingPricePerCum: 4580 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[0], grade: "M25", sellingPricePerCum: 4760 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[0], grade: "M30", sellingPricePerCum: 5020 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[1], grade: "M20", sellingPricePerCum: 4620 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[1], grade: "M25", sellingPricePerCum: 4830 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[1], grade: "M30", sellingPricePerCum: 5110 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[2], grade: "M20", sellingPricePerCum: 4520 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[2], grade: "M25", sellingPricePerCum: 4700 },
    { id: randomUUID(), plantId: DEFAULT_PLANT_IDS[2], grade: "M30", sellingPricePerCum: 4970 },
  ];
}

function createCustomerAccountSeeds() {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      customerName: "JRM Buildcon",
      whatsappNumber: "+919876500111",
      creditLimit: 1200000,
      creditPeriodDays: 30,
      outstandingAmount: 560000,
      riskLevel: "MEDIUM" as const,
      lastPaymentAt: sixtyDaysAgo,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      customerName: "Sai Infra Projects",
      whatsappNumber: "+919876500222",
      creditLimit: 1450000,
      creditPeriodDays: 35,
      outstandingAmount: 910000,
      riskLevel: "HIGH" as const,
      lastPaymentAt: new Date(Date.now() - 41 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      customerName: "Nexus Constructions",
      whatsappNumber: "+919876500333",
      creditLimit: 980000,
      creditPeriodDays: 28,
      outstandingAmount: 320000,
      riskLevel: "LOW" as const,
      lastPaymentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

function createCustomerInvoiceSeeds(accountIds: string[]) {
  const now = Date.now();

  return [
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[0],
      accountId: accountIds[0],
      invoiceNumber: "SPA-2401",
      amount: 280000,
      issuedAt: new Date(now - 26 * 24 * 60 * 60 * 1000).toISOString(),
      dueAt: new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString(),
      status: "OPEN" as const,
      paidAt: null,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[1],
      accountId: accountIds[1],
      invoiceNumber: "SPB-1841",
      amount: 390000,
      issuedAt: new Date(now - 43 * 24 * 60 * 60 * 1000).toISOString(),
      dueAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: "OVERDUE" as const,
      paidAt: null,
    },
    {
      id: randomUUID(),
      plantId: DEFAULT_PLANT_IDS[2],
      accountId: accountIds[2],
      invoiceNumber: "SPC-1024",
      amount: 175000,
      issuedAt: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
      dueAt: new Date(now + 13 * 24 * 60 * 60 * 1000).toISOString(),
      status: "PARTIAL" as const,
      paidAt: null,
    },
  ];
}

function createSeedDatabase(): Database {
  const plants = createPlantSeeds();
  const salesAgent = createUserSeed("SA1001", "Ravi Sharma", "SALES_AGENT", "password123", DEFAULT_PLANT_IDS[0]);
  const manager = createUserSeed("MG2001", "Anita Verma", "MANAGER", "password123", null);
  const accounting = createUserSeed("AC3001", "Karan Gupta", "ACCOUNTING", "password123", null);
  const now = nowIso();
  const today = toDateKey(now);
  const customerAccounts = createCustomerAccountSeeds();

  return {
    users: [salesAgent, manager, accounting],
    authSessions: [],
    plants,
    workdaySessions: [],
    odometerReadings: [],
    siteVisits: [],
    leads: [],
    approvalRequests: [],
    tasks: [
      {
        id: randomUUID(),
        plantId: salesAgent.homePlantId ?? DEFAULT_PLANT_IDS[0],
        subject: "Collect dealer introduction",
        explanation: "Visit the newly added project lead and confirm the decision makers.",
        deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: "OPEN",
        assignedTo: salesAgent.id,
        assignedBy: manager.id,
      },
    ],
    helpRequests: [],
    targets: [
      {
        id: randomUUID(),
        userId: salesAgent.id,
        month: today.slice(0, 7),
        quantityTarget: 900,
      },
    ],
    auditLogs: [],
    fleetVehicles: createFleetSeed(),
    materialCostSnapshots: createMaterialCostSeeds(),
    priceBenchmarks: createPriceBenchmarkSeeds(),
    customerAccounts,
    customerInvoices: createCustomerInvoiceSeeds(customerAccounts.map((entry) => entry.id)),
  };
}

function getFallbackPlantId(database: Database) {
  return database.plants[0]?.id ?? DEFAULT_PLANT_IDS[0];
}

function normalizeDatabase(rawDatabase: Database) {
  const database = rawDatabase as Database & Partial<Database>;

  database.plants ??= createPlantSeeds();
  database.fleetVehicles ??= createFleetSeed();
  database.materialCostSnapshots ??= createMaterialCostSeeds();
  database.priceBenchmarks ??= createPriceBenchmarkSeeds();
  database.customerAccounts ??= createCustomerAccountSeeds();
  database.customerInvoices ??= createCustomerInvoiceSeeds(database.customerAccounts.map((entry) => entry.id));
  const fallbackPlantId = getFallbackPlantId(database as Database);

  const salesAgents = (database.users ?? []).filter((entry) => entry.role === "SALES_AGENT");
  salesAgents.forEach((user, index) => {
    user.homePlantId ??= database.plants[index % Math.max(database.plants.length, 1)]?.id ?? fallbackPlantId;
  });

  (database.users ?? [])
    .filter((entry) => entry.role !== "SALES_AGENT")
    .forEach((user) => {
      if (user.homePlantId === undefined) {
        user.homePlantId = null;
      }
    });

  (database.workdaySessions ?? []).forEach((session) => {
    session.plantId ??= database.users.find((entry) => entry.id === session.userId)?.homePlantId ?? fallbackPlantId;
  });

  (database.leads ?? []).forEach((lead) => {
    lead.plantId ??= database.users.find((entry) => entry.id === lead.agentId)?.homePlantId ?? fallbackPlantId;
  });

  (database.siteVisits ?? []).forEach((visit) => {
    visit.plantId ??=
      database.leads.find((entry) => entry.id === visit.leadId)?.plantId ??
      database.workdaySessions.find((entry) => entry.id === visit.sessionId)?.plantId ??
      fallbackPlantId;
  });

  (database.approvalRequests ?? []).forEach((approval) => {
    approval.plantId ??=
      database.leads.find((entry) => entry.id === approval.leadId)?.plantId ??
      database.users.find((entry) => entry.id === approval.createdBy)?.homePlantId ??
      fallbackPlantId;
  });

  (database.tasks ?? []).forEach((task) => {
    task.plantId ??= database.users.find((entry) => entry.id === task.assignedTo)?.homePlantId ?? fallbackPlantId;
  });

  (database.helpRequests ?? []).forEach((request) => {
    request.plantId ??= database.users.find((entry) => entry.id === request.agentId)?.homePlantId ?? fallbackPlantId;
  });

  return database as Database;
}

async function ensureDatabaseFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dbPath, "utf-8");
  } catch {
    await writeFile(dbPath, JSON.stringify(createSeedDatabase(), null, 2), "utf-8");
  }
}

function getFirebaseDocPath() {
  return {
    collection: process.env.FIREBASE_APP_STATE_COLLECTION?.trim() || "app_state",
    docId: process.env.FIREBASE_APP_STATE_DOC?.trim() || "main",
  };
}

async function ensureFirebaseDocument() {
  const firestore = await getFirebaseFirestore();
  const { collection, docId } = getFirebaseDocPath();
  const ref = firestore.collection(collection).doc(docId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    await ref.set(createSeedDatabase());
  }

  return ref;
}

export async function readDatabase(): Promise<Database> {
  if (await isFirebaseConfigured()) {
    const ref = await ensureFirebaseDocument();
    const snapshot = await ref.get();
    return normalizeDatabase(snapshot.data() as Database);
  }

  await ensureDatabaseFile();
  const content = await readFile(dbPath, "utf-8");
  return normalizeDatabase(JSON.parse(content) as Database);
}

export async function writeDatabase(database: Database) {
  if (await isFirebaseConfigured()) {
    const ref = await ensureFirebaseDocument();
    await ref.set(database);
    return;
  }

  await ensureDatabaseFile();
  await writeFile(dbPath, JSON.stringify(database, null, 2), "utf-8");
}

export async function updateDatabase<T>(updater: (database: Database) => Promise<T> | T) {
  if (await isFirebaseConfigured()) {
    const firestore = await getFirebaseFirestore();
    const { collection, docId } = getFirebaseDocPath();
    const ref = firestore.collection(collection).doc(docId);

    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const database = snapshot.exists ? (snapshot.data() as Database) : createSeedDatabase();
      const result = await updater(database);
      transaction.set(ref, database);
      return result;
    });
  }

  const database = await readDatabase();
  const result = await updater(database);
  await writeDatabase(database);
  return result;
}
```

## File: src\lib\firebase-admin.ts

```ts
import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

interface FirebaseServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

async function readServiceAccountFromFile() {
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH?.trim();

  if (!jsonPath) {
    return null;
  }

  const raw = await readFile(jsonPath, "utf-8");
  const parsed = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("The Firebase service account JSON file is missing required fields.");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  } satisfies FirebaseServiceAccount;
}

function readServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replaceAll("\\n", "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  } satisfies FirebaseServiceAccount;
}

let firebaseInitPromise: Promise<ReturnType<typeof initializeApp> | null> | null = null;

async function getServiceAccount() {
  return (await readServiceAccountFromFile()) ?? readServiceAccountFromEnv();
}

async function getFirebaseApp() {
  if (!firebaseInitPromise) {
    firebaseInitPromise = (async () => {
      const existing = getApps()[0];
      if (existing) {
        return existing;
      }

      const serviceAccount = await getServiceAccount();
      if (!serviceAccount) {
        return null;
      }

      return initializeApp({
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim() || undefined,
      });
    })();
  }

  return firebaseInitPromise;
}

export async function isFirebaseConfigured() {
  return Boolean(await getFirebaseApp());
}

export async function getFirebaseFirestore() {
  const app = await getFirebaseApp();

  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID?.trim();

  if (databaseId) {
    return getFirestore(app, databaseId);
  }

  return getFirestore(app);
}

export async function getFirebaseStorageBucket() {
  const app = await getFirebaseApp();

  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  return getStorage(app).bucket();
}
```

## File: src\lib\ocr.ts

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface OcrExtractionResult {
  value: number | null;
  confidence: number;
  note: string;
}

interface OcrInput {
  fileName: string;
  localAbsolutePath: string | null;
  photoUrl?: string | null;
  inlineBytesBase64?: string | null;
  mimeType: string | null;
}

function extractNumberFromText(text: string) {
  const normalized = text.replace(/[^\d\s]/g, " ");
  const matches = normalized.match(/\d{4,7}/g) ?? [];

  if (!matches.length) {
    return null;
  }

  // Prefer longer digit sequences first, then earliest match.
  return matches.sort((left, right) => right.length - left.length)[0] ?? null;
}

function fallbackFilenameOcr(fileName: string): OcrExtractionResult {
  const normalized = fileName.toLowerCase();
  const match = normalized.match(/(\d{4,7})/);

  if (match) {
    return {
      value: Number(match[1]),
      confidence: 0.88,
      note: "Fallback OCR matched a number sequence from the uploaded file name.",
    };
  }

  return {
    value: null,
    confidence: 0.34,
    note: "No reliable odometer value was found. Manual review is required.",
  };
}

function guessMimeType(fileName: string, mimeType: string | null) {
  if (mimeType) {
    return mimeType;
  }

  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".svg":
      return "image/svg+xml";
    default:
      return "image/jpeg";
  }
}

interface GeminiOcrPayload {
  reading_kind?: "ODO" | "TOTAL" | "TRIP" | "UNKNOWN";
  reading_value?: number | string | null;
  confidence?: number | null;
  note?: string | null;
}

export class OcrService {
  private getGeminiApiKey() {
    return process.env.GEMINI_API_KEY?.trim() || null;
  }

  private async runGeminiOcr(input: OcrInput): Promise<OcrExtractionResult | null> {
    const apiKey = this.getGeminiApiKey();

    if (!apiKey) {
      return null;
    }

    const inlineBytesBase64 = input.inlineBytesBase64?.trim() || null;
    let imageBase64 = inlineBytesBase64;

    if (!imageBase64 && input.localAbsolutePath) {
      const imageBytes = await readFile(input.localAbsolutePath);
      imageBase64 = imageBytes.toString("base64");
    }

    if (!imageBase64 && input.photoUrl) {
      const response = await fetch(input.photoUrl);
      if (!response.ok) {
        throw new Error(`Could not fetch uploaded image (${response.status}).`);
      }

      const imageBytes = Buffer.from(await response.arrayBuffer());
      imageBase64 = imageBytes.toString("base64");
    }

    if (!imageBase64) {
      return null;
    }

    const payload = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: guessMimeType(input.fileName, input.mimeType),
                data: imageBase64,
              },
            },
            {
              text: [
                "Read the vehicle dashboard image and extract the meter reading.",
                "Return JSON only.",
                'Use this schema: {"reading_kind":"ODO|TOTAL|TRIP|UNKNOWN","reading_value":number|null,"confidence":0_to_1,"note":"short note"}',
                "Rules:",
                "- Treat ODO, TOTAL, and TRIP as valid readings.",
                "- Do NOT reject TRIP readings.",
                "- Prefer the number next to ODO, TOTAL, or TRIP.",
                "- Ignore speed values like km/h, dial markings, tachometer scale, clock time, range, GPS watermark text, dates, map labels, coordinates, and location names.",
                "- For analog dashboards, read the central rolling odometer digits, not the circular speed scale.",
                "- If the image is blurry or uncertain, lower confidence.",
                "- reading_value should be numeric only, with decimal allowed for TRIP if visible.",
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Gemini API ${response.status}: ${message}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

    if (!text) {
      return {
        value: null,
        confidence: 0.3,
        note: "Gemini OCR returned no reading text.",
      };
    }

    let parsed: GeminiOcrPayload;

    try {
      parsed = JSON.parse(text) as GeminiOcrPayload;
    } catch {
      const matched = extractNumberFromText(text);
      return {
        value: matched ? Number(matched) : null,
        confidence: matched ? 0.58 : 0.32,
        note: `Gemini OCR returned non-JSON text. Parsed fallback text: ${text.slice(0, 140)}`,
      };
    }

    const rawValue = parsed.reading_value;
    const numericValue =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string" && rawValue.trim()
          ? Number(rawValue)
          : null;
    const value = numericValue !== null && Number.isFinite(numericValue) ? numericValue : null;
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(parsed.confidence, 1))
        : value !== null
          ? 0.78
          : 0.35;
    const kind = parsed.reading_kind ?? "UNKNOWN";

    return {
      value,
      confidence,
      note:
        parsed.note?.trim() ||
        `Gemini OCR detected a ${kind} reading${value !== null ? ` of ${value}` : ""}.`,
    };
  }

  async extractOdometerValue(input: OcrInput): Promise<OcrExtractionResult> {
    try {
      const geminiResult = await this.runGeminiOcr(input);
      if (geminiResult) {
        return geminiResult;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gemini OCR error.";
      const fallback = fallbackFilenameOcr(input.fileName);
      return {
        ...fallback,
        note: `Gemini OCR failed (${message}). ${fallback.note}`,
      };
    }

    return fallbackFilenameOcr(input.fileName);
  }
}

export const ocrService = new OcrService();
```

## File: src\lib\password.ts

```ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, hash: string) {
  const [salt, expectedHex] = hash.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return timingSafeEqual(actual, expected);
}
```

## File: src\lib\repository.ts

```ts
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { compareIsoAsc, nowIso, toDateKey, toMonthKey } from "@/lib/date";
import { readDatabase, updateDatabase } from "@/lib/db";
import { ocrService } from "@/lib/ocr";
import type {
  AccountingDashboardData,
  AgentDashboardData,
  ApprovalRequest,
  AuditLogEntry,
  Database,
  HelpRequest,
  LatLng,
  Lead,
  LeadStage,
  ManagerDashboardData,
  OdometerReading,
  ReadingType,
  ReimbursementSummary,
  SiteVisit,
  StakeholderContact,
  Target,
  Task,
  User,
} from "@/lib/types";

const LUNCH_AMOUNT = 150;

function assertRole(user: User, allowed: User["role"][]) {
  if (!allowed.includes(user.role)) {
    throw new Error("You do not have access to perform this action.");
  }
}

function getOpenSession(database: Database, userId: string, dateKey = toDateKey(nowIso())) {
  return database.workdaySessions.find(
    (session) => session.userId === userId && session.date === dateKey && session.status === "OPEN",
  );
}

function logAudit(database: Database, actor: User, entityType: string, entityId: string, action: string, detail: string) {
  const entry: AuditLogEntry = {
    id: randomUUID(),
    actorId: actor.id,
    actorRole: actor.role,
    entityType,
    entityId,
    action,
    detail,
    createdAt: nowIso(),
  };

  database.auditLogs.unshift(entry);
}

function sortLeads(leads: Lead[]) {
  return [...leads].sort((left, right) => {
    const followUpDiff = new Date(left.nextFollowUpAt).getTime() - new Date(right.nextFollowUpAt).getTime();
    if (followUpDiff !== 0) {
      return followUpDiff;
    }

    return right.score - left.score;
  });
}

function findUser(database: Database, userId: string) {
  const user = database.users.find((entry) => entry.id === userId);

  if (!user) {
    throw new Error("User not found.");
  }

  return user;
}

function getFallbackPlantId(database: Database) {
  const plantId = database.plants[0]?.id;

  if (!plantId) {
    throw new Error("No plants are configured.");
  }

  return plantId;
}

function getUserPlantId(database: Database, userId: string) {
  return findUser(database, userId).homePlantId ?? getFallbackPlantId(database);
}

function getReadingStatus(confirmedStart: number | null, confirmedEnd: number | null, readings: OdometerReading[]) {
  if (readings.some((entry) => entry.status === "MANUAL_VERIFIED")) {
    return "MANUAL_VERIFIED" as const;
  }

  if (confirmedStart !== null && confirmedEnd !== null) {
    return "CONFIRMED" as const;
  }

  if (readings.length > 0) {
    return "PENDING" as const;
  }

  return "OPEN" as const;
}

export function computeReimbursementSummaries(database: Database, userId?: string) {
  const relevantSessions = database.workdaySessions.filter((session) => (userId ? session.userId === userId : true));

  return relevantSessions
    .map<ReimbursementSummary>((session) => {
      const user = findUser(database, session.userId);
      const readings = database.odometerReadings
        .filter((entry) => entry.sessionId === session.id)
        .sort((left, right) => compareIsoAsc(left.capturedAt, right.capturedAt));
      const visits = database.siteVisits
        .filter((entry) => entry.sessionId === session.id)
        .sort((left, right) => compareIsoAsc(left.visitedAt, right.visitedAt));
      const startReading = readings.find((entry) => entry.type === "START" && entry.finalValue !== null);
      const endReading = [...readings].reverse().find((entry) => entry.type === "END" && entry.finalValue !== null);
      const totalDistance =
        startReading?.finalValue !== null &&
        startReading?.finalValue !== undefined &&
        endReading?.finalValue !== null &&
        endReading?.finalValue !== undefined
          ? Math.max(endReading.finalValue - startReading.finalValue, 0)
          : null;

      return {
        userId: session.userId,
        agentName: user.name,
        date: session.date,
        officeInTime: session.loginAt,
        siteVisitStartTime: visits[0]?.visitedAt ?? null,
        startReading: startReading?.finalValue ?? null,
        endReading: endReading?.finalValue ?? null,
        siteVisitEndTime: visits.at(-1)?.visitedAt ?? null,
        officeOutTime: session.logoutAt,
        totalDistance,
        totalSiteVisits: visits.length,
        lunchAmount: LUNCH_AMOUNT,
        status: getReadingStatus(startReading?.finalValue ?? null, endReading?.finalValue ?? null, readings),
      };
    })
    .sort((left, right) => (left.date === right.date ? left.agentName.localeCompare(right.agentName) : right.date.localeCompare(left.date)));
}

export async function startWorkdaySession(user: User, latLng: LatLng | null) {
  assertRole(user, ["SALES_AGENT"]);
  const today = toDateKey(nowIso());

  return updateDatabase((database) => {
    let session = getOpenSession(database, user.id, today);

    if (!session) {
      session = {
        id: randomUUID(),
        userId: user.id,
        plantId: getUserPlantId(database, user.id),
        date: today,
        loginAt: nowIso(),
        logoutAt: null,
        loginLatLng: latLng,
        logoutLatLng: null,
        status: "OPEN",
      };
      database.workdaySessions.push(session);
      logAudit(database, user, "WorkdaySession", session.id, "START", "Workday session started.");
    } else if (!session.loginLatLng && latLng) {
      session.loginLatLng = latLng;
    }

    return session;
  });
}

export async function endWorkdaySession(user: User, latLng: LatLng | null) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const session = getOpenSession(database, user.id);

    if (!session) {
      throw new Error("No open workday session found.");
    }

    session.logoutAt = nowIso();
    session.logoutLatLng = latLng;
    session.status = "CLOSED";
    logAudit(database, user, "WorkdaySession", session.id, "END", "Workday session closed.");

    return session;
  });
}

export async function createOdometerReading(
  user: User,
  input: {
    type: ReadingType;
    file: File;
    latLng: LatLng | null;
  },
) {
  assertRole(user, ["SALES_AGENT"]);
  const { readUploadedFileBuffer, saveUploadedFile } = await import("@/lib/storage");
  const fileBuffer = await readUploadedFileBuffer(input.file);
  const upload = await saveUploadedFile(input.file, fileBuffer);
  const ocr = await ocrService.extractOdometerValue({
    fileName: upload.originalFileName,
    localAbsolutePath: upload.localAbsolutePath,
    photoUrl: upload.photoUrl,
    inlineBytesBase64: fileBuffer.toString("base64"),
    mimeType: input.file.type || null,
  });

  return updateDatabase((database) => {
    const session = getOpenSession(database, user.id);

    if (!session) {
      throw new Error("Start the workday before uploading odometer readings.");
    }

    const reading: OdometerReading = {
      id: randomUUID(),
      sessionId: session.id,
      type: input.type,
      photoUrl: upload.photoUrl,
      originalFileName: upload.originalFileName,
      capturedAt: nowIso(),
      capturedLatLng: input.latLng,
      ocrValue: ocr.value,
      finalValue: ocr.confidence >= 0.7 ? ocr.value : null,
      ocrConfidence: ocr.confidence,
      status: ocr.confidence >= 0.7 && ocr.value !== null ? "AWAITING_CONFIRMATION" : "MANUAL_REVIEW_REQUIRED",
      verifiedBy: null,
      verificationNote: ocr.note,
    };

    database.odometerReadings.unshift(reading);
    logAudit(
      database,
      user,
      "OdometerReading",
      reading.id,
      "CREATE",
      `Uploaded ${input.type.toLowerCase()} odometer reading with OCR confidence ${ocr.confidence}.`,
    );

    return reading;
  });
}

export async function confirmOdometerReading(user: User, readingId: string) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session || session.userId !== user.id) {
      throw new Error("You can only confirm your own readings.");
    }

    reading.status = "CONFIRMED";
    reading.finalValue = reading.ocrValue;
    logAudit(database, user, "OdometerReading", reading.id, "CONFIRM", "Agent confirmed OCR result.");
    return reading;
  });
}

export async function rejectOdometerReading(user: User, readingId: string, note: string) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    const session = database.workdaySessions.find((entry) => entry.id === reading.sessionId);
    if (!session || session.userId !== user.id) {
      throw new Error("You can only reject your own readings.");
    }

    reading.status = "MANUAL_REVIEW_REQUIRED";
    reading.finalValue = null;
    reading.verificationNote = note || "Agent rejected OCR result.";
    logAudit(database, user, "OdometerReading", reading.id, "REJECT", reading.verificationNote);
    return reading;
  });
}

function normalizeStakeholders(input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map<StakeholderContact>((line, index) => {
      const [name = "", phone = ""] = line.split(",").map((part) => part.trim());
      const labels = ["Contractor", "Builder", "Supervisor"];
      return {
        label: labels[index] ?? `Stakeholder ${index + 1}`,
        name,
        phone,
      };
    });
}

export async function createSiteVisit(
  user: User,
  input: {
    file: File;
    leadId?: string | null;
    siteName: string;
    siteAddress: string;
    stakeholders: string;
    concreteGrade: string;
    quantityCum: number;
    stageOfWork: string;
    futureScope: string;
    currentSupplier: string;
    priceExpectation: string;
    score: number;
    leadStage: LeadStage;
    nextFollowUpAt: string;
    latLng: LatLng | null;
  },
) {
  assertRole(user, ["SALES_AGENT"]);
  const { saveUploadedFile } = await import("@/lib/storage");
  const upload = await saveUploadedFile(input.file);
  const stakeholders = normalizeStakeholders(input.stakeholders);

  return updateDatabase((database) => {
    const session = getOpenSession(database, user.id);

    if (!session) {
      throw new Error("Start the workday before creating site visits.");
    }

    let lead = input.leadId ? database.leads.find((entry) => entry.id === input.leadId) : undefined;

    if (!lead) {
      lead = {
        id: randomUUID(),
        agentId: user.id,
        plantId: getUserPlantId(database, user.id),
        siteName: input.siteName,
        siteAddress: input.siteAddress,
        score: input.score,
        stage: input.leadStage,
        nextFollowUpAt: input.nextFollowUpAt,
        lastVisitedAt: nowIso(),
        currentSupplier: input.currentSupplier,
        priceExpectation: input.priceExpectation,
        futureScope: input.futureScope,
        contractorName: stakeholders[0]?.name ?? "",
        builderName: stakeholders[1]?.name ?? "",
        supervisorName: stakeholders[2]?.name ?? "",
        supervisorPhone: stakeholders[2]?.phone ?? "",
        currentConcreteGrade: input.concreteGrade,
        currentQuantityCum: input.quantityCum,
      };
      database.leads.push(lead);
    } else {
      lead.siteName = input.siteName;
      lead.siteAddress = input.siteAddress;
      lead.score = input.score;
      lead.stage = input.leadStage;
      lead.nextFollowUpAt = input.nextFollowUpAt;
      lead.lastVisitedAt = nowIso();
      lead.currentSupplier = input.currentSupplier;
      lead.priceExpectation = input.priceExpectation;
      lead.futureScope = input.futureScope;
      lead.contractorName = stakeholders[0]?.name ?? lead.contractorName;
      lead.builderName = stakeholders[1]?.name ?? lead.builderName;
      lead.supervisorName = stakeholders[2]?.name ?? lead.supervisorName;
      lead.supervisorPhone = stakeholders[2]?.phone ?? lead.supervisorPhone;
      lead.currentConcreteGrade = input.concreteGrade;
      lead.currentQuantityCum = input.quantityCum;
    }

    const visit: SiteVisit = {
      id: randomUUID(),
      sessionId: session.id,
      leadId: lead.id,
      plantId: lead.plantId,
      siteName: input.siteName,
      siteAddress: input.siteAddress,
      arrivalPhotoUrl: upload.photoUrl,
      visitedAt: nowIso(),
      latLng: input.latLng,
      stakeholders,
      concreteGrade: input.concreteGrade,
      quantityCum: input.quantityCum,
      stageOfWork: input.stageOfWork,
      futureScope: input.futureScope,
      currentSupplier: input.currentSupplier,
      priceExpectation: input.priceExpectation,
      score: input.score,
      leadStage: input.leadStage,
      nextFollowUpAt: input.nextFollowUpAt,
    };

    database.siteVisits.unshift(visit);
    logAudit(database, user, "SiteVisit", visit.id, "CREATE", `Recorded site visit for ${input.siteName}.`);
    return visit;
  });
}

export async function listLeads(user: User) {
  const database = await readDatabase();
  const leads = user.role === "SALES_AGENT" ? database.leads.filter((entry) => entry.agentId === user.id) : database.leads;
  return sortLeads(leads);
}

export async function updateLead(
  user: User,
  leadId: string,
  input: Partial<Pick<Lead, "score" | "stage" | "nextFollowUpAt" | "futureScope" | "priceExpectation">>,
) {
  assertRole(user, ["SALES_AGENT", "MANAGER"]);

  return updateDatabase((database) => {
    const lead = database.leads.find((entry) => entry.id === leadId);

    if (!lead) {
      throw new Error("Lead not found.");
    }

    if (user.role === "SALES_AGENT" && lead.agentId !== user.id) {
      throw new Error("You can only update your own leads.");
    }

    Object.assign(lead, input);
    logAudit(database, user, "Lead", lead.id, "UPDATE", "Lead summary updated.");
    return lead;
  });
}

export async function createApprovalRequest(
  user: User,
  input: Omit<ApprovalRequest, "id" | "plantId" | "status" | "decidedBy" | "decidedAt" | "decisionNote" | "createdBy" | "createdAt">,
) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const lead = database.leads.find((entry) => entry.id === input.leadId);
    const approval: ApprovalRequest = {
      id: randomUUID(),
      plantId: lead?.plantId ?? getUserPlantId(database, user.id),
      ...input,
      status: "PENDING",
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdBy: user.id,
      createdAt: nowIso(),
    };

    database.approvalRequests.unshift(approval);
    logAudit(database, user, "ApprovalRequest", approval.id, "CREATE", "Created final price approval request.");
    return approval;
  });
}

export async function decideApprovalRequest(
  user: User,
  approvalId: string,
  status: "APPROVED" | "REJECTED",
  decisionNote: string,
) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const approval = database.approvalRequests.find((entry) => entry.id === approvalId);

    if (!approval) {
      throw new Error("Approval request not found.");
    }

    approval.status = status;
    approval.decisionNote = decisionNote;
    approval.decidedAt = nowIso();
    approval.decidedBy = user.id;
    logAudit(database, user, "ApprovalRequest", approval.id, status, decisionNote || "Approval decision updated.");
    return approval;
  });
}

export async function listVerificationQueue() {
  const database = await readDatabase();
  return database.odometerReadings
    .filter((entry) => entry.status === "MANUAL_REVIEW_REQUIRED")
    .sort((left, right) => compareIsoAsc(right.capturedAt, left.capturedAt));
}

export async function resolveVerification(user: User, readingId: string, manualValue: number, note: string) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const reading = database.odometerReadings.find((entry) => entry.id === readingId);

    if (!reading) {
      throw new Error("Odometer reading not found.");
    }

    reading.finalValue = manualValue;
    reading.status = "MANUAL_VERIFIED";
    reading.verifiedBy = user.id;
    reading.verificationNote = note;
    logAudit(database, user, "OdometerReading", reading.id, "MANUAL_VERIFY", note || "Manager entered manual reading.");
    return reading;
  });
}

export async function createTask(
  user: User,
  input: Omit<Task, "id" | "plantId" | "status" | "assignedBy">,
) {
  assertRole(user, ["MANAGER", "ACCOUNTING"]);

  return updateDatabase((database) => {
    const task: Task = {
      id: randomUUID(),
      plantId: getUserPlantId(database, input.assignedTo),
      subject: input.subject,
      explanation: input.explanation,
      deadline: input.deadline,
      status: "OPEN",
      assignedTo: input.assignedTo,
      assignedBy: user.id,
    };

    database.tasks.unshift(task);
    logAudit(database, user, "Task", task.id, "CREATE", `Assigned task ${task.subject}.`);
    return task;
  });
}

export async function createHelpRequest(
  user: User,
  input: Omit<HelpRequest, "id" | "agentId" | "plantId" | "status" | "resolvedBy" | "resolutionNote">,
) {
  assertRole(user, ["SALES_AGENT"]);

  return updateDatabase((database) => {
    const request: HelpRequest = {
      id: randomUUID(),
      agentId: user.id,
      plantId: getUserPlantId(database, user.id),
      sessionDate: input.sessionDate,
      requestedField: input.requestedField,
      explanation: input.explanation,
      status: "OPEN",
      resolvedBy: null,
      resolutionNote: null,
    };

    database.helpRequests.unshift(request);
    logAudit(database, user, "HelpRequest", request.id, "CREATE", `Raised correction request for ${request.requestedField}.`);
    return request;
  });
}

export async function resolveHelpRequest(user: User, requestId: string, resolutionNote: string) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    const request = database.helpRequests.find((entry) => entry.id === requestId);

    if (!request) {
      throw new Error("Help request not found.");
    }

    request.status = "RESOLVED";
    request.resolvedBy = user.id;
    request.resolutionNote = resolutionNote;
    logAudit(database, user, "HelpRequest", request.id, "RESOLVE", resolutionNote || "Correction request resolved.");
    return request;
  });
}

export async function upsertTarget(user: User, agentId: string, month: string, quantityTarget: number) {
  assertRole(user, ["MANAGER"]);

  return updateDatabase((database) => {
    let target = database.targets.find((entry) => entry.userId === agentId && entry.month === month);

    if (!target) {
      target = {
        id: randomUUID(),
        userId: agentId,
        month,
        quantityTarget,
      };
      database.targets.push(target);
    } else {
      target.quantityTarget = quantityTarget;
    }

    logAudit(database, user, "Target", target.id, "UPSERT", `Target set to ${quantityTarget} for ${month}.`);
    return target;
  });
}

export async function getAgentDashboardData(user: User): Promise<AgentDashboardData> {
  assertRole(user, ["SALES_AGENT"]);
  const database = await readDatabase();
  const activeSession = getOpenSession(database, user.id) ?? null;
  const sessionIds = database.workdaySessions.filter((entry) => entry.userId === user.id).map((entry) => entry.id);
  const readings = database.odometerReadings
    .filter((entry) => sessionIds.includes(entry.sessionId))
    .sort((left, right) => compareIsoAsc(right.capturedAt, left.capturedAt));
  const siteVisits = database.siteVisits
    .filter((entry) => sessionIds.includes(entry.sessionId))
    .sort((left, right) => compareIsoAsc(right.visitedAt, left.visitedAt));
  const approvals = database.approvalRequests
    .filter((entry) => entry.createdBy === user.id)
    .sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt));
  const reimbursementSummaries = computeReimbursementSummaries(database, user.id);
  const monthKey = toMonthKey(nowIso());
  const approvedQuantity = approvals.filter((entry) => entry.status === "APPROVED").reduce((sum, entry) => sum + entry.quantity, 0);
  const pipelineQuantity = approvals.filter((entry) => entry.status === "PENDING").reduce((sum, entry) => sum + entry.quantity, 0);

  return {
    user,
    activeSession,
    readings,
    siteVisits,
    leads: sortLeads(database.leads.filter((entry) => entry.agentId === user.id)),
    tasks: database.tasks.filter((entry) => entry.assignedTo === user.id).sort((left, right) => left.deadline.localeCompare(right.deadline)),
    approvals,
    targets: database.targets.filter((entry) => entry.userId === user.id && entry.month === monthKey),
    helpRequests: database.helpRequests.filter((entry) => entry.agentId === user.id),
    reimbursementSummaries,
    pipelineQuantity,
    approvedQuantity,
  };
}

export async function getManagerDashboardData(user: User): Promise<ManagerDashboardData> {
  assertRole(user, ["MANAGER"]);
  const database = await readDatabase();

  return {
    user,
    plants: database.plants,
    odometerReadings: database.odometerReadings,
    verificationQueue: await listVerificationQueue(),
    siteVisits: database.siteVisits,
    workdaySessions: database.workdaySessions,
    leads: sortLeads(database.leads),
    approvals: database.approvalRequests.sort((left, right) => compareIsoAsc(right.createdAt, left.createdAt)),
    helpRequests: database.helpRequests,
    tasks: database.tasks,
    targets: database.targets,
    auditLogs: database.auditLogs.slice(0, 60),
    agents: database.users.filter((entry) => entry.role === "SALES_AGENT"),
    fleetVehicles: database.fleetVehicles,
    materialCostSnapshots: database.materialCostSnapshots,
    priceBenchmarks: database.priceBenchmarks,
    customerAccounts: database.customerAccounts,
    customerInvoices: database.customerInvoices,
  };
}

export async function getAccountingDashboardData(user: User): Promise<AccountingDashboardData> {
  assertRole(user, ["ACCOUNTING"]);
  const database = await readDatabase();

  return {
    user,
    reimbursements: computeReimbursementSummaries(database),
    tasks: database.tasks,
    approvals: database.approvalRequests,
    agents: database.users.filter((entry) => entry.role === "SALES_AGENT"),
  };
}

export async function exportReimbursements(format: "csv" | "xlsx") {
  const database = await readDatabase();
  const summaries = computeReimbursementSummaries(database);
  const rows = summaries.map((entry) => ({
    Agent: entry.agentName,
    Date: entry.date,
    OfficeInTime: entry.officeInTime,
    SiteVisitStartTime: entry.siteVisitStartTime ?? "",
    StartReading: entry.startReading ?? "",
    EndReading: entry.endReading ?? "",
    SiteVisitEndTime: entry.siteVisitEndTime ?? "",
    OfficeOutTime: entry.officeOutTime ?? "",
    TotalDistance: entry.totalDistance ?? "",
    TotalSiteVisits: entry.totalSiteVisits,
    LunchAmount: entry.lunchAmount,
    Status: entry.status,
  }));

  if (format === "csv") {
    const header = Object.keys(rows[0] ?? {
      Agent: "",
      Date: "",
      OfficeInTime: "",
      SiteVisitStartTime: "",
      StartReading: "",
      EndReading: "",
      SiteVisitEndTime: "",
      OfficeOutTime: "",
      TotalDistance: "",
      TotalSiteVisits: "",
      LunchAmount: "",
      Status: "",
    });

    const csv = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => {
            const value = `${row[key as keyof typeof row] ?? ""}`.replaceAll('"', '""');
            return `"${value}"`;
          })
          .join(","),
      ),
    ].join("\n");

    return {
      content: Buffer.from(csv, "utf-8"),
      contentType: "text/csv",
      fileName: "reimbursements.csv",
    };
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reimbursements");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return {
    content: buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: "reimbursements.xlsx",
  };
}

export async function listUsersByRole(role: User["role"]) {
  const database = await readDatabase();
  return database.users.filter((entry) => entry.role === role && entry.status === "ACTIVE");
}
```

## File: src\lib\storage.ts

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getFirebaseStorageBucket, isFirebaseConfigured } from "@/lib/firebase-admin";

const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT?.trim() || "./public/uploads");

function shouldUseSupabaseStorage() {
  return process.env.SUPABASE_USE_STORAGE?.trim().toLowerCase() === "true";
}

function shouldUseFirebaseStorage() {
  return process.env.FIREBASE_USE_STORAGE?.trim().toLowerCase() === "true";
}

function getSupabaseStorageConfig() {
  const projectUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "") || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "";

  if (!projectUrl || !serviceRoleKey || !bucket) {
    return null;
  }

  return {
    projectUrl,
    serviceRoleKey,
    bucket,
  };
}

function buildSupabaseObjectPath(bucketPath: string) {
  return bucketPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function saveToSupabaseStorage(
  file: File,
  buffer: Buffer,
  bucketPath: string,
  mimeType: string,
) {
  const config = getSupabaseStorageConfig();

  if (!config) {
    throw new Error(
      "Supabase Storage is enabled, but SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_STORAGE_BUCKET is missing.",
    );
  }

  const objectPath = buildSupabaseObjectPath(bucketPath);
  const response = await fetch(`${config.projectUrl}/storage/v1/object/${config.bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "Content-Type": mimeType,
      "x-upsert": "false",
      "cache-control": "3600",
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase Storage upload failed (${response.status}): ${message}`);
  }

  return {
    photoUrl: `${config.projectUrl}/storage/v1/object/public/${config.bucket}/${objectPath}`,
    originalFileName: file.name || path.basename(bucketPath),
    localAbsolutePath: null,
  };
}

export async function readUploadedFileBuffer(file: File) {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes);
}

export async function saveUploadedFile(file: File, buffer?: Buffer) {
  const fileBuffer = buffer ?? (await readUploadedFileBuffer(file));
  const extension = path.extname(file.name || "") || ".jpg";
  const dateDir = new Date().toISOString().slice(0, 7);
  const relativeDir = path.join(dateDir);
  const fileName = `${randomUUID()}${extension}`;
  const absoluteDir = path.join(storageRoot, relativeDir);
  const absolutePath = path.join(absoluteDir, fileName);
  const bucketPath = `uploads/${relativeDir.replaceAll("\\", "/")}/${fileName}`;
  const mimeType = file.type || "application/octet-stream";

  if (shouldUseSupabaseStorage()) {
    return saveToSupabaseStorage(file, fileBuffer, bucketPath, mimeType);
  }

  if (shouldUseFirebaseStorage() && (await isFirebaseConfigured())) {
    const bucket = await getFirebaseStorageBucket();
    const storageFile = bucket.file(bucketPath);

    await storageFile.save(fileBuffer, {
      contentType: mimeType,
      resumable: false,
    });

    const [photoUrl] = await storageFile.getSignedUrl({
      action: "read",
      expires: "03-09-2491",
    });

    return {
      photoUrl,
      originalFileName: file.name || fileName,
      localAbsolutePath: null,
    };
  }

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, fileBuffer);

  return {
    photoUrl: `/uploads/${relativeDir.replaceAll("\\", "/")}/${fileName}`,
    originalFileName: file.name || fileName,
    localAbsolutePath: absolutePath,
  };
}
```

## File: src\lib\types.ts

```ts
export type UserRole = "SALES_AGENT" | "MANAGER" | "ACCOUNTING";
export type UserStatus = "ACTIVE" | "INACTIVE";
export type SessionStatus = "OPEN" | "CLOSED";
export type PlantStatus = "ACTIVE" | "WATCH" | "MAINTENANCE";
export type ReadingType = "START" | "END";
export type ReadingStatus =
  | "OCR_PENDING"
  | "AWAITING_CONFIRMATION"
  | "CONFIRMED"
  | "MANUAL_REVIEW_REQUIRED"
  | "MANUAL_VERIFIED";
export type LeadStage = "TALKS" | "NEGOTIATING" | "FINALIZED" | "MISSED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type TaskStatus = "OPEN" | "DONE";
export type HelpRequestStatus = "OPEN" | "RESOLVED";
export type FleetVehicleStatus = "ACTIVE" | "IDLE" | "SERVICE" | "OFF_ROUTE";
export type CreditRisk = "LOW" | "MEDIUM" | "HIGH";
export type InvoiceStatus = "OPEN" | "PAID" | "OVERDUE" | "PARTIAL";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface User {
  id: string;
  employeeId: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  homePlantId: string | null;
  passwordHash: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface WorkdaySession {
  id: string;
  userId: string;
  plantId: string;
  date: string;
  loginAt: string;
  logoutAt: string | null;
  loginLatLng: LatLng | null;
  logoutLatLng: LatLng | null;
  status: SessionStatus;
}

export interface OdometerReading {
  id: string;
  sessionId: string;
  type: ReadingType;
  photoUrl: string;
  originalFileName: string;
  capturedAt: string;
  capturedLatLng: LatLng | null;
  ocrValue: number | null;
  finalValue: number | null;
  ocrConfidence: number | null;
  status: ReadingStatus;
  verifiedBy: string | null;
  verificationNote: string | null;
}

export interface StakeholderContact {
  label: string;
  name: string;
  phone: string;
}

export interface SiteVisit {
  id: string;
  sessionId: string;
  leadId: string;
  plantId: string;
  siteName: string;
  siteAddress: string;
  arrivalPhotoUrl: string;
  visitedAt: string;
  latLng: LatLng | null;
  stakeholders: StakeholderContact[];
  concreteGrade: string;
  quantityCum: number;
  stageOfWork: string;
  futureScope: string;
  currentSupplier: string;
  priceExpectation: string;
  score: number;
  leadStage: LeadStage;
  nextFollowUpAt: string;
}

export interface Lead {
  id: string;
  agentId: string;
  plantId: string;
  siteName: string;
  siteAddress: string;
  score: number;
  stage: LeadStage;
  nextFollowUpAt: string;
  lastVisitedAt: string;
  currentSupplier: string;
  priceExpectation: string;
  futureScope: string;
  contractorName: string;
  builderName: string;
  supervisorName: string;
  supervisorPhone: string;
  currentConcreteGrade: string;
  currentQuantityCum: number;
}

export interface ApprovalRequest {
  id: string;
  leadId: string;
  plantId: string;
  customerName: string;
  grade: string;
  quantity: number;
  requiredDate: string;
  distanceFromPlantKm: number;
  trafficCount: number;
  castingType: string;
  quotedPrice: number;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Task {
  id: string;
  plantId: string;
  subject: string;
  explanation: string;
  deadline: string;
  status: TaskStatus;
  assignedTo: string;
  assignedBy: string;
}

export interface HelpRequest {
  id: string;
  agentId: string;
  plantId: string;
  sessionDate: string;
  requestedField: string;
  explanation: string;
  status: HelpRequestStatus;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface Target {
  id: string;
  userId: string;
  month: string;
  quantityTarget: number;
}

export interface Plant {
  id: string;
  code: string;
  name: string;
  region: string;
  status: PlantStatus;
  monthlyVolumeTarget: number;
  currentActiveSitesTarget: number;
}

export interface FleetVehicle {
  id: string;
  plantId: string;
  vehicleCode: string;
  driverName: string;
  capacityCum: number;
  status: FleetVehicleStatus;
  deliveriesToday: number;
  onTimeRate: number;
  lastDispatchAt: string | null;
}

export interface MaterialCostSnapshot {
  id: string;
  plantId: string;
  effectiveAt: string;
  cementPerTon: number;
  ggbsPerTon: number;
  flyAshPerTon: number;
  aggregatePerTon: number;
  sandPerTon: number;
  dieselPerLitre: number;
}

export interface PlantPriceBenchmark {
  id: string;
  plantId: string;
  grade: string;
  sellingPricePerCum: number;
}

export interface CustomerAccount {
  id: string;
  plantId: string;
  customerName: string;
  whatsappNumber: string;
  creditLimit: number;
  creditPeriodDays: number;
  outstandingAmount: number;
  riskLevel: CreditRisk;
  lastPaymentAt: string | null;
}

export interface CustomerInvoice {
  id: string;
  plantId: string;
  accountId: string;
  invoiceNumber: string;
  amount: number;
  issuedAt: string;
  dueAt: string;
  status: InvoiceStatus;
  paidAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorRole: UserRole;
  entityType: string;
  entityId: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface Database {
  users: User[];
  authSessions: AuthSession[];
  plants: Plant[];
  workdaySessions: WorkdaySession[];
  odometerReadings: OdometerReading[];
  siteVisits: SiteVisit[];
  leads: Lead[];
  approvalRequests: ApprovalRequest[];
  tasks: Task[];
  helpRequests: HelpRequest[];
  targets: Target[];
  auditLogs: AuditLogEntry[];
  fleetVehicles: FleetVehicle[];
  materialCostSnapshots: MaterialCostSnapshot[];
  priceBenchmarks: PlantPriceBenchmark[];
  customerAccounts: CustomerAccount[];
  customerInvoices: CustomerInvoice[];
}

export interface ReimbursementSummary {
  userId: string;
  agentName: string;
  date: string;
  officeInTime: string;
  siteVisitStartTime: string | null;
  startReading: number | null;
  endReading: number | null;
  siteVisitEndTime: string | null;
  officeOutTime: string | null;
  totalDistance: number | null;
  totalSiteVisits: number;
  lunchAmount: number;
  status: "CONFIRMED" | "PENDING" | "MANUAL_VERIFIED" | "OPEN";
}

export interface AgentDashboardData {
  user: User;
  activeSession: WorkdaySession | null;
  readings: OdometerReading[];
  siteVisits: SiteVisit[];
  leads: Lead[];
  tasks: Task[];
  approvals: ApprovalRequest[];
  targets: Target[];
  helpRequests: HelpRequest[];
  reimbursementSummaries: ReimbursementSummary[];
  pipelineQuantity: number;
  approvedQuantity: number;
}

export interface ManagerDashboardData {
  user: User;
  plants: Plant[];
  odometerReadings: OdometerReading[];
  verificationQueue: OdometerReading[];
  siteVisits: SiteVisit[];
  workdaySessions: WorkdaySession[];
  leads: Lead[];
  approvals: ApprovalRequest[];
  helpRequests: HelpRequest[];
  tasks: Task[];
  targets: Target[];
  auditLogs: AuditLogEntry[];
  agents: User[];
  fleetVehicles: FleetVehicle[];
  materialCostSnapshots: MaterialCostSnapshot[];
  priceBenchmarks: PlantPriceBenchmark[];
  customerAccounts: CustomerAccount[];
  customerInvoices: CustomerInvoice[];
}

export interface AccountingDashboardData {
  user: User;
  reimbursements: ReimbursementSummary[];
  tasks: Task[];
  approvals: ApprovalRequest[];
  agents: User[];
}
```

## File: tests\agent-dashboard.test.ts

```ts
import { describe, expect, it } from "vitest";
import { groupAgentReadings } from "@/lib/agent-dashboard";
import type { OdometerReading } from "@/lib/types";

const readings: OdometerReading[] = [
  {
    id: "reading-1",
    sessionId: "session-1",
    type: "START",
    photoUrl: "/uploads/start.jpg",
    originalFileName: "start.jpg",
    capturedAt: "2026-04-20T10:00:00.000Z",
    capturedLatLng: null,
    ocrValue: 12000,
    finalValue: 12000,
    ocrConfidence: 0.91,
    status: "CONFIRMED",
    verifiedBy: null,
    verificationNote: null,
  },
  {
    id: "reading-2",
    sessionId: "session-1",
    type: "END",
    photoUrl: "/uploads/end.jpg",
    originalFileName: "end.jpg",
    capturedAt: "2026-04-20T12:00:00.000Z",
    capturedLatLng: null,
    ocrValue: 12048,
    finalValue: 12048,
    ocrConfidence: 0.93,
    status: "AWAITING_CONFIRMATION",
    verifiedBy: null,
    verificationNote: null,
  },
  {
    id: "reading-3",
    sessionId: "session-1",
    type: "END",
    photoUrl: "/uploads/review.jpg",
    originalFileName: "review.jpg",
    capturedAt: "2026-04-20T11:00:00.000Z",
    capturedLatLng: null,
    ocrValue: null,
    finalValue: null,
    ocrConfidence: 0.24,
    status: "MANUAL_REVIEW_REQUIRED",
    verifiedBy: null,
    verificationNote: "Agent marked OCR as incorrect.",
  },
  {
    id: "reading-4",
    sessionId: "session-1",
    type: "START",
    photoUrl: "/uploads/pending.jpg",
    originalFileName: "pending.jpg",
    capturedAt: "2026-04-20T13:00:00.000Z",
    capturedLatLng: null,
    ocrValue: null,
    finalValue: null,
    ocrConfidence: null,
    status: "OCR_PENDING",
    verifiedBy: null,
    verificationNote: null,
  },
];

describe("groupAgentReadings", () => {
  it("shows only active statuses in the needs-action bucket", () => {
    const grouped = groupAgentReadings(readings);

    expect(grouped.needsAction.map((reading) => reading.id)).toEqual(["reading-4", "reading-2"]);
  });

  it("keeps confirmed and manager-review items in history", () => {
    const grouped = groupAgentReadings(readings);

    expect(grouped.history.map((reading) => reading.id)).toEqual(["reading-3", "reading-1"]);
  });
});
```

## File: tests\repository.test.ts

```ts
import { describe, expect, it } from "vitest";
import { computeReimbursementSummaries } from "@/lib/repository";
import { OcrService } from "@/lib/ocr";
import type { Database } from "@/lib/types";

const baseDatabase: Database = {
  users: [
    {
      id: "agent-1",
      employeeId: "SA1001",
      name: "Ravi Sharma",
      role: "SALES_AGENT",
      status: "ACTIVE",
      passwordHash: "hash",
    },
  ],
  authSessions: [],
  workdaySessions: [
    {
      id: "session-1",
      userId: "agent-1",
      date: "2026-04-20",
      loginAt: "2026-04-20T03:30:00.000Z",
      logoutAt: "2026-04-20T13:30:00.000Z",
      loginLatLng: { lat: 22.5726, lng: 88.3639 },
      logoutLatLng: { lat: 22.5726, lng: 88.3639 },
      status: "CLOSED",
    },
  ],
  odometerReadings: [
    {
      id: "reading-1",
      sessionId: "session-1",
      type: "START",
      photoUrl: "/uploads/start.jpg",
      originalFileName: "start-12000.jpg",
      capturedAt: "2026-04-20T03:40:00.000Z",
      capturedLatLng: null,
      ocrValue: 12000,
      finalValue: 12000,
      ocrConfidence: 0.89,
      status: "CONFIRMED",
      verifiedBy: null,
      verificationNote: null,
    },
    {
      id: "reading-2",
      sessionId: "session-1",
      type: "END",
      photoUrl: "/uploads/end.jpg",
      originalFileName: "end-12048.jpg",
      capturedAt: "2026-04-20T13:00:00.000Z",
      capturedLatLng: null,
      ocrValue: 12048,
      finalValue: 12048,
      ocrConfidence: 0.91,
      status: "CONFIRMED",
      verifiedBy: null,
      verificationNote: null,
    },
  ],
  siteVisits: [
    {
      id: "visit-1",
      sessionId: "session-1",
      leadId: "lead-1",
      siteName: "Metro Residency",
      siteAddress: "Kolkata",
      arrivalPhotoUrl: "/uploads/site.jpg",
      visitedAt: "2026-04-20T06:00:00.000Z",
      latLng: null,
      stakeholders: [],
      concreteGrade: "M25",
      quantityCum: 120,
      stageOfWork: "Slab",
      futureScope: "Tower B",
      currentSupplier: "ABC",
      priceExpectation: "5300",
      score: 8,
      leadStage: "NEGOTIATING",
      nextFollowUpAt: "2026-04-22T05:30:00.000Z",
    },
  ],
  leads: [],
  approvalRequests: [],
  tasks: [],
  helpRequests: [],
  targets: [],
  auditLogs: [],
};

describe("computeReimbursementSummaries", () => {
  it("computes total distance and visit counts from confirmed readings", () => {
    const summaries = computeReimbursementSummaries(baseDatabase, "agent-1");

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.startReading).toBe(12000);
    expect(summaries[0]?.endReading).toBe(12048);
    expect(summaries[0]?.totalDistance).toBe(48);
    expect(summaries[0]?.totalSiteVisits).toBe(1);
    expect(summaries[0]?.status).toBe("CONFIRMED");
  });

  it("marks the day as manual verified when any reading was manually overridden", () => {
    const database: Database = {
      ...baseDatabase,
      odometerReadings: baseDatabase.odometerReadings.map((entry, index) =>
        index === 1 ? { ...entry, status: "MANUAL_VERIFIED" } : entry,
      ),
    };

    const summaries = computeReimbursementSummaries(database, "agent-1");
    expect(summaries[0]?.status).toBe("MANUAL_VERIFIED");
  });
});

describe("OcrService", () => {
  it("extracts a likely odometer number from the file name", async () => {
    const service = new OcrService();
    const result = await service.extractOdometerValue({
      fileName: "odo-15432.jpg",
      localAbsolutePath: null,
    });
    expect(result.value).toBe(15432);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("falls back to manual review when no number is present", async () => {
    const service = new OcrService();
    const result = await service.extractOdometerValue({
      fileName: "dashboard-photo.jpg",
      localAbsolutePath: null,
    });
    expect(result.value).toBeNull();
    expect(result.confidence).toBeLessThan(0.7);
  });
});
```

## File: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": [
      "dom",
      "dom.iterable",
      "es2022"
    ],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

## File: vitest.config.ts

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

