"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/server/mutations";

export function Notice({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return <div className={result.ok ? "note ok" : "note bad"}>{result.ok ? result.message : result.error}</div>;
}

export function useBusyRefresh() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  async function run(task: () => Promise<ActionResult>) {
    setBusy(true);
    try {
      const next = await task();
      setResult(next);
      if (next.ok) router.refresh();
      return next;
    } catch {
      const failed = { ok: false as const, error: "Sign in again. The session is missing or the page failed." };
      setResult(failed);
      return failed;
    } finally {
      setBusy(false);
    }
  }
  return { busy, result, setResult, run };
}

export function Pill({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`pill ${tone || ""}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function outcomeTone(value?: string | null) {
  if (!value) return "";
  if (value.includes("Fail") || value === "FAIL_EXCEPTION") return "Fail";
  if (value.includes("Unable") || value === "UNABLE_TO_CONCLUDE") return "Unable";
  if (value.includes("Pass") || value === "PASS") return "Pass";
  if (value.includes("Not applicable")) return "Low";
  return value;
}
