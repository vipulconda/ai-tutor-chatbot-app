import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "@ai-sdk/google";
import { generateText, streamText } from "ai";
import type { ModelMessage } from "ai";
import {
  clearGeminiModelCooldown,
  getAvailableGeminiTextModelOptions,
  getGeminiChatModel,
  getGeminiChatModelLabel,
  getGeminiTextModelOptions,
  getGeminiModelCooldownUntil,
  getLocalChatModel,
  getLocalChatModelLabel,
  markGeminiModelCooldown,
  getPremiumChatModel,
  getPremiumChatModelLabel,
  isLocalLlmEnabled,
  resolveChatModelPreference,
  type ChatModelPreference,
} from "@/lib/llm";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import {
  extractConversationSummary,
  isStandaloneFactLookup,
  sanitizeGroundedResponseText,
  selectRelevantConversationMessages,
  selectRelevantProfileTopics,
  shouldUseConversationContext,
  shouldUseWebGrounding,
  upsertConversationSummary,
} from "@/lib/ai/retrieval";
import { checkSafety, stripPII } from "@/lib/ai/safety-filter";
import { v4 as uuidv4 } from "uuid";
import type { StudentProfileData, Message, Board, SourceCitation } from "@/types";

const PREMIUM_FALLBACK_MESSAGE =
  "Premium AI is temporarily unavailable because the OpenAI credits or API key are not set up. Please switch to Auto mode for now.";
const LOCAL_FALLBACK_MESSAGE =
  "Local AI is unavailable right now. Please make sure your local model server is running and the local model has finished downloading, or try Auto again in a little while.";

interface ChatTraceContext {
  traceId: string;
  userId: string;
  conversationId?: string;
  subject: string;
  topic?: string;
  modelMode: ChatModelPreference;
  hasProfileContext?: boolean;
  retrievedMessageCount?: number;
  usedWebSearch?: boolean;
}

function formatTraceValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "none";
  }

  if (value === null || value === undefined || value === "") {
    return "none";
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return String(value);
}

function formatTraceDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    return "";
  }

  return entries
    .map(([key, value]) => `${key}=${formatTraceValue(value)}`)
    .join(" | ");
}

function logChatTrace(
  context: ChatTraceContext,
  step: string,
  details: Record<string, unknown> = {}
) {
  const scope = [
    `user=${context.userId}`,
    `conversation=${context.conversationId || "new"}`,
    `subject=${context.subject}`,
    `topic=${context.topic || "none"}`,
    `mode=${context.modelMode}`,
  ].join(" | ");
  const detailText = formatTraceDetails(details);

  console.info(
    `[chat-trace:${context.traceId}] ${step}\n  ${scope}${detailText ? `\n  ${detailText}` : ""}`
  );
}

function logChatTraceSummary(
  context: ChatTraceContext,
  details: {
    modelLabel: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }
) {
  console.info(
    `[chat-trace:${context.traceId}] summary\n` +
      `  Question received\n` +
      `  Used profile context: ${context.hasProfileContext ? "yes" : "no"}\n` +
      `  Used past chat context: ${
        context.retrievedMessageCount && context.retrievedMessageCount > 0
          ? `yes (${context.retrievedMessageCount} messages)`
          : "no"
      }\n` +
      `  Used web search: ${context.usedWebSearch ? "yes" : "no"}\n` +
      `  Model: ${details.modelLabel}\n` +
      `  Tokens: ${details.inputTokens} in / ${details.outputTokens} out / ${details.totalTokens} total`
  );
}

function parseImageDataUrl(dataUrl: string): {
  mediaType: `image/${string}`;
  bytes: Uint8Array;
} | null {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,([\s\S]+)$/);

  if (!match) {
    return null;
  }

  const [, mediaType, base64Payload] = match;

  try {
    return {
      mediaType: mediaType as `image/${string}`,
      bytes: Uint8Array.from(Buffer.from(base64Payload, "base64")),
    };
  } catch {
    return null;
  }
}

function buildPremiumUnavailableResponse() {
  return NextResponse.json(
    {
      safetyResponse: PREMIUM_FALLBACK_MESSAGE,
      error: PREMIUM_FALLBACK_MESSAGE,
    },
    { status: 200 }
  );
}

