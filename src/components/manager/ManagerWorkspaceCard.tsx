import Link from "next/link";

interface ManagerWorkspaceCardProps {
  eyebrow: string;
  title: string;
  value: string | number;
  note: string;
  href: string;
  cta?: string;
}

export function ManagerWorkspaceCard({
  eyebrow,
  title,
  value,
  note,
  href,
  cta = "Open workspace",
}: ManagerWorkspaceCardProps) {
  return (
    <article className="manager-workspace-card">
      <span className="metric-label">{eyebrow}</span>
      <h3>{title}</h3>
      <strong className="manager-workspace-value">{value}</strong>
      <p>{note}</p>
      <Link className="button" href={href}>
        {cta}
      </Link>
    </article>
  );
}
