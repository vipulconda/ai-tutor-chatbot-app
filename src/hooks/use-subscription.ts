"use client";

import { useState, useEffect, useCallback } from "react";
import type { SubscriptionData, Tier } from "@/types";
import { TIER_LIMITS } from "@/types";

export interface UseSubscriptionReturn {
  subscription: SubscriptionData | null;
  loading: boolean;
  tier: Tier;
  isQuotaExceeded: boolean;
  remainingQuestions: number;
  canUseModality: (modality: "text" | "voice" | "image") => boolean;
  canAccessSubject: (subject: string) => boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook to check and manage user subscription state, quotas, and entitlements.
 */
export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription/status");
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
      }
    } catch (err) {
      console.error("Failed to fetch subscription:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const tier: Tier = subscription?.tier || "FREE";
  const limits = TIER_LIMITS[tier];

  const isQuotaExceeded =
    subscription
      ? subscription.dailyQuestionsUsed >= subscription.dailyQuestionsMax
      : false;

  const remainingQuestions =
    subscription
      ? Math.max(0, subscription.dailyQuestionsMax - subscription.dailyQuestionsUsed)
      : 10;

  const canUseModality = useCallback(
    (modality: "text" | "voice" | "image") => {
      return limits.modalities.includes(modality);
    },
    [limits]
  );

  const canAccessSubject = useCallback(
    (subject: string) => {
      return limits.subjects.includes(subject);
    },
    [limits]
  );

  return {
    subscription,
    loading,
    tier,
    isQuotaExceeded,
    remainingQuestions,
    canUseModality,
    canAccessSubject,
    refresh: fetchSubscription,
  };
}
