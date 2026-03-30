import type { Message, StudentProfileData } from "@/types";

export const SUMMARY_PREFIX = "[CONVERSATION SUMMARY]";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "please",
  "the",
  "this",
  "to",
  "what",
  "with",
  "you",
]);

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function overlapScore(text: string, queryTokens: string[]) {
  if (queryTokens.length === 0) {
    return 0;
  }

  const textTokens = new Set(tokenize(text));
  let score = 0;

  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function recencyBoost(index: number, total: number) {
  if (total <= 1) {
    return 0;
  }

  return index / total;
}

export function shouldUseConversationContext(message: string) {
  const normalized = message.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  const followUpPatterns = [
    /^why\b/,
    /^how\b/,
    /^can you explain\b/,
    /^explain (this|that|it)\b/,
    /^what about\b/,
    /^and\b/,
    /^also\b/,
    /^then\b/,
    /^next\b/,
    /^continue\b/,
    /^same\b/,
    /^another one\b/,
    /^solve this\b/,
    /^do this one\b/,
    /^is this\b/,
    /^am i right\b/,
    /^check this\b/,
  ];

  if (followUpPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const tokenCount = tokenize(normalized).length;
  if (tokenCount <= 4) {
    return true;
  }

  const standaloneQuestionPatterns = [
    /^\d+/,
    /^[a-z].*\?$/i,
    /^find\b/,
    /^solve\b/,
    /^construct\b/,
    /^prove\b/,
    /^if\b/,
    /^a\b.+\bwhat\b/i,
    /^five years ago\b/,
    /^the perimeter\b/,
    /^the area\b/,
    /^let\b/,
  ];

  if (standaloneQuestionPatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return false;
}

export function selectRelevantConversationMessages(
  messages: Message[],
  currentQuery: string,
  limit = 4
) {
  const queryTokens = tokenize(currentQuery);
  const total = messages.length;
  const isFollowUpQuery = shouldUseConversationContext(currentQuery);

  const rankedMessages = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => ({
      message,
      index,
      overlap: overlapScore(message.content, queryTokens),
      score:
        overlapScore(message.content, queryTokens) +
        (message.role === "user" ? 0.3 : 0) +
        recencyBoost(index, total),
    }));

  if (isFollowUpQuery) {
    return rankedMessages
      .slice(-limit)
      .map(({ message }) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      }));
  }

  return rankedMessages
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map(({ message }) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
}

export function selectRelevantProfileTopics(
  profile: StudentProfileData,
  subject: string,
  topic: string | undefined,
  query: string
) {
  const queryBasis = [subject, topic || "", query].join(" ");
  const queryTokens = tokenize(queryBasis);

  const rankTopics = (topics: string[]) =>
    topics
      .map((entry, index) => ({
        entry,
        index,
        score: overlapScore(entry, queryTokens) + (index === 0 ? 0.2 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ entry }) => entry);

  return {
    weakTopics: rankTopics(profile.weakTopics),
    strongTopics: rankTopics(profile.strongTopics),
  };
}

export function extractConversationSummary(messages: Message[]) {
  const summaryMessage = messages.find(
    (message) => message.role === "system" && message.content.startsWith(SUMMARY_PREFIX)
  );

  return summaryMessage
    ? summaryMessage.content.slice(SUMMARY_PREFIX.length).trim()
    : "";
}

export function upsertConversationSummary(messages: Message[]) {
  const nonSystemMessages = messages.filter((message) => message.role !== "system");
  const summarySource = nonSystemMessages.slice(-8);

  if (summarySource.length < 4) {
    return messages.filter(
      (message) => !(message.role === "system" && message.content.startsWith(SUMMARY_PREFIX))
    );
  }

  const summaryParts = summarySource.map((message) => {
    const trimmedContent = message.content.replace(/\s+/g, " ").trim();
    const compactContent =
      trimmedContent.length > 120 ? `${trimmedContent.slice(0, 117)}...` : trimmedContent;
    return `${message.role}: ${compactContent || "[media attachment]"}`;
  });

  const summaryMessage: Message = {
    id: "conversation-summary",
    role: "system",
    content: `${SUMMARY_PREFIX} ${summaryParts.join(" | ")}`,
    modality: "text",
    tokenCount: 0,
    hintUsed: false,
    timestamp: new Date().toISOString(),
  };

  return [
    ...messages.filter(
      (message) => !(message.role === "system" && message.content.startsWith(SUMMARY_PREFIX))
    ),
    summaryMessage,
  ];
}

export function shouldUseWebGrounding(message: string, subject: string) {
  const normalized = `${subject} ${message}`.toLowerCase();
  const normalizedSubject = subject.toLowerCase();
  const queryTokens = tokenize(message);

  const strongSignals = [
    "latest",
    "current",
    "today",
    "recent",
    "news",
    "according to",
    "look up",
    "search",
    "find source",
    "real world example",
  ];

  const weakSignals = [
    "who is",
    "what happened",
    "which company",
    "when did",
    "where is",
    "official",
    "source",
    "evidence",
  ];

  const factualWriteupSignals = [
    "write about",
    "short note",
    "essay on",
    "paragraph on",
    "200 words",
    "150 words",
    "100 words",
    "biography",
    "history of",
    "information about",
    "all about",
  ];

  const historyCivicsSignals = [
    "dynasty",
    "empire",
    "kingdom",
    "revolt",
    "treaty",
    "movement",
    "constitution",
    "parliament",
    "democracy",
    "governor",
    "president",
    "prime minister",
    "battle",
    "war",
  ];

  const tutoringSignals = [
    "solve",
    "equation",
    "homework",
    "sum",
    "multiply",
    "divide",
    "grammar",
    "meaning",
    "explain",
    "hint",
  ];

  const subjectPrefersGrounding =
    normalizedSubject.includes("social science") ||
    normalizedSubject.includes("history") ||
    normalizedSubject.includes("civics") ||
    normalizedSubject.includes("geography") ||
    normalizedSubject.includes("political science");

  const strongScore = strongSignals.filter((signal) => normalized.includes(signal)).length;
  const weakScore = weakSignals.filter((signal) => normalized.includes(signal)).length;
  const factualWriteupScore = factualWriteupSignals.filter((signal) =>
    normalized.includes(signal)
  ).length;
  const historySignalScore = historyCivicsSignals.filter((signal) =>
    normalized.includes(signal)
  ).length;
  const tutoringScore = tutoringSignals.filter((signal) => normalized.includes(signal)).length;
  const likelyFactLookup =
    queryTokens.length >= 3 &&
    tutoringScore === 0 &&
    !normalized.includes("?") &&
    (normalized.startsWith("write ") ||
      normalized.startsWith("describe ") ||
      normalized.startsWith("tell me about "));

  return (
    strongScore > 0 ||
    (weakScore > 0 && tutoringScore === 0) ||
    (subjectPrefersGrounding && factualWriteupScore > 0) ||
    (subjectPrefersGrounding && historySignalScore > 0 && tutoringScore === 0) ||
    (subjectPrefersGrounding && likelyFactLookup)
  );
}

export function isStandaloneFactLookup(message: string) {
  const normalized = message.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  const directLookupPatterns = [
    /^who is\s+/,
    /^what is\s+/,
    /^tell me about\s+/,
    /^write about\s+/,
    /^short note on\s+/,
    /^biography of\s+/,
    /^information about\s+/,
  ];

  return directLookupPatterns.some((pattern) => pattern.test(normalized));
}

export function sanitizeGroundedResponseText(text: string) {
  return text
    .replace(/\s*\[cite:\s*[^\]]+\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
