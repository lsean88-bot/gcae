"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/server/mutations";

export function LoginView({ roles }: { roles: string[] }) {
  const router = useRouter();
  const [role, setRole] = useState(roles[0] || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <p className="kicker">Meridian · sign in</p>
      <h1 className="display">Sign in with your role.</h1>
      <p className="lede">Choose the role, then enter that role’s password. Names are not used at sign-in.</p>
      <form
        className="panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const result = await login(role, password);
          setBusy(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        }}
      >
        <label className="field">
          <span>Role</span>
          <select className="select" value={role} onChange={(event) => setRole(event.target.value)}>
            {roles.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        {error ? <div className="note bad">{error}</div> : null}
        <button className="btn copper" disabled={busy || !role || !password} type="submit">{busy ? "Checking" : "Sign in"}</button>
      </form>
    </main>
  );
}