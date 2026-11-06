"use client";

import { useState } from "react";
import Link from "next/link";
import { Notice, Pill, useBusyRefresh } from "@/components/ui";
import { chooseAi, connectAi, disconnectAi } from "@/server/mutations";

export function ConnectView({
  claude,
  openai,
  gemini,
  preferred,
}: {
  claude: boolean;
  openai: boolean;
  gemini: boolean;
  preferred: "claude" | "openai" | "gemini" | "none";
}) {
  const claudeForm = useBusyRefresh();
  const openaiForm = useBusyRefresh();
  const geminiForm = useBusyRefresh();
  const [claudeKey, setClaudeKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");

  return (
    <div className="page">
      <p className="kicker">Connect AI · one click after you paste the key</p>
      <h1 className="display">Connect Claude, Gemini, or ChatGPT.</h1>
      <p className="lede">
        You do not need to install anything. This app is already open. A chat login is not enough. You need an API key, which is a long password from the provider’s website. Paste it once. It stays on the server and is not shown again.
      </p>
      <div className="banner">
        <div>
          <strong>Do this only on a private copy.</strong>
          <div className="small">If other people can open this link, they could use your key. Do not paste a real key into a shared preview.</div>
        </div>
      </div>
      <div className="grid-2">
        <article className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h3">1. Claude</h2>
            <Pill tone={claude ? "Low" : "pending"}>{claude ? "Connected" : "Not connected"}</Pill>
          </div>
          <ol className="small">
            <li>Open <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com/settings/keys</a>.</li>
            <li>Sign in. If it asks you to add a payment method, do that. A Claude.ai chat plan is not the same key.</li>
            <li>Click Create key. Copy the whole key. It starts with sk-ant-.</li>
            <li>Paste it below and click Connect Claude.</li>
          </ol>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const next = await claudeForm.run(() => connectAi("claude", claudeKey));
              if (next.ok) setClaudeKey("");
            }}
          >
            <label className="field">
              <span>Paste Claude API key</span>
              <input className="input" type="password" autoComplete="off" value={claudeKey} onChange={(event) => setClaudeKey(event.target.value)} placeholder="sk-ant-..." />
            </label>
            <div className="row">
              <button className="btn copper" disabled={claudeForm.busy || claudeKey.trim().length < 20} type="submit">Connect Claude</button>
              {claude ? <button className="btn danger" type="button" disabled={claudeForm.busy} onClick={() => claudeForm.run(() => disconnectAi("claude"))}>Disconnect</button> : null}
              {claude ? <button className="btn" type="button" disabled={claudeForm.busy} onClick={() => claudeForm.run(() => chooseAi("claude"))}>Use Claude for the harness</button> : null}
            </div>
          </form>
          <Notice result={claudeForm.result} />
        </article>
        <article className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h3">2. ChatGPT</h2>
            <Pill tone={openai ? "Low" : "pending"}>{openai ? "Connected" : "Not connected"}</Pill>
          </div>
          <ol className="small">
            <li>Open <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a>.</li>
            <li>Sign in. ChatGPT Plus is not enough. This is the API site.</li>
            <li>Click Create new secret key. Copy the whole key. It starts with sk-.</li>
            <li>Paste it below and click Connect ChatGPT.</li>
          </ol>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const next = await openaiForm.run(() => connectAi("openai", openaiKey));
              if (next.ok) setOpenaiKey("");
            }}
          >
            <label className="field">
              <span>Paste OpenAI API key</span>
              <input className="input" type="password" autoComplete="off" value={openaiKey} onChange={(event) => setOpenaiKey(event.target.value)} placeholder="sk-..." />
            </label>
            <div className="row">
              <button className="btn copper" disabled={openaiForm.busy || openaiKey.trim().length < 20} type="submit">Connect ChatGPT</button>
              {openai ? <button className="btn danger" type="button" disabled={openaiForm.busy} onClick={() => openaiForm.run(() => disconnectAi("openai"))}>Disconnect</button> : null}
              {openai ? <button className="btn" type="button" disabled={openaiForm.busy} onClick={() => openaiForm.run(() => chooseAi("openai"))}>Use ChatGPT for the harness</button> : null}
            </div>
          </form>
          <Notice result={openaiForm.result} />
        </article>
        <article className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h3">3. Gemini</h2>
            <Pill tone={gemini ? "Low" : "pending"}>{gemini ? "Connected" : "Not connected"}</Pill>
          </div>
          <ol className="small">
            <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.</li>
            <li>Sign in with the Google account that will pay for API use. Gemini chat in the consumer app is not this key.</li>
            <li>Click Create API key. Copy the whole key.</li>
            <li>Paste it below and click Connect Gemini.</li>
          </ol>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const next = await geminiForm.run(() => connectAi("gemini", geminiKey));
              if (next.ok) setGeminiKey("");
            }}
          >
            <label className="field">
              <span>Paste Gemini API key</span>
              <input className="input" type="password" autoComplete="off" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} placeholder="AIza..." />
            </label>
            <div className="row">
              <button className="btn copper" disabled={geminiForm.busy || geminiKey.trim().length < 20} type="submit">Connect Gemini</button>
              {gemini ? <button className="btn danger" type="button" disabled={geminiForm.busy} onClick={() => geminiForm.run(() => disconnectAi("gemini"))}>Disconnect</button> : null}
              {gemini ? <button className="btn" type="button" disabled={geminiForm.busy} onClick={() => geminiForm.run(() => chooseAi("gemini"))}>Use Gemini for the harness</button> : null}
            </div>
          </form>
          <Notice result={geminiForm.result} />
        </article>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="h3">4. Use it</h2>
        <p className="small">The harness is currently set to {preferred === "none" ? "no model" : preferred === "claude" ? "Claude" : preferred === "gemini" ? "Gemini" : "ChatGPT"}. After a green Connected pill, you do not type commands.</p>
        <div className="row">
          <Link className="btn copper" href="/agents">Open Agent harness</Link>
          <Link className="btn" href="/reports">Open Report studio</Link>
        </div>
        <ol className="small">
          <li>Open Agent harness.</li>
          <li>Leave the engagement as it is, or pick another.</li>
          <li>Click Run harness. Wait. Do not click twice.</li>
          <li>Read the note. It is not an issued report.</li>
        </ol>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="h3">If you need your own private copy</h2>
        <p className="small">You can use this open copy today. A lasting private copy should sit on a computer only Internal Audit can reach, because the files are confidential. That part is for IT, not for you to type by hand. Send them this note:</p>
        <pre className="small" style={{ whiteSpace: "pre-wrap" }}>{`Please host the Meridian folder privately.
1. Install Node.js 22 and PostgreSQL.
2. Create a database named meridian.
3. Set DATABASE_URL to that database.
4. Run: npm install && npx drizzle-kit push && npm run build && npm run start
5. Put HTTPS in front of it. Do not expose PostgreSQL.
6. The GCAE connects Claude or ChatGPT from the Connect AI page. Do not put the key in email.`}</pre>
      </section>
    </div>
  );
}