/** A person holding a one-time password has no authority until the password is changed. */
export function effectiveAuthority(person: { authority: string; mustChange: boolean }) {
  return person.mustChange ? "locked" : person.authority;
}

export const AUDIT_ROLES = ["gcae", "manager", "auditor", "qa"];

/** Returns a refusal message, or null when the authority is allowed. "none" and "locked" are never allowed. */
export function denyAuthority(authority: string, allowed: string[], message: string): string | null {
  if (authority === "none") return "Sign in required.";
  if (authority === "locked") return "Change your one-time password first. Nothing else is available until you do.";
  return allowed.includes(authority) ? null : message;
}
