import Link from "next/link";

export const dynamic = "force-dynamic";

const FILES = [
  ["meridian-all-files.zip", "Complete kit: source, manuals, access list, skill plugin"],
  ["docs/START-HERE.md", "Which guide to read first"],
  ["docs/USER-GUIDE.md", "User manual, click by click"],
  ["docs/DEPLOYMENT-AND-INTEGRATION.md", "Deploy and connect Claude, Gemini, and ChatGPT"],
  ["docs/INSTALLATION-GUIDE.md", "Private server installation"],
  ["docs/SETUP-GUIDE.md", "First-day setup"],
  ["docs/CLAUDE-CHATGPT-CONNECTION.md", "Shorter connection note"],
  ["docs/UPDATE-GUIDE.md", "Update the app and the skill"],
  ["docs/KNOWLEDGE-TRANSFER.md", "Memory, decisions, and data"],
];

export default function Page() {
  return (
    <div className="page">
      <p className="kicker">Download and handover</p>
      <h1 className="display">Take the full kit with you.</h1>
      <p className="lede">
        The zip contains the application source, the guides, the Claude skill plugin, and a single markdown file of the complete source. It does not contain API keys or the live database.
      </p>
      <div className="stack">
        {FILES.map(([file, detail]) => (
          <a key={file} className="panel" href={`/downloads/${file}`}>
            <strong>{file}</strong>
            <div className="small muted">{detail}</div>
          </a>
        ))}
      </div>
      <p className="small" style={{ marginTop: 16 }}>
        After you unzip the kit, read <Link href="/downloads/docs/START-HERE.md">START-HERE.md</Link>. Connect a model from <Link href="/connect">Connect AI</Link>. Prove the copy from <Link href="/uat">UAT evidence</Link>.
      </p>
    </div>
  );
}