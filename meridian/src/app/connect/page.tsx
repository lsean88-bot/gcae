import { ConnectView } from "@/components/connect-view";
import { loadAiStatus } from "@/server/ai-config";

export const dynamic = "force-dynamic";

export default async function Page() {
  const status = await loadAiStatus();
  return <ConnectView claude={status.claude} openai={status.openai} gemini={status.gemini} preferred={status.preferred} />;
}