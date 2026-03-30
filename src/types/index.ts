export type Role = "STUDENT" | "PARENT" | "ADMIN";
export type Board = "CBSE" | "ICSE" | "STATE";
export type Tier = "FREE" | "BASIC" | "PRO";
export type SubStatus = "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING";
export type AbilityBand = "Beginner" | "Developing" | "Proficient" | "Advanced";
export type Modality = "text" | "voice" | "image";

export interface SourceCitation {
  title: string;
  url?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  modality: Modality;
  mediaUrl?: string;
  sources?: SourceCitation[];
  tokenCount: number;
  hintUsed: boolean;
  timestamp: string;
}

export interface StudentProfileData {
  id: string;
  userId: string;
  grade: number;
  board: Board;
  preferredLang: string;
  subjects: string[];
  weakTopics: string[];
  strongTopics: string[];
  abilityScores: Record<string, number>;
  totalSessions: number;
}

export interface SubscriptionData {
  id: string;
  userId: string;
  tier: Tier;
  status: SubStatus;
  dailyQuestionsUsed: number;
  dailyQuestionsMax: number;
}

export interface ConversationData {
  id: string;
  userId: string;
  subject: string;
  topic: string | null;
  messages: Message[];
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export const SUBJECTS = [
  "Mathematics",
  "Science",
  "Social Science",
  "English",
  "Hindi",
] as const;

export const BOARDS: { value: Board; label: string }[] = [
  { value: "CBSE", label: "CBSE" },
  { value: "ICSE", label: "ICSE" },
  { value: "STATE", label: "State Board" },
];

export const GRADES = Array.from({ length: 5 }, (_, i) => i + 6); // 6-10

export const TIER_LIMITS: Record<Tier, { dailyMax: number; subjects: string[]; modalities: Modality[] }> = {
  FREE: {
    dailyMax: 10,
    subjects: ["Mathematics"],
    modalities: ["text"],
  },
  BASIC: {
    dailyMax: 50,
    subjects: ["Mathematics", "Science", "Social Science", "English", "Hindi"],
    modalities: ["text", "voice"],
  },
  PRO: {
    dailyMax: 999999,
    subjects: ["Mathematics", "Science", "Social Science", "English", "Hindi"],
    modalities: ["text", "voice", "image"],
  },
};
