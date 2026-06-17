interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

interface StreamEvent {
  type: "reasoning" | "content";
  text: string;
}

interface ClientConfig {
  baseURL?: string;
  model?: string;
  apiKey: string;
}

interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "json";
  tools?: unknown[];
  toolChoice?: unknown;
  maxTokens?: number;
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const JSON_RETRY_MAX_TOKENS = 4096;
const JSON_REPAIR_MAX_TOKENS = 8192;

function stripFences(value = "") {
  return value.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
}

function parseJsonContent(content = "") {
  const cleaned = stripFences(content);
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw error;
  }
}

export function makeTransformerClient(config: ClientConfig) {
  const baseURL = (config.baseURL || process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = config.model || process.env.LLM_MODEL || DEFAULT_MODEL;
  const apiKey = config.apiKey || process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || "";

  if (!apiKey) throw new Error("API key missing");

  const endpoint = `${baseURL}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  async function call(body: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, ...body }),
      signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM ${response.status}: ${text.slice(0, 500)}`);
    }
    return response;
  }

  async function chat(options: ChatOptions) {
    const body: Record<string, unknown> = {
      messages: options.messages,
      temperature: options.temperature ?? 0.4,
    };
    if (options.responseFormat === "json") body.response_format = { type: "json_object" };
    if (options.tools) body.tools = options.tools;
    if (options.toolChoice) body.tool_choice = options.toolChoice;
    if (options.maxTokens) body.max_tokens = options.maxTokens;

    const response = await call(body, options.signal);
    const data = await response.json();
    return data.choices?.[0]?.message ?? { content: "" };
  }

  async function json(options: Omit<ChatOptions, "responseFormat">) {
    const message = await chat({ ...options, responseFormat: "json" });
    const content = typeof message.content === "string" ? message.content : "";
    try {
      return parseJsonContent(content);
    } catch {
      const maxTokens = Math.min(
        Math.max((options.maxTokens ?? 0) * 2, JSON_RETRY_MAX_TOKENS),
        JSON_REPAIR_MAX_TOKENS
      );
      const repaired = await chat({
        ...options,
        responseFormat: "json",
        temperature: 0,
        maxTokens,
        messages: [
          ...options.messages,
          { role: "assistant", content },
          { role: "user", content: "That was not valid JSON. Reply with ONLY the corrected JSON object, no prose, no code fences." },
        ],
      });
      const repairedContent = typeof repaired.content === "string" ? repaired.content : "";
      return parseJsonContent(repairedContent);
    }
  }

  async function* stream(options: Omit<ChatOptions, "responseFormat" | "tools" | "toolChoice">): AsyncGenerator<StreamEvent> {
    const response = await call({
      messages: options.messages,
      temperature: options.temperature ?? 0.5,
      stream: true,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }, options.signal);

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = (parsed as { choices?: { delta?: { reasoning_content?: string; content?: string } }[] }).choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.reasoning_content) yield { type: "reasoning", text: delta.reasoning_content };
        if (delta.content) yield { type: "content", text: delta.content };
      }
    }
  }

  return { chat, json, stream, config: { baseURL, model } };
}
