"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { logout } from "@/server/mutations";

type Person = { id: string; name: string; role: string; authority: string; mustChangePassword?: boolean };

const NAV = [
  { href: "/connect", label: "Connect AI", group: "Work" },
  { href: "/", label: "Command", group: "Work" },
  { href: "/universe", label: "Audit universe", group: "Work" },
  { href: "/engagements", label: "Engagements", group: "Work" },
  { href: "/evidence", label: "Evidence ledger", group: "Work" },
  { href: "/testing", label: "Testing bench", group: "Fieldwork" },
  { href: "/findings", label: "Findings", group: "Fieldwork" },
  { href: "/actions", label: "Action tracker", group: "Fieldwork" },
  { href: "/risks", label: "Risk register", group: "Assurance" },
  { href: "/compliance", label: "Control map", group: "Assurance" },
  { href: "/vendors", label: "Third parties", group: "Assurance" },
  { href: "/governance", label: "AI governance", group: "Assurance" },
  { href: "/agents", label: "Agent harness", group: "Agents" },
  { href: "/kaizen", label: "Kaizen", group: "Agents" },
  { href: "/reports", label: "Report studio", group: "Agents" },
  { href: "/log", label: "Audit log", group: "Agents" },
  { href: "/uat", label: "UAT evidence", group: "Agents" },
  { href: "/simulation", label: "Case simulation", group: "Agents" },
  { href: "/download", label: "Download kit", group: "Agents" },
];

export function Shell({
  actor,
  people,
  openDecisions,
  children,
}: {
  actor: Person;
  people: Person[];
  openDecisions: number;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="mark" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="10" fill="none" stroke="#C4622D" strokeWidth="1.4" />
              <path d="M16 6.5v6M16 19.5V25.5M6.5 16h6M19.5 16H25.5" stroke="#F4EADF" strokeWidth="1.3" />
              <circle cx="16" cy="16" r="2.1" fill="#C4622D" />
            </svg>
          </span>
          <span>
            <strong>Meridian</strong>
            <span>Assurance workbench</span>
          </span>
        </Link>
        <nav>
          {NAV.map((item, index) => {
            const show = index === 0 || NAV[index - 1].group !== item.group;
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
            return (
              <div key={item.href}>
                {show ? <div className="nav-label">{item.group}</div> : null}
                <Link href={item.href} className={active ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}>
                  {item.label}
                  {item.href === "/agents" && openDecisions > 0 ? <span className="pill High">{openDecisions}</span> : null}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <strong>Nothing issues without a person.</strong>
          <div>MK Tron Group Internal Audit. Reviewer-first. Evidence before opinion.</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" type="button" onClick={() => setOpen((value) => !value)} aria-label="Open navigation">
            Menu
          </button>
          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(`/search?q=${encodeURIComponent(query)}`);
              setOpen(false);
            }}
          >
            <span className="muted small">Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Findings, evidence, entities, actions"
              aria-label="Search the workbench"
            />
          </form>
          <Link href="/connect" className="btn copper small">Connect AI</Link>
          <span className="seal">Signed in</span>
          <span className="small">{actor.name} · {actor.role}</span>
          {actor.authority === "gcae" ? <Link href="/access" className="btn small">Access register</Link> : null}
          <Link href="/account" className="btn small">Password</Link>
          <button
            className="btn small"
            type="button"
            onClick={async () => {
              await logout();
              router.refresh();
            }}
          >
            Sign out
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}