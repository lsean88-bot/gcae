import { db } from "@/db";
import { people } from "@/db/schema";
import { ACCOUNT_ORDER } from "@/lib/password";
import { getActor } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = await getActor();
  if (actor.authority !== "gcae") {
    return (
      <div className="page">
        <h1 className="display">The access register is for the GCAE only.</h1>
      </div>
    );
  }
  const rows = await db.select().from(people);
  const ordered = [...rows].sort((a, b) => {
    const ai = ACCOUNT_ORDER.indexOf(a.id as (typeof ACCOUNT_ORDER)[number]);
    const bi = ACCOUNT_ORDER.indexOf(b.id as (typeof ACCOUNT_ORDER)[number]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const state = (hash: string | null, mustChange: boolean) =>
    !hash ? "No password. Cannot sign in" : mustChange ? "One-time password issued. Change pending" : "Own password set";
  return (
    <div className="page">
      <p className="kicker">Access register</p>
      <h1 className="display">Role, id, and password status.</h1>
      <p className="lede">Passwords are never shown or stored in readable form. An administrator issues a one-time password from the server with <span className="mono">npm run setup:passwords</span>. The person must replace it at first sign-in.</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Id</th><th>Role</th><th>Password status</th></tr>
          </thead>
          <tbody>
            {ordered.map((person) => (
              <tr key={person.id}>
                <td className="mono">{person.id}</td>
                <td>{person.role}</td>
                <td>{state(person.passwordHash, person.mustChange)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
