import Link from "next/link";

const MANAGER_SECTIONS = [
  {
    key: "overview",
    href: "/manager",
    label: "Overview",
    note: "Command center",
  },
  {
    key: "tracking",
    href: "/manager/tracking",
    label: "Tracking",
    note: "Agent day activity",
  },
  {
    key: "approvals",
    href: "/manager/approvals",
    label: "Approvals",
    note: "Commercial decisions",
  },
  {
    key: "orders",
    href: "/manager/orders",
    label: "Schedules",
    note: "Production approvals",
  },
  {
    key: "verifications",
    href: "/manager/verifications",
    label: "Verifications",
    note: "Odometer review",
  },
  {
    key: "corrections",
    href: "/manager/corrections",
    label: "Corrections",
    note: "Agent exceptions",
  },
  {
    key: "targets",
    href: "/manager/targets",
    label: "Targets",
    note: "Monthly goals",
  },
  {
    key: "tasks",
    href: "/manager/tasks",
    label: "Tasks",
    note: "Secondary assignments",
  },
];

export function ManagerSectionNav({ current }: { current: string }) {
  return (
    <nav className="manager-section-nav mt-24" aria-label="Manager sections">
      {MANAGER_SECTIONS.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          className={section.key === current ? "manager-section-link is-active" : "manager-section-link"}
        >
          <span>{section.label}</span>
          <small>{section.note}</small>
        </Link>
      ))}
    </nav>
  );
}