function buildLocalUnavailableResponse() {
  return NextResponse.json(
    {
      safetyResponse: LOCAL_FALLBACK_MESSAGE,
      error: LOCAL_FALLBACK_MESSAGE,
    },
    { status: 200 }
  );
}

async function generateEmergencyGoogleSummary(params: {
  message: string;
  subject: string;
  topic?: string;
}) {
  const trimmedMessage = params.message.trim();

  if (!trimmedMessage) {
    return null;
  }

  return generateText({
    model: getGeminiChatModel(),
    system:
      "You are a fallback educational assistant. The main answer pipeline failed. " +
      "Give a short, direct, school-friendly answer using only the user's question. " +
      "Do not mention internal errors, fallbacks, or unavailable systems.",
    prompt:
      `Subject: ${params.subject}\n` +
      `Topic: ${params.topic || "General"}\n` +
      `Question: ${trimmedMessage}`,
    maxOutputTokens: 220,
    temperature: 0.4,
  });
}

async function generateGroundedGeminiResponse(
  modelId: string,
  system: string,
  messages: ModelMessage[]
) {
  return generateText({
    model: google(modelId),
    system,
    messages,
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    maxOutputTokens: 500,
    temperature: 0.7,
  });
}

function isPremiumProviderUnavailable(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("incorrect api key") ||
    message.includes("invalid_api_key") ||
    message.includes("insufficient_quota") ||
    message.includes("quota") ||
    message.includes("credit") ||
    message.includes("billing")
  );
}

function isGeminiProviderUnavailable(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("resource_exhausted") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("quota") ||
    message.includes("429") ||
    message.includes("all gemini models are on cooldown")
  );
}

function isLocalProviderUnavailable(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("127.0.0.1") ||
    message.includes("connection refused") ||
    message.includes("connect: operation not permitted") ||
    message.includes("model '") ||
    message.includes("not found")
  );
}

function getProviderErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      type: "unknown_error",
      message: "Unknown provider error",
    };
  }

  const message = error.message;
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("resource_exhausted") ||
    normalizedMessage.includes("quota exceeded") ||
    normalizedMessage.includes("quota")
  ) {
    return {
      type: "quota_exceeded",
      message,
    };
  }

  if (
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("429")
  ) {
    return {
      type: "rate_limited",
      message,
    };
  }

  if (
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("incorrect api key") ||
    normalizedMessage.includes("api key not valid") ||
    normalizedMessage.includes("invalid_api_key")
  ) {
    return {
      type: "invalid_api_key",
      message,
    };
  }

  return {
    type: "provider_error",
    message,
  };
}

function shouldMarkGeminiCooldown(error: unknown) {
  const errorType = getProviderErrorDetails(error).type;
  return errorType === "quota_exceeded" || errorType === "rate_limited";
}

function getGeminiOptionsForAttempt() {
  return getAvailableGeminiTextModelOptions();
}

function mapSourcesToCitations(sources: Awaited<ReturnType<typeof generateText>>["sources"]) {
  return (sources || [])
    .filter((source): source is Extract<(typeof sources)[number], { sourceType: "url" }> =>
      source.type === "source" && source.sourceType === "url"
    )
    .map(
      (source): SourceCitation => ({
        title: source.title || source.url,
        url: source.url,
      })
    )
    .filter(
      (source, index, self) =>
        index === self.findIndex((candidate) => candidate.url === source.url)
    )
    .slice(0, 5);
}

async function persistAssistantMessage(params: {
  conversationId?: string;
  content: string;
  outputTokens: number;
  totalTokens: number;
  sources?: SourceCitation[];
}) {
  if (!params.conversationId) {
    return;
  }

  const convo = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
  });

  if (!convo) {
    return;
  }

  const existing: Message[] = JSON.parse(convo.messages);
  existing.push({
    id: uuidv4(),
    role: "assistant",
    content: params.content,
    modality: "text",
    sources: params.sources,
    tokenCount: params.outputTokens,
    hintUsed: false,
    timestamp: new Date().toISOString(),
  });
  const nextMessages = upsertConversationSummary(existing);
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: {
      messages: JSON.stringify(nextMessages),
      tokenCount: convo.tokenCount + params.totalTokens,
    },
  });
}

