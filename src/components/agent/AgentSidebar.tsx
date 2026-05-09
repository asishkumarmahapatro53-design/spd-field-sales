import Link from "next/link";

export type AgentNavKey =
  | "overview"
  | "odometer"
  | "site-visit"
  | "instant-price"
  | "informal-quotation"
  | "approval"
  | "sales-order"
  | "order-status"
  | "leads"
  | "logs"
  | "help";

type IconName =
  | "home"
  | "route"
  | "queue"
  | "inventory"
  | "check"
  | "target"
  | "journal"
  | "help";

interface AgentNavItem {
  key: AgentNavKey;
  href: string;
  label: string;
  note: string;
  icon: IconName;
  group: "Navigation";
}

const AGENT_NAV_ITEMS: AgentNavItem[] = [
  { key: "overview", href: "/agent", label: "Today's Route", note: "Command view", icon: "route", group: "Navigation" },
  { key: "logs", href: "/agent/logs", label: "Work Queue", note: "Logs and claims", icon: "queue", group: "Navigation" },
  { key: "leads", href: "/agent/leads", label: "Lead Focus", note: "Follow-ups", icon: "target", group: "Navigation" },
  { key: "approval", href: "/agent/approval", label: "Approvals", note: "Manager terms", icon: "check", group: "Navigation" },
  { key: "help", href: "/agent/help", label: "Settings & Help", note: "Corrections", icon: "help", group: "Navigation" },
];

const GROUPS: AgentNavItem["group"][] = ["Navigation"];

function AgentIcon({ name }: { name: IconName }) {
  const shared = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  };

  switch (name) {
    case "route":
      return (
        <svg {...shared}>
          <path d="M6 5c3.5 0 2.5 5 6 5s2.5 5 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M6 5h.1M18 15h.1M12 10h.1" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case "queue":
      return (
        <svg {...shared}>
          <path d="M5 6h14M5 12h14M5 18h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M8 4v4M8 10v4M8 16v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "inventory":
      return (
        <svg {...shared}>
          <path d="M4 20h16M6 20V9l6-4 6 4v11" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M9 20v-6h6v6M8 10h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "check":
      return (
        <svg {...shared}>
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="m8 12 2.4 2.4L16.5 8.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "target":
      return (
        <svg {...shared}>
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case "journal":
      return (
        <svg {...shared}>
          <path d="M7 4h11v16H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M8 8h6M8 12h7M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "help":
      return (
        <svg {...shared}>
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9.8 9.2a2.3 2.3 0 1 1 3.8 1.8c-.9.7-1.6 1.1-1.6 2.3M12 17h.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <path d="M4 10.5 12 4l8 6.5V20h-5v-5H9v5H4v-9.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function AgentSidebar({ current }: { current: AgentNavKey }) {
  return (
    <aside className="agent-sidebar" aria-label="Sales agent workspace navigation">
      {GROUPS.map((group) => (
        <div key={group} className="agent-nav-group">
          <span className="agent-nav-group-label">Menu</span>
          <div className="agent-nav-links">
            {AGENT_NAV_ITEMS.filter((item) => item.group === group).map((item) => (
              <Link key={item.key} href={item.href} className={item.key === current ? "agent-nav-link is-active" : "agent-nav-link"}>
                <span className="agent-nav-icon">
                  <AgentIcon name={item.icon} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}
