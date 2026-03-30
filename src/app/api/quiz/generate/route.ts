import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import {
  clearGeminiModelCooldown,
  getAvailableGeminiTextModelOptions,
  getGeminiTextModelOptions,
  getGeminiModelCooldownUntil,
  getLocalChatModel,
  getLocalChatModelLabel,
  isLocalLlmEnabled,
  markGeminiModelCooldown,
} from "@/lib/llm";
import {
  buildQuizPrompt,
  type QuizQuestion,
  parseQuizResponse,
  selectQuizTopicsForSubject,
  shouldUseGroundedQuizGeneration,
} from "@/lib/ai/quiz-generator";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limiter";
import type { StudentProfileData, Board } from "@/types";

interface QuizTraceContext {
  traceId: string;
  userId: string;
  subject: string;
  grade?: string;
  board?: Board;
  usedGroundedSearch?: boolean;
  usedProfileTopics?: boolean;
  requestedTopicCount?: number;
  finalTopicCount?: number;
}

type QuizProviderErrorType =
  | "quota_exceeded"
  | "rate_limited"
  | "invalid_api_key"
  | "model_not_found"
  | "connection_failed"
  | "provider_error"
  | "unknown";

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

function logQuizTrace(
  context: QuizTraceContext,
  step: string,
  details: Record<string, unknown> = {}
) {
  const scope = [
    `user=${context.userId}`,
    `subject=${context.subject}`,
    `grade=${context.grade || "none"}`,
    `board=${context.board || "none"}`,
  ].join(" | ");
  const detailText = formatTraceDetails(details);

  console.info(
    `[quiz-trace:${context.traceId}] ${step}\n  ${scope}${detailText ? `\n  ${detailText}` : ""}`
  );
}

function logQuizTraceSummary(
  context: QuizTraceContext,
  details: {
    modelLabel: string;
    questionCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }
) {
  console.info(
    `[quiz-trace:${context.traceId}] summary\n` +
      `  Quiz request received\n` +
      `  Used profile topics: ${context.usedProfileTopics ? "yes" : "no"}\n` +
      `  Used grounded search: ${context.usedGroundedSearch ? "yes" : "no"}\n` +
      `  Topics used: ${context.finalTopicCount || 0}\n` +
      `  Model: ${details.modelLabel}\n` +
      `  Questions generated: ${details.questionCount}\n` +
      `  Tokens: ${details.inputTokens} in / ${details.outputTokens} out / ${details.totalTokens} total`
  );
}

function isGeminiProviderUnavailable(error: unknown) {
  const errorType = getProviderErrorDetails(error).type;

  return (
    errorType === "quota_exceeded" ||
    errorType === "rate_limited" ||
    errorType === "connection_failed" ||
    errorType === "provider_error" ||
    (error instanceof Error &&
      error.message.toLowerCase().includes("all gemini models are on cooldown"))
  );
}

function getProviderErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      type: "unknown" as QuizProviderErrorType,
      message: "Unknown provider error",
    };
  }

  const message = error.message;
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("resource_exhausted") ||
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
    normalizedMessage.includes("api key not valid")
  ) {
    return {
      type: "invalid_api_key",
      message,
    };
  }

  if (
    normalizedMessage.includes("model '") ||
    normalizedMessage.includes("not found")
  ) {
    return {
      type: "model_not_found",
      message,
    };
  }

  if (
    normalizedMessage.includes("connection refused") ||
    normalizedMessage.includes("127.0.0.1")
  ) {
    return {
      type: "connection_failed",
      message,
    };
  }

  return {
    type: "provider_error" as QuizProviderErrorType,
    message,
  };
}

