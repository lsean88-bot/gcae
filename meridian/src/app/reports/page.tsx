import { ReportsView } from "@/components/reports-view";
import { Report13Panel } from "@/components/report13-panel";
import { loadAiStatus } from "@/server/ai-config";
import { getReports } from "@/lib/data";
import { actorNow } from "@/server/authz";
import { latestVersionView, listReportVersions } from "@/server/report13-data";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ engagement?: string }> }) {
  const params = await searchParams;
  const data = await getReports(params.engagement);
  if (!data) return <div className="page">No engagement is on file.</div>;
  const who = await actorNow();
  const viewer = { id: who.id, name: who.name, authority: who.authority };
  const signedIn = Boolean(who.id) && who.authority !== "none" && who.authority !== "locked";
  const latest = signedIn ? await latestVersionView(viewer, data.engagement.id) : null;
  const versions = signedIn ? await listReportVersions(viewer, data.engagement.id) : [];
  return (
    <>
      <ReportsView data={data} providers={await loadAiStatus()} />
      <div className="page" style={{ paddingTop: 0 }}>
        <Report13Panel engagementId={data.engagement.id} engagements={data.engagements} latest={latest} versions={versions.map(({ gate: _g, ...v }) => v)} isGcae={who.authority === "gcae"} />
      </div>
    </>
  );
}