async function incrementSubscriptionUsage(userId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return;
  }

  await prisma.subscription.update({
    where: { userId },
    data: { dailyQuestionsUsed: { increment: 1 } },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }
  const userId = session.user.id;
  let fallbackConversationId: string | undefined;
  let fallbackUserMessage = "";
  let fallbackSubject = "General";
  let fallbackTopic: string | undefined;
  let fallbackTraceContext: ChatTraceContext | null = null;

  try {
    const { conversationId, message, subject, topic, imageBase64, modelPreference } = await req.json();
    const resolvedModelPreference = resolveChatModelPreference(
      typeof modelPreference === "string" ? modelPreference : undefined
    );
    const normalizedMessage = typeof message === "string" ? message.trim() : "";
    const traceContext: ChatTraceContext = {
      traceId: uuidv4().slice(0, 8),
      userId,
      conversationId: typeof conversationId === "string" ? conversationId : undefined,
      subject: typeof subject === "string" && subject.trim() ? subject : "General",
      topic: typeof topic === "string" && topic.trim() ? topic : undefined,
      modelMode: resolvedModelPreference,
    };
    fallbackConversationId = traceContext.conversationId;
    fallbackUserMessage = normalizedMessage;
    fallbackSubject = traceContext.subject;
    fallbackTopic = traceContext.topic;
    fallbackTraceContext = traceContext;
    const imageAttachment =
      typeof imageBase64 === "string" ? parseImageDataUrl(imageBase64) : null;
    const hasImage = imageAttachment !== null;

    logChatTrace(traceContext, "request.received", {
      hasMessage: Boolean(normalizedMessage),
      messageLength: normalizedMessage.length,
      hasImage,
      modelPreference: modelPreference ?? "auto",
    });

    if (!normalizedMessage && !hasImage) {
      logChatTrace(traceContext, "request.rejected", {
        reason: "empty_message_and_no_image",
      });
      return new Response(JSON.stringify({ error: "Message or image is required" }), {
        status: 400,
      });
    }

    if (typeof imageBase64 === "string" && !hasImage) {
      logChatTrace(traceContext, "request.rejected", {
        reason: "invalid_image_upload",
      });
      return new Response(JSON.stringify({ error: "Invalid image upload" }), {
        status: 400,
      });
    }

    if (
      resolvedModelPreference === "premium" &&
      (!process.env.OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY.includes("your-openai-api-key"))
    ) {
      logChatTrace(traceContext, "routing.premium_unavailable", {
        reason: "missing_or_placeholder_openai_key",
      });
      return buildPremiumUnavailableResponse();
    }

    // Load student profile
    const profileRaw = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (!profileRaw) {
      logChatTrace(traceContext, "request.rejected", {
        reason: "missing_student_profile",
      });
      return new Response(
        JSON.stringify({ error: "Please complete your profile first" }),
        { status: 400 }
      );
    }

    const profile: StudentProfileData = {
      ...profileRaw,
      board: profileRaw.board as Board,
      subjects: JSON.parse(profileRaw.subjects),
      weakTopics: JSON.parse(profileRaw.weakTopics),
      strongTopics: JSON.parse(profileRaw.strongTopics),
      abilityScores: JSON.parse(profileRaw.abilityScores),
    };

    // Check daily quota
    const subscription = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
    });

    if (subscription) {
      const now = new Date();
      const lastReset = new Date(subscription.dailyResetAt);
      
      // Reset daily counter if new day
      if (now.toDateString() !== lastReset.toDateString()) {
        await prisma.subscription.update({
          where: { userId: session.user.id },
          data: { dailyQuestionsUsed: 0, dailyResetAt: now },
        });
        logChatTrace(traceContext, "quota.reset", {
          dailyQuestionsMax: subscription.dailyQuestionsMax,
        });
      } else if (subscription.dailyQuestionsUsed >= subscription.dailyQuestionsMax) {
        logChatTrace(traceContext, "request.rejected", {
          reason: "daily_quota_exceeded",
          dailyQuestionsUsed: subscription.dailyQuestionsUsed,
          dailyQuestionsMax: subscription.dailyQuestionsMax,
        });
        return new Response(
          JSON.stringify({ error: "QUOTA_EXCEEDED", message: "Daily question limit reached. Upgrade your plan for more!" }),
          { status: 429 }
        );
      }
    }

    // Safety check
    const safetyResult = checkSafety(normalizedMessage);
    if (!safetyResult.safe) {
      logChatTrace(traceContext, "safety.blocked", {
        safetyMessage: safetyResult.message,
      });
      // Still save the message and return safety response directly
      const userMsg: Message = {
        id: uuidv4(),
        role: "user",
        content: normalizedMessage || (hasImage ? "" : "Please help me with this image."),
        modality: hasImage ? "image" : "text",
        mediaUrl: hasImage ? imageBase64 : undefined,
        tokenCount: 0,
        hintUsed: false,
        timestamp: new Date().toISOString(),
      };
      const botMsg: Message = {
        id: uuidv4(),
        role: "assistant",
        content: safetyResult.message!,
        modality: "text",
        tokenCount: 0,
        hintUsed: false,
        timestamp: new Date().toISOString(),
      };

      if (conversationId) {
        const convo = await prisma.conversation.findUnique({
          where: { id: conversationId },
        });
        if (convo) {
          const existing: Message[] = JSON.parse(convo.messages);
          existing.push(userMsg, botMsg);
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { messages: JSON.stringify(existing) },
          });
        }
      }

      return new Response(JSON.stringify({ safetyResponse: safetyResult.message }), {
        status: 200,
      });
    }

    // Build prompt
    const standaloneFactLookup = isStandaloneFactLookup(normalizedMessage);
    const shouldIncludeConversationContext = shouldUseConversationContext(
      normalizedMessage
    );
    const retrievedProfileTopics = selectRelevantProfileTopics(
      profile,
      subject || "General",
      topic,
      normalizedMessage
    );
    const systemPrompt = buildSystemPrompt(
      profile,
      subject || "General",
      topic,
      retrievedProfileTopics
    );
    const sanitizedMessage = stripPII(
      normalizedMessage || "Please help me with this image."
    );
    logChatTrace(traceContext, "retrieval.profile_topics_selected", {
      weakTopics: retrievedProfileTopics.weakTopics,
      strongTopics: retrievedProfileTopics.strongTopics,
      sanitizedMessageLength: sanitizedMessage.length,
    });
    traceContext.hasProfileContext =
      retrievedProfileTopics.weakTopics.length > 0 || retrievedProfileTopics.strongTopics.length > 0;

    // Get conversation history
    let conversationMessages: { role: "user" | "assistant"; content: string }[] = [];
    let conversationSummary = "";
    let convoId = conversationId;

    if (conversationId) {
      const convo = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (convo) {
        const existing: Message[] = JSON.parse(convo.messages);
        if (!standaloneFactLookup && shouldIncludeConversationContext) {
          conversationSummary = extractConversationSummary(existing);
          conversationMessages = selectRelevantConversationMessages(
            existing,
            normalizedMessage || topic || subject || ""
          );
        }
        logChatTrace(traceContext, "retrieval.conversation_context_selected", {
          existingMessageCount: existing.length,
          retrievedMessageCount: conversationMessages.length,
          hasConversationSummary: Boolean(conversationSummary),
          standaloneFactLookup,
          shouldIncludeConversationContext,
        });
        traceContext.retrievedMessageCount = conversationMessages.length;
      }
    } else {
      // Create new conversation
      const newConvo = await prisma.conversation.create({
        data: {
          userId: session.user.id,
          subject: subject || "General",
          topic: topic || null,
          messages: "[]",
        },
      });
      convoId = newConvo.id;
      traceContext.conversationId = newConvo.id;
      logChatTrace(traceContext, "conversation.created");
    }

    const userMessageContent = hasImage
      ? [
          { type: "text" as const, text: sanitizedMessage },
          {
            type: "file" as const,
            data: imageAttachment.bytes,
            mediaType: imageAttachment.mediaType,
          },
        ]
      : sanitizedMessage;

    const userMsg: Message = {
      id: uuidv4(),
      role: "user",
      content: normalizedMessage || (hasImage ? "" : "Please help me with this image."),
      modality: hasImage ? "image" : "text",
      mediaUrl: hasImage ? imageBase64 : undefined,
      tokenCount: 0,
      hintUsed: false,
      timestamp: new Date().toISOString(),
    };

    if (convoId) {
      const convo = await prisma.conversation.findUnique({
        where: { id: convoId },
      });
      if (convo) {
        const existing: Message[] = JSON.parse(convo.messages);
        existing.push(userMsg);
        await prisma.conversation.update({
          where: { id: convoId },
          data: { messages: JSON.stringify(existing) },
        });
      }
    }

    // Stream from selected model
    const useWebGrounding =
      resolvedModelPreference === "auto" &&
      shouldUseWebGrounding(normalizedMessage, subject || "General");
    const finalSystemPrompt = conversationSummary
      ? `${systemPrompt}\n\nConversation summary:\n${conversationSummary}`
      : systemPrompt;
    logChatTrace(traceContext, "routing.completed", {
      useWebGrounding,
      retrievedConversationMessages: conversationMessages.length,
      hasConversationSummary: Boolean(conversationSummary),
      systemPromptLength: finalSystemPrompt.length,
      standaloneFactLookup,
    });
    traceContext.usedWebSearch = useWebGrounding;

    if (useWebGrounding) {
      const allGeminiOptions = getGeminiTextModelOptions();
      const geminiModelOptions = getGeminiOptionsForAttempt();
      let groundedResult: Awaited<ReturnType<typeof generateGroundedGeminiResponse>> | null = null;
      let groundedModelLabel = getGeminiChatModelLabel();
      let groundingError: unknown = null;

      if (geminiModelOptions.length !== allGeminiOptions.length) {
        for (const skippedOption of allGeminiOptions) {
          if (geminiModelOptions.some((option) => option.id === skippedOption.id)) {
            continue;
          }

          logChatTrace(traceContext, "generation.skipped_model_on_cooldown", {
            provider: "google",
            model: skippedOption.label,
            mode: "grounded",
            cooldownUntil: new Date(
              getGeminiModelCooldownUntil(skippedOption.id)
            ).toISOString(),
          });
        }
      }

      if (geminiModelOptions.length === 0) {
        groundingError = new Error("All Gemini models are on cooldown.");
      }

      for (const [index, geminiOption] of geminiModelOptions.entries()) {
        try {
          logChatTrace(traceContext, "generation.started", {
            provider: "google",
            model: geminiOption.label,
            mode: "grounded",
          });
          groundedResult = await generateGroundedGeminiResponse(
            geminiOption.id,
            finalSystemPrompt,
            [
              ...conversationMessages,
              { role: "user", content: userMessageContent },
            ]
          );
          groundedModelLabel = geminiOption.label;
          groundingError = null;
          clearGeminiModelCooldown(geminiOption.id);
          break;
        } catch (candidateError) {
          groundingError = candidateError;
          const errorDetails = getProviderErrorDetails(candidateError);
          const cooldownMs = shouldMarkGeminiCooldown(candidateError)
            ? markGeminiModelCooldown(geminiOption.id, candidateError)
            : null;
          logChatTrace(traceContext, "generation.failed", {
            provider: "google",
            model: geminiOption.label,
            mode: "grounded",
            errorType: errorDetails.type,
            errorMessage: errorDetails.message,
            cooldownMs,
          });

          const hasNextGeminiOption = index < geminiModelOptions.length - 1;
          if (isGeminiProviderUnavailable(candidateError) && hasNextGeminiOption) {
            logChatTrace(traceContext, "generation.retry_with_gemini_model", {
              fromModel: geminiOption.label,
              toModel: geminiModelOptions[index + 1]?.label,
            });
            continue;
          }

          break;
        }
      }

      try {
        if (!groundedResult) {
          throw groundingError;
        }
        const groundedText = sanitizeGroundedResponseText(groundedResult.text);

        const botMsg: Message = {
          id: uuidv4(),
          role: "assistant",
          content: groundedText,
          modality: "text",
          sources: mapSourcesToCitations(groundedResult.sources),
          tokenCount: groundedResult.usage.outputTokens || 0,
          hintUsed: false,
          timestamp: new Date().toISOString(),
        };

        if (convoId) {
          const convo = await prisma.conversation.findUnique({
            where: { id: convoId },
          });
          if (convo) {
            const existing: Message[] = JSON.parse(convo.messages);
            existing.push(botMsg);
            const nextMessages = upsertConversationSummary(existing);
            await prisma.conversation.update({
              where: { id: convoId },
              data: {
                messages: JSON.stringify(nextMessages),
                tokenCount: convo.tokenCount + (groundedResult.usage.totalTokens || 0),
              },
            });
          }
        }

        if (subscription) {
          await prisma.subscription.update({
            where: { userId: session.user.id },
            data: { dailyQuestionsUsed: { increment: 1 } },
          });
        }

        logChatTrace(traceContext, "generation.finished", {
          provider: "google",
          model: groundedModelLabel,
          mode: "grounded",
          inputTokens: groundedResult.usage.inputTokens || 0,
          outputTokens: groundedResult.usage.outputTokens || 0,
          totalTokens: groundedResult.usage.totalTokens || 0,
          sourceCount: botMsg.sources?.length || 0,
          responseLength: groundedText.length,
        });
        logChatTraceSummary(traceContext, {
          modelLabel: groundedModelLabel,
          inputTokens: groundedResult.usage.inputTokens || 0,
          outputTokens: groundedResult.usage.outputTokens || 0,
          totalTokens: groundedResult.usage.totalTokens || 0,
        });

        return NextResponse.json({
          groundedResponse: groundedText,
          sources: botMsg.sources || [],
        });
      } catch (groundingError) {
        if (!(isGeminiProviderUnavailable(groundingError) && isLocalLlmEnabled())) {
          throw groundingError;
        }

        logChatTrace(traceContext, "generation.fallback_to_local", {
          reason: "gemini_grounding_unavailable",
          fallbackModel: getLocalChatModelLabel(),
        });
      }
    }

    let standardModel =
      resolvedModelPreference === "premium" ? getPremiumChatModel() : getGeminiChatModel();
    let standardProvider = resolvedModelPreference === "premium" ? "openai" : "google";
    let standardModelLabel =
      resolvedModelPreference === "premium"
        ? getPremiumChatModelLabel()
        : getGeminiChatModelLabel();

    logChatTrace(traceContext, "generation.started", {
      provider: standardProvider,
      model: standardModelLabel,
      mode: "standard",
      localModelEnabled: isLocalLlmEnabled(),
    });

    if (resolvedModelPreference === "auto") {
      try {
        const allGeminiOptions = getGeminiTextModelOptions();
        const geminiOptions = getGeminiOptionsForAttempt();
        let autoResult: Awaited<ReturnType<typeof generateText>> | null = null;

        if (geminiOptions.length !== allGeminiOptions.length) {
          for (const skippedOption of allGeminiOptions) {
            if (geminiOptions.some((option) => option.id === skippedOption.id)) {
              continue;
            }

            logChatTrace(traceContext, "generation.skipped_model_on_cooldown", {
              provider: "google",
              model: skippedOption.label,
              mode: "standard",
              cooldownUntil: new Date(
                getGeminiModelCooldownUntil(skippedOption.id)
              ).toISOString(),
            });
          }
        }

        if (geminiOptions.length === 0) {
          throw new Error("All Gemini models are on cooldown.");
        }

        for (const [index, geminiOption] of geminiOptions.entries()) {
          try {
            if (index > 0) {
              logChatTrace(traceContext, "generation.retry_with_gemini_model", {
                fromModel: standardModelLabel,
                toModel: geminiOption.label,
              });
            }

            standardModel = google(geminiOption.id);
            standardProvider = "google";
            standardModelLabel = geminiOption.label;

            logChatTrace(traceContext, "generation.started", {
              provider: standardProvider,
              model: standardModelLabel,
              mode: "standard",
              localModelEnabled: isLocalLlmEnabled(),
            });

            autoResult = await generateText({
              model: standardModel,
              system: finalSystemPrompt,
              messages: [
                ...conversationMessages,
                { role: "user", content: userMessageContent },
              ],
              maxOutputTokens: 500,
              temperature: 0.7,
            });
            clearGeminiModelCooldown(geminiOption.id);
            break;
          } catch (candidateError) {
            const errorDetails = getProviderErrorDetails(candidateError);
            const cooldownMs = shouldMarkGeminiCooldown(candidateError)
              ? markGeminiModelCooldown(geminiOption.id, candidateError)
              : null;
            logChatTrace(traceContext, "generation.failed", {
              provider: "google",
              model: geminiOption.label,
              mode: "standard",
              errorType: errorDetails.type,
              errorMessage: errorDetails.message,
              cooldownMs,
            });

            const hasNextGeminiOption = index < geminiOptions.length - 1;
            if (isGeminiProviderUnavailable(candidateError) && hasNextGeminiOption) {
              continue;
            }

            throw candidateError;
          }
        }

        if (!autoResult) {
          throw new Error("Auto mode could not generate a response.");
        }

        logChatTrace(traceContext, "generation.finished", {
          provider: standardProvider,
          model: standardModelLabel,
          mode: "standard",
          inputTokens: autoResult.usage.inputTokens || 0,
          outputTokens: autoResult.usage.outputTokens || 0,
          totalTokens: autoResult.usage.totalTokens || 0,
          responseLength: autoResult.text.length,
        });
        logChatTraceSummary(traceContext, {
          modelLabel: standardModelLabel,
          inputTokens: autoResult.usage.inputTokens || 0,
          outputTokens: autoResult.usage.outputTokens || 0,
          totalTokens: autoResult.usage.totalTokens || 0,
        });

        await persistAssistantMessage({
          conversationId: convoId,
          content: autoResult.text,
          outputTokens: autoResult.usage.outputTokens || 0,
          totalTokens: autoResult.usage.totalTokens || 0,
        });
        await incrementSubscriptionUsage(userId);

        return NextResponse.json({
          assistantResponse: autoResult.text,
        });
      } catch (standardError) {
        const errorDetails = getProviderErrorDetails(standardError);
        logChatTrace(traceContext, "generation.failed", {
          provider: standardProvider,
          model: standardModelLabel,
          mode: "standard",
          errorType: errorDetails.type,
          errorMessage: errorDetails.message,
        });

        const shouldFallbackToLocal =
          isLocalLlmEnabled() &&
          isGeminiProviderUnavailable(standardError);

        if (!shouldFallbackToLocal) {
          throw standardError;
        }

        standardModel = getLocalChatModel();
        standardProvider = "local";
        standardModelLabel = getLocalChatModelLabel();

        logChatTrace(traceContext, "generation.fallback_to_local", {
          reason: "gemini_standard_unavailable",
          fallbackModel: standardModelLabel,
        });

        const fallbackResult = await generateText({
          model: standardModel,
          system: finalSystemPrompt,
          messages: [
            ...conversationMessages,
            { role: "user", content: userMessageContent },
          ],
          maxOutputTokens: 500,
          temperature: 0.7,
        });

        logChatTrace(traceContext, "generation.finished", {
          provider: standardProvider,
          model: standardModelLabel,
          mode: "standard",
          inputTokens: fallbackResult.usage.inputTokens || 0,
          outputTokens: fallbackResult.usage.outputTokens || 0,
          totalTokens: fallbackResult.usage.totalTokens || 0,
          responseLength: fallbackResult.text.length,
        });
        logChatTraceSummary(traceContext, {
          modelLabel: standardModelLabel,
          inputTokens: fallbackResult.usage.inputTokens || 0,
          outputTokens: fallbackResult.usage.outputTokens || 0,
          totalTokens: fallbackResult.usage.totalTokens || 0,
        });

        await persistAssistantMessage({
          conversationId: convoId,
          content: fallbackResult.text,
          outputTokens: fallbackResult.usage.outputTokens || 0,
          totalTokens: fallbackResult.usage.totalTokens || 0,
        });
        await incrementSubscriptionUsage(userId);

        return NextResponse.json({
          assistantResponse: fallbackResult.text,
        });
      }
    }

    try {
      const result = streamText({
        model: standardModel,
        system: finalSystemPrompt,
        messages: [
          ...conversationMessages,
          { role: "user", content: userMessageContent },
        ],
        maxOutputTokens: 500,
        temperature: 0.7,
        onFinish: async ({ text, usage }) => {
          logChatTrace(traceContext, "generation.finished", {
            provider: standardProvider,
            model: standardModelLabel,
            mode: "standard",
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            totalTokens: usage.totalTokens || 0,
            responseLength: text.length,
          });
          logChatTraceSummary(traceContext, {
            modelLabel: standardModelLabel,
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            totalTokens: usage.totalTokens || 0,
          });

          const botMsg: Message = {
            id: uuidv4(),
            role: "assistant",
            content: text,
            modality: "text",
            tokenCount: usage.outputTokens || 0,
            hintUsed: false,
            timestamp: new Date().toISOString(),
          };

          await persistAssistantMessage({
            conversationId: convoId,
            content: botMsg.content,
            outputTokens: usage.outputTokens || 0,
            totalTokens: usage.totalTokens || 0,
          });
          await incrementSubscriptionUsage(userId);
        },
      });

      return result.toTextStreamResponse({
        headers: {
          "X-Conversation-Id": convoId || "",
        },
      });
    } catch (standardError) {
      const errorDetails = getProviderErrorDetails(standardError);
      logChatTrace(traceContext, "generation.failed", {
        provider: standardProvider,
        model: standardModelLabel,
        mode: "standard",
        errorType: errorDetails.type,
        errorMessage: errorDetails.message,
      });
      throw standardError;
    }
  } catch (error) {
    console.error("Chat error:", error);

    if (fallbackUserMessage) {
      try {
        if (fallbackTraceContext) {
          logChatTrace(fallbackTraceContext, "generation.fallback_to_google_summary", {
            reason: "all_generation_paths_failed",
          });
        }

        const emergencyResult = await generateEmergencyGoogleSummary({
          message: fallbackUserMessage,
          subject: fallbackSubject,
          topic: fallbackTopic,
        });

        if (emergencyResult?.text?.trim()) {
          const fallbackText = emergencyResult.text.trim();

          if (fallbackTraceContext) {
            logChatTrace(fallbackTraceContext, "generation.finished", {
              provider: "google",
              model: "gemini-2.5-flash",
              mode: "emergency_summary",
              inputTokens: emergencyResult.usage.inputTokens || 0,
              outputTokens: emergencyResult.usage.outputTokens || 0,
              totalTokens: emergencyResult.usage.totalTokens || 0,
              responseLength: fallbackText.length,
            });
          }

          if (fallbackConversationId) {
            const convo = await prisma.conversation.findUnique({
              where: { id: fallbackConversationId },
            });

            if (convo) {
              const existing: Message[] = JSON.parse(convo.messages);
              existing.push({
                id: uuidv4(),
                role: "assistant",
                content: fallbackText,
                modality: "text",
                tokenCount: emergencyResult.usage.outputTokens || 0,
                hintUsed: false,
                timestamp: new Date().toISOString(),
              });
              const nextMessages = upsertConversationSummary(existing);
              await prisma.conversation.update({
                where: { id: fallbackConversationId },
                data: {
                  messages: JSON.stringify(nextMessages),
                  tokenCount: convo.tokenCount + (emergencyResult.usage.totalTokens || 0),
                },
              });
            }
          }

          const subscription = await prisma.subscription.findUnique({
            where: { userId },
          });

          if (subscription) {
            await prisma.subscription.update({
              where: { userId },
              data: { dailyQuestionsUsed: { increment: 1 } },
            });
          }

          return NextResponse.json({
            assistantResponse: fallbackText,
          });
        }
      } catch (emergencyError) {
        console.error("Emergency Google summary fallback error:", emergencyError);

        if (fallbackTraceContext) {
          const emergencyErrorDetails = getProviderErrorDetails(emergencyError);
          logChatTrace(fallbackTraceContext, "generation.failed", {
            provider: "google",
            model: "gemini-2.5-flash",
            mode: "emergency_summary",
            errorType: emergencyErrorDetails.type,
            errorMessage: emergencyErrorDetails.message,
          });
        }
      }
    }

    if (isLocalProviderUnavailable(error)) {
      return buildLocalUnavailableResponse();
    }

    if (isPremiumProviderUnavailable(error)) {
      return buildPremiumUnavailableResponse();
    }

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
    });
  }
}
