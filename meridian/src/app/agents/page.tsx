import { AgentsView } from "@/components/agents-view";
import { HarnessPanel } from "@/components/harness-panel";
import { loadAiStatus } from "@/server/ai-config";
import { getAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAgents();
  const providers = await loadAiStatus();
  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <HarnessPanel data={data} claudeConnected={providers.active !== "none"} claudeModel={providers.active === "openai" ? `ChatGPT · ${providers.openaiModel}` : providers.active === "gemini" ? `Gemini · ${providers.geminiModel}` : providers.claudeModel} />
      <AgentsView data={data} embedded />
    </div>
  );
}