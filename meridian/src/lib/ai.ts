export type AiProvider = "claude" | "openai" | "gemini" | "compatible";

export type AiStatus = {
  claude: boolean;
  openai: boolean;
  gemini: boolean;
  compatible: boolean;
  claudeModel: string;
  openaiModel: string;
  geminiModel: string;
  compatibleModel: string;
};

export function aiStatus(): AiStatus {
  return {
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    compatible: Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY),
    claudeModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4.1",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    compatibleModel: process.env.AI_MODEL || "",
  };
}

const SYSTEM = `You are a report editor for an internal audit workbench.
Rewrite tone and structure only.
Do not add, change, or remove any figure, date, name, rating, score, cause, evidence id, or management response that is not in the user message.
If a fact is missing, keep the square-bracket placeholder.
Do not treat a fraud indicator as a finding of fraud.
Do not convert an evidence gap into a pass or a confirmed failure.
Do not issue the report and do not say the report is approved.
Start with this exact line: MODEL DRAFT — NOT AN ISSUED OPINION.`;

export async function completeWithModel(provider: AiProvider, model: string, prompt: string, key?: string) {
  if (provider === "claude") return completeClaude(model, prompt, key);
  if (provider === "gemini") return completeGemini(model, prompt, key);
  return completeOpenAICompatible(provider, model, prompt, key);
}

async function completeGemini(model: string, prompt: string, key = process.env.GEMINI_API_KEY) {
  if (!key) {
    return { ok: false as const, error: "Gemini is not connected. Open Connect AI, paste a Gemini API key, and click Connect." };
  }
  const modelId = model || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : `Gemini returned ${response.status}.`;
    return { ok: false as const, error: message };
  }
  const parts = body?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((part: { text?: string }) => part.text || "").join("\n") : "";
  if (!text.trim()) return { ok: false as const, error: "Gemini returned an empty draft." };
  return { ok: true as const, text, model: modelId };
}

async function completeClaude(model: string, prompt: string, key = process.env.ANTHROPIC_API_KEY) {
  if (!key) {
    return { ok: false as const, error: "Claude is not connected. Open Connect AI, paste a Claude API key, and click Connect." };
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-5-5",
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : `Claude returned ${response.status}.`;
    return { ok: false as const, error: message };
  }
  const text = Array.isArray(body.content)
    ? body.content.filter((block: { type?: string }) => block.type === "text").map((block: { text?: string }) => block.text || "").join("\n")
    : "";
  if (!text.trim()) return { ok: false as const, error: "Claude returned an empty draft." };
  return { ok: true as const, text, model: String(body.model || model) };
}

async function completeOpenAICompatible(provider: AiProvider, model: string, prompt: string, key?: string) {
  const compatible = provider === "compatible";
  const resolved = key || (compatible ? process.env.AI_API_KEY : process.env.OPENAI_API_KEY);
  const base = (compatible ? process.env.AI_BASE_URL : "https://api.openai.com/v1")?.replace(/\/$/, "");
  if (!resolved || !base) {
    return {
      ok: false as const,
      error: compatible
        ? "The other model is not connected."
        : "ChatGPT is not connected. Open Connect AI, paste an OpenAI API key, and click Connect.",
    };
  }
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resolved}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : `The model returned ${response.status}.`;
    return { ok: false as const, error: message };
  }
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) return { ok: false as const, error: "The model returned an empty draft." };
  return { ok: true as const, text, model };
}

export function figuresNotInSource(source: string, draft: string) {
  const found = draft.match(/\b\d[\d,]{2,}\b/g) || [];
  const sourceFlat = source.replace(/,/g, "");
  return [...new Set(found)].filter((figure) => !source.includes(figure) && !sourceFlat.includes(figure.replace(/,/g, "")));
}
