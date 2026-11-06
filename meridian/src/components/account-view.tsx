"use client";

import { useState } from "react";
import { Notice, useBusyRefresh } from "@/components/ui";
import { useRouter } from "next/navigation";
import { changePassword, logout } from "@/server/mutations";

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

export function AccountView({ name, mustChange }: { name: string; mustChange: boolean }) {
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
    </div>
  );
}