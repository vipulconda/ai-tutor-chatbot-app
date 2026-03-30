import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { openai } from "@/lib/openai";

const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_LOCAL_MODEL = "qwen2.5:7b-instruct";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";
const DEFAULT_PREMIUM_MODEL = "gpt-4o";
const DEFAULT_GEMINI_COOLDOWN_MS = 60_000;
const geminiModelCooldowns = new Map<string, number>();

const localOpenAI = createOpenAI({
  apiKey: process.env.LOCAL_LLM_API_KEY || "ollama",
  baseURL: process.env.LOCAL_LLM_BASE_URL || DEFAULT_LOCAL_BASE_URL,
});

export type ChatModelPreference = "auto" | "premium";

export function isLocalLlmEnabled() {
  return (
    process.env.LOCAL_LLM_ENABLED === "true" ||
    Boolean(process.env.LOCAL_LLM_MODEL?.trim())
  );
}

export function getLocalLlmModelName() {
  return process.env.LOCAL_LLM_MODEL?.trim() || DEFAULT_LOCAL_MODEL;
}

export function resolveChatModelPreference(
  requestedPreference: string | undefined
): ChatModelPreference {
  if (requestedPreference === "premium") {
    return "premium";
  }

  return "auto";
}

export function getLocalChatModel() {
  return localOpenAI(getLocalLlmModelName());
}

export function getGeminiChatModel() {
  return google(DEFAULT_GEMINI_MODEL);
}

export interface GeminiTextModelOption {
  id: string;
  label: string;
}

export function getGeminiTextModelOptions(): GeminiTextModelOption[] {
  const configuredModels = [
    process.env.GEMINI_PRIMARY_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    process.env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_GEMINI_FALLBACK_MODEL,
  ].filter(Boolean);

  const uniqueModels = Array.from(new Set(configuredModels));

  return uniqueModels.map((id) => ({
    id,
    label: id === DEFAULT_GEMINI_MODEL
      ? "Gemini 2.5 Flash"
      : id === DEFAULT_GEMINI_FALLBACK_MODEL
        ? "Gemini 2.5 Flash Lite"
        : id,
  }));
}

export function getAvailableGeminiTextModelOptions(referenceTime = Date.now()) {
  return getGeminiTextModelOptions().filter((option) => {
    const cooldownUntil = geminiModelCooldowns.get(option.id) ?? 0;
    return cooldownUntil <= referenceTime;
  });
}

export function getGeminiModelCooldownUntil(modelId: string) {
  return geminiModelCooldowns.get(modelId) ?? 0;
}

export function clearGeminiModelCooldown(modelId: string) {
  geminiModelCooldowns.delete(modelId);
}

export function markGeminiModelCooldown(modelId: string, error: unknown) {
  const cooldownMs = getGeminiCooldownMsFromError(error);
  geminiModelCooldowns.set(modelId, Date.now() + cooldownMs);
  return cooldownMs;
}

function getGeminiCooldownMsFromError(error: unknown) {
  if (!(error instanceof Error)) {
    return DEFAULT_GEMINI_COOLDOWN_MS;
  }

  const message = error.message;

  const retryInSecondsMatch = message.match(/retry in\s+([\d.]+)s/i);
  if (retryInSecondsMatch) {
    const seconds = Number.parseFloat(retryInSecondsMatch[1] || "");
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.max(1_000, Math.ceil(seconds * 1000));
    }
  }

  const retryDelayMatch = message.match(/retrydelay["']?\s*[:=]\s*["']?(\d+)s/i);
  if (retryDelayMatch) {
    const seconds = Number.parseInt(retryDelayMatch[1] || "", 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.max(1_000, seconds * 1000);
    }
  }

  return DEFAULT_GEMINI_COOLDOWN_MS;
}

export function getPremiumChatModel() {
  return openai(DEFAULT_PREMIUM_MODEL);
}

export function getLocalChatModelLabel() {
  return `Local (${getLocalLlmModelName()})`;
}

export function getGeminiChatModelLabel() {
  return "Gemini 2.5 Flash";
}

export function getPremiumChatModelLabel() {
  return "GPT-4o";
}
