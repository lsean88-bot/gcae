"use client";

import { useState } from "react";
import { Notice, useBusyRefresh } from "@/components/ui";
import { useRouter } from "next/navigation";
import { changePassword, createApiToken, logout, revokeApiToken } from "@/server/mutations";

export type TokenRow = { id: string; name: string; scopes: string[]; createdAt: number; expiresAt: number; lastUsedAt: number | null; revokedAt: number | null; state: string };

export function ForcedPasswordView({ name }: { name: string }) {
  const router = useRouter();
  return (
    <div>
      <div className="banner" style={{ margin: 12 }}>
        <div>
          <strong>Set your own password to continue.</strong>
          <div className="small">You signed in with a one-time password. No other page is available until it is changed.</div>
        </div>
        <button className="btn small" type="button" onClick={async () => { await logout(); router.refresh(); }}>Sign out</button>
      </div>
      <AccountView name={name} mustChange />
    </div>
  );
}

const fmt = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never");

function TokenPanel({ tokens }: { tokens: TokenRow[] }) {
  const { busy, result, run } = useBusyRefresh();
  const router = useRouter();
  const [name, setName] = useState("");
  const [days, setDays] = useState(90);
  const [readOnly, setReadOnly] = useState(false);
  const [shown, setShown] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h2 className="h3">Claude access tokens</h2>
      <p className="small">
        A token lets Claude Desktop or Claude Code on your PC read the audit file and file drafts for you. It acts as you. It can never issue a report, approve anything, close an action,
        delete evidence or change a threshold. Every use is logged. Never paste a token into a chat.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setErr("");
          setShown("");
          const out = await createApiToken(name, days, readOnly);
          if (out.ok) { setShown(out.token); setName(""); router.refresh(); } else setErr(out.error);
        }}
      >
        <label className="field"><span>Name (for example, my office PC)</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <label className="field"><span>Days valid, 1 to 90</span><input className="input" type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
        <label className="field"><span><input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} /> Read only (no drafts)</span></label>
        <button className="btn copper" type="submit">Create token</button>
      </form>
      {err ? <div className="small" style={{ marginTop: 8 }}>{err}</div> : null}
      {shown ? (
        <div className="banner" style={{ marginTop: 10 }}>
          <div>
            <strong>Copy this token now. It is shown once.</strong>
            <div className="small" style={{ wordBreak: "break-all", fontFamily: "monospace" }}>{shown}</div>
          </div>
        </div>
      ) : null}
      <table className="table" style={{ marginTop: 12 }}>
        <thead><tr><th>Name</th><th>Scopes</th><th>Expires</th><th>Last used</th><th>State</th><th /></tr></thead>
        <tbody>
          {tokens.length === 0 ? <tr><td colSpan={6} className="small">No tokens yet.</td></tr> : null}
          {tokens.map((t) => {
            const state = t.state === "ok" ? "Active" : t.state === "revoked" ? "Revoked" : "Expired";
            return (
              <tr key={t.id}>
                <td>{t.name}</td><td>{t.scopes.join(", ")}</td><td>{fmt(t.expiresAt)}</td><td>{fmt(t.lastUsedAt)}</td><td>{state}</td>
                <td>{state === "Active" ? <button className="btn small" disabled={busy} type="button" onClick={() => run(() => revokeApiToken(t.id))}>Revoke</button> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}><Notice result={result} /></div>
    </div>
  );
}

export function AccountView({ name, mustChange, canToken = false, tokens = [] }: { name: string; mustChange: boolean; canToken?: boolean; tokens?: TokenRow[] }) {
  const { busy, result, run } = useBusyRefresh();
  const [currentPassword, setCurrent] = useState("");
  const [nextPassword, setNext] = useState("");
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <p className="kicker">Account</p>
      <h1 className="display">Change the password for {name}.</h1>
      <p className="lede">
        {mustChange
          ? "You are using a one-time password. Choose your own now."
          : "Use at least 12 characters. Do not include your role or id. Other sessions for this person end when the password changes."}
      </p>
      <form
        className="panel"
        onSubmit={async (event) => {
          event.preventDefault();
          await run(() => changePassword(currentPassword, nextPassword));
        }}
      >
        <label className="field">
          <span>Current password</span>
          <input className="input" type="password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
        </label>
        <label className="field">
          <span>New password, at least 12 characters</span>
          <input className="input" type="password" value={nextPassword} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" />
        </label>
        <button className="btn copper" disabled={busy} type="submit">Change password</button>
        <div style={{ marginTop: 10 }}><Notice result={result} /></div>
      </form>
      {canToken && !mustChange ? <TokenPanel tokens={tokens} /> : null}
    </div>
  );
}