function shouldMarkGeminiCooldown(error: unknown) {
  const errorType = getProviderErrorDetails(error).type;
  return errorType === "quota_exceeded" || errorType === "rate_limited";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const rateCheck = checkRateLimit(`quiz:${session.user.id}`, RATE_LIMITS.quiz);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute." },
      { status: 429 }
    );
  }

  try {
    const { subject, topics, questionCount = 5 } = await req.json();
    const traceContext: QuizTraceContext = {
      traceId: Math.random().toString(16).slice(2, 10),
      userId: session.user.id,
      subject: typeof subject === "string" && subject.trim().length > 0 ? subject : "unknown",
    };

    logQuizTrace(traceContext, "request.received", {
      requestedQuestionCount: questionCount,
      requestedTopicCount: Array.isArray(topics) ? topics.length : 0,
      topics,
    });

    if (!subject) {
      logQuizTrace(traceContext, "request.rejected", {
        reason: "missing_subject",
      });
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }

    // Load student profile
    const profileRaw = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (!profileRaw) {
      logQuizTrace(traceContext, "request.rejected", {
        reason: "profile_missing",
      });
      return NextResponse.json(
        { error: "Please complete your profile first" },
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
    traceContext.grade = String(profile.grade);
    traceContext.board = profile.board;

    logQuizTrace(traceContext, "profile.loaded", {
      weakTopicCount: profile.weakTopics.length,
      strongTopicCount: profile.strongTopics.length,
      weakTopics: profile.weakTopics.slice(0, 5),
      strongTopics: profile.strongTopics.slice(0, 5),
    });

    // Use weak topics if no topics specified
    const normalizedTopics = Array.isArray(topics)
      ? topics.filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0)
      : [];

    const requestedQuizTopics = selectQuizTopicsForSubject(subject, normalizedTopics);
    const quizTopics = requestedQuizTopics;
    traceContext.usedProfileTopics = false;
    traceContext.requestedTopicCount = requestedQuizTopics.length;
    traceContext.finalTopicCount = quizTopics.length;

    logQuizTrace(traceContext, "retrieval.topics_selected", {
      usedProfileTopics: false,
      requestedTopicCount: requestedQuizTopics.length,
      requestedTopics: requestedQuizTopics,
      finalTopicCount: quizTopics.length,
      topics: quizTopics,
    });

    const prompt = buildQuizPrompt(profile, {
      subject,
      topics: quizTopics,
      questionCount: Math.min(questionCount, 10), // Cap at 10
      difficulty: "adaptive",
    });
    const useGroundedQuizGeneration = shouldUseGroundedQuizGeneration(subject, quizTopics);
    traceContext.usedGroundedSearch = useGroundedQuizGeneration;

    logQuizTrace(traceContext, "routing.completed", {
      useGroundedSearch: useGroundedQuizGeneration,
      promptLength: prompt.length,
      finalQuestionCount: Math.min(questionCount, 10),
    });

    let questions: QuizQuestion[] | null = null;
    let quizWarning: string | null = null;

    const allGeminiModelOptions = getGeminiTextModelOptions();
    const geminiModelOptions = getAvailableGeminiTextModelOptions();
    let geminiGenerationError: unknown = null;

    if (geminiModelOptions.length !== allGeminiModelOptions.length) {
      for (const skippedOption of allGeminiModelOptions) {
        if (geminiModelOptions.some((option) => option.id === skippedOption.id)) {
          continue;
        }

        logQuizTrace(traceContext, "generation.skipped_model_on_cooldown", {
          provider: "google",
          model: skippedOption.label,
          mode: useGroundedQuizGeneration ? "grounded" : "standard",
          cooldownUntil: new Date(
            getGeminiModelCooldownUntil(skippedOption.id)
          ).toISOString(),
        });
      }
    }

    if (geminiModelOptions.length === 0) {
      geminiGenerationError = new Error("All Gemini models are on cooldown.");
    }

    for (const [index, geminiOption] of geminiModelOptions.entries()) {
      try {
        logQuizTrace(traceContext, "generation.started", {
          provider: "google",
          model: geminiOption.label,
          mode: useGroundedQuizGeneration ? "grounded" : "standard",
        });

        const result = await generateText({
          model: google(geminiOption.id),
          prompt,
          tools: useGroundedQuizGeneration
            ? {
                google_search: google.tools.googleSearch({}),
              }
            : undefined,
          maxOutputTokens: 2000,
          temperature: 0.7,
        });

        const parsedQuiz = parseQuizResponse(result.text, quizTopics);
        if (parsedQuiz.ok) {
          questions = parsedQuiz.questions;
          clearGeminiModelCooldown(geminiOption.id);
          logQuizTrace(traceContext, "generation.finished", {
            provider: "google",
            model: geminiOption.label,
            mode: useGroundedQuizGeneration ? "grounded" : "standard",
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            totalTokens: result.usage?.totalTokens ?? 0,
            questionCount: questions.length,
          });
          logQuizTraceSummary(traceContext, {
            modelLabel: geminiOption.label,
            questionCount: questions.length,
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            totalTokens: result.usage?.totalTokens ?? 0,
          });
          geminiGenerationError = null;
          break;
        }

        logQuizTrace(traceContext, "generation.parse_failed", {
          provider: "google",
          model: geminiOption.label,
          mode: useGroundedQuizGeneration ? "grounded" : "standard",
          parseError: parsedQuiz.error,
        });

        const retryResult = await generateText({
          model: google(geminiOption.id),
          prompt,
          maxOutputTokens: 2000,
          temperature: 0.4,
        });

        const parsedRetryQuiz = parseQuizResponse(retryResult.text, quizTopics);

        if (parsedRetryQuiz.ok) {
          questions = parsedRetryQuiz.questions;
          clearGeminiModelCooldown(geminiOption.id);
          quizWarning =
            "The first quiz draft was malformed, so we regenerated it before showing it to you.";
          logQuizTrace(traceContext, "generation.finished", {
            provider: "google",
            model: geminiOption.label,
            mode: "retry_standard",
            inputTokens: retryResult.usage?.inputTokens ?? 0,
            outputTokens: retryResult.usage?.outputTokens ?? 0,
            totalTokens: retryResult.usage?.totalTokens ?? 0,
            questionCount: questions.length,
          });
          logQuizTraceSummary(traceContext, {
            modelLabel: geminiOption.label,
            questionCount: questions.length,
            inputTokens: retryResult.usage?.inputTokens ?? 0,
            outputTokens: retryResult.usage?.outputTokens ?? 0,
            totalTokens: retryResult.usage?.totalTokens ?? 0,
          });
          geminiGenerationError = null;
          break;
        }

        quizWarning = parsedRetryQuiz.error;
        geminiGenerationError = new Error(parsedRetryQuiz.error);
        logQuizTrace(traceContext, "generation.parse_failed", {
          provider: "google",
          model: geminiOption.label,
          mode: "retry_standard",
          parseError: parsedRetryQuiz.error,
        });
      } catch (generationError) {
        geminiGenerationError = generationError;
        const errorDetails = getProviderErrorDetails(generationError);
        const cooldownMs = shouldMarkGeminiCooldown(generationError)
          ? markGeminiModelCooldown(geminiOption.id, generationError)
          : null;
        logQuizTrace(traceContext, "generation.failed", {
          provider: "google",
          model: geminiOption.label,
          mode: useGroundedQuizGeneration ? "grounded" : "standard",
          errorType: errorDetails.type,
          errorMessage: errorDetails.message,
          cooldownMs,
        });

        const hasNextGeminiOption = index < geminiModelOptions.length - 1;
        if (isGeminiProviderUnavailable(generationError) && hasNextGeminiOption) {
          logQuizTrace(traceContext, "generation.retry_with_gemini_model", {
            fromModel: geminiOption.label,
            toModel: geminiModelOptions[index + 1]?.label,
          });
          continue;
        }

        break;
      }
    }

    try {
      if (geminiGenerationError) {
        throw geminiGenerationError;
      }
    } catch (generationError) {
      console.error("Quiz generation model error:", generationError);

      const canFallbackToLocal =
        isLocalLlmEnabled() && isGeminiProviderUnavailable(generationError);

      if (canFallbackToLocal) {
        logQuizTrace(traceContext, "generation.fallback_to_local", {
          reason: useGroundedQuizGeneration
            ? "gemini_grounded_unavailable"
            : "gemini_standard_unavailable",
          fallbackModel: getLocalChatModelLabel(),
        });

        try {
          logQuizTrace(traceContext, "generation.started", {
            provider: "local",
            model: getLocalChatModelLabel(),
            mode: "standard",
          });

          const fallbackResult = await generateText({
            model: getLocalChatModel(),
            prompt,
            maxOutputTokens: 2000,
            temperature: 0.7,
          });

          const parsedFallbackQuiz = parseQuizResponse(fallbackResult.text, quizTopics);
          if (parsedFallbackQuiz.ok) {
            questions = parsedFallbackQuiz.questions;
            quizWarning = `Gemini was unavailable, so the quiz was generated using ${getLocalChatModelLabel()}.`;
            logQuizTrace(traceContext, "generation.finished", {
              provider: "local",
              model: getLocalChatModelLabel(),
              mode: "standard",
              inputTokens: fallbackResult.usage?.inputTokens ?? 0,
              outputTokens: fallbackResult.usage?.outputTokens ?? 0,
              totalTokens: fallbackResult.usage?.totalTokens ?? 0,
              questionCount: questions.length,
            });
            logQuizTraceSummary(traceContext, {
              modelLabel: getLocalChatModelLabel(),
              questionCount: questions.length,
              inputTokens: fallbackResult.usage?.inputTokens ?? 0,
              outputTokens: fallbackResult.usage?.outputTokens ?? 0,
              totalTokens: fallbackResult.usage?.totalTokens ?? 0,
            });
          } else {
            quizWarning = parsedFallbackQuiz.error;
            logQuizTrace(traceContext, "generation.parse_failed", {
              provider: "local",
              model: getLocalChatModelLabel(),
              mode: "standard",
              parseError: parsedFallbackQuiz.error,
            });
          }
        } catch (localError) {
          console.error("Quiz local fallback error:", localError);
          const localErrorDetails = getProviderErrorDetails(localError);
          logQuizTrace(traceContext, "generation.failed", {
            provider: "local",
            model: getLocalChatModelLabel(),
            mode: "standard",
            errorType: localErrorDetails.type,
            errorMessage: localErrorDetails.message,
          });
          quizWarning =
            "Quiz generation is limited right now because Gemini is unavailable and the local model is not ready yet.";
        }
      } else {
        quizWarning =
          "We couldn't reach the quiz model right now. Please try again shortly.";
      }
    }

    return NextResponse.json({
      questions: questions ?? [],
      subject,
      topics: quizTopics,
      questionCount: questions?.length ?? 0,
      error: quizWarning,
    });
  } catch (error) {
    console.error("Quiz generation error:", error);
    return NextResponse.json(
      {
        questions: [],
        subject: "General",
        topics: [],
        questionCount: 0,
        error: "Failed to generate quiz",
      },
      { status: 500 }
    );
  }
}
