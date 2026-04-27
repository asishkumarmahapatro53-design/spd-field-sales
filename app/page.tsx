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
              <span className="metric-label">Ravi Sharma</span>
              <strong className="metric-value">SA1001</strong>
              <span className="metric-note">Password: password123</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Prasana Dash</span>
              <strong className="metric-value">SA1002</strong>
              <span className="metric-note">Password: password123</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Amit Parida</span>
              <strong className="metric-value">SA1003</strong>
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
            <article className="metric-card">
              <span className="metric-label">Mix Design demo</span>
              <strong className="metric-value">MD5001</strong>
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
