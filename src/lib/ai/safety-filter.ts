const BLOCKED_PATTERNS = [
  /\b(bomb|weapon|drug|suicide|kill|murder)\b/i,
  /\b(porn|xxx|nude|naked|sex)\b/i,
  /\b(hack|crack|pirate|torrent)\b/i,
];

const DISTRESS_PATTERNS = [
  /\b(bullied|bullying|abuse|abused|depressed|kill myself|hurt myself|self.?harm)\b/i,
  /\b(nobody loves me|want to die|end it all)\b/i,
];

const EXAM_CHEAT_PATTERNS = [
  /\b(exam paper|test paper|answer key|cheat sheet)\b/i,
  /\b(write my essay|do my homework|complete my assignment)\b/i,
];

export interface SafetyCheckResult {
  safe: boolean;
  type?: "blocked" | "distress" | "exam_cheat" | "off_topic";
  message?: string;
}

export function checkSafety(input: string): SafetyCheckResult {
  // Check for distress first (empathy response, not block)
  for (const pattern of DISTRESS_PATTERNS) {
    if (pattern.test(input)) {
      return {
        safe: false,
        type: "distress",
        message:
          "It sounds like you're going through something really tough. Please talk to a trusted adult at home or school — they can help much more than I can. 💛 If you'd like, we can get back to studying whenever you're ready.",
      };
    }
  }

  // Check for blocked content
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(input)) {
      return {
        safe: false,
        type: "blocked",
        message:
          "I'm here to help with your school subjects! Let's focus on learning. What topic would you like to explore?",
      };
    }
  }

  // Check for exam cheating
  for (const pattern of EXAM_CHEAT_PATTERNS) {
    if (pattern.test(input)) {
      return {
        safe: false,
        type: "exam_cheat",
        message:
          "I can help you understand the topic so you can write it yourself — want to try that? Understanding the concept will help you more in the long run! 📚",
      };
    }
  }

  return { safe: true };
}

/**
 * Strip any PII from the prompt before sending to the LLM.
 * We only send anonymized student context, never real names or emails.
 */
export function stripPII(text: string): string {
  // Remove email addresses
  let cleaned = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  // Remove phone numbers (Indian format)
  cleaned = cleaned.replace(/(\+91[\s-]?)?[6-9]\d{9}/g, "[PHONE]");
  // Remove Aadhaar numbers
  cleaned = cleaned.replace(/\d{4}\s?\d{4}\s?\d{4}/g, "[ID]");
  return cleaned;
}
