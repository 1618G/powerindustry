/**
 * Honeypot Service - Bot Detection and Prevention
 *
 * PURPOSE: Detect and block automated bot submissions using honeypot fields
 *
 * USAGE:
 * // In component
 * <HoneypotInputs />
 *
 * // In action
 * const botDetected = validateHoneypot(formData);
 * if (botDetected) return json({ error: "Submission blocked" }, { status: 400 });
 *
 * LAYER: Security Service
 */

import crypto from "crypto";
import { logSecurityEvent } from "./soc2-compliance.server";
import { BadRequestError } from "~/lib/errors";

// ============================================
// Configuration
// ============================================

// Honeypot field names - use innocuous names that bots might fill
const HONEYPOT_FIELDS = {
  // Text field that should remain empty
  textField: "website_url_field",
  // Email field that should remain empty
  emailField: "contact_email_address",
  // Phone field that should remain empty
  phoneField: "phone_number_field",
  // Timestamp field for timing analysis
  timestampField: "_hp_ts",
  // Encrypted validation field
  validationField: "_hp_v",
} as const;

// Minimum time (ms) for a human to fill out a form
const MIN_SUBMISSION_TIME_MS = 2000; // 2 seconds

// Maximum time (ms) for a valid form submission
const MAX_SUBMISSION_TIME_MS = 3600000; // 1 hour

// ============================================
// Types
// ============================================

export interface HoneypotConfig {
  /** Field names to use (overrides defaults) */
  fields?: Partial<typeof HONEYPOT_FIELDS>;
  /** Minimum time for submission in ms */
  minTime?: number;
  /** Maximum time for submission in ms */
  maxTime?: number;
  /** Enable timing-based detection */
  enableTiming?: boolean;
  /** Custom encryption seed */
  seed?: string;
}

export interface HoneypotResult {
  isBot: boolean;
  reason?: string;
  details?: {
    filledFields: string[];
    submissionTimeMs?: number;
    timingViolation?: "too_fast" | "too_slow";
  };
}

export interface HoneypotFieldValues {
  /** Timestamp when form was rendered */
  timestamp: string;
  /** Encrypted validation value */
  validation: string;
}

// ============================================
// Field Value Generation
// ============================================

/**
 * Generate honeypot field values for form rendering
 */
export function generateHoneypotValues(seed?: string): HoneypotFieldValues {
  const timestamp = Date.now().toString(36);
  const secret = seed || process.env.SESSION_SECRET || "honeypot-secret";
  
  // Create encrypted validation that includes timestamp
  const validation = crypto
    .createHmac("sha256", secret)
    .update(timestamp)
    .digest("hex")
    .substring(0, 16);

  return {
    timestamp,
    validation,
  };
}

/**
 * Get all honeypot field names (for form rendering)
 */
export function getHoneypotFieldNames(config?: HoneypotConfig): typeof HONEYPOT_FIELDS {
  return {
    ...HONEYPOT_FIELDS,
    ...config?.fields,
  };
}

// ============================================
// Validation
// ============================================

/**
 * Validate form submission for bot activity
 * Returns HoneypotResult with detection details
 */
export function validateHoneypot(
  formData: FormData,
  config?: HoneypotConfig
): HoneypotResult {
  const fields = getHoneypotFieldNames(config);
  const minTime = config?.minTime ?? MIN_SUBMISSION_TIME_MS;
  const maxTime = config?.maxTime ?? MAX_SUBMISSION_TIME_MS;
  const enableTiming = config?.enableTiming ?? true;
  const secret = config?.seed || process.env.SESSION_SECRET || "honeypot-secret";

  const filledFields: string[] = [];
  let timingViolation: "too_fast" | "too_slow" | undefined;
  let submissionTimeMs: number | undefined;

  // Check text honeypot fields (should be empty)
  const textFieldValue = formData.get(fields.textField);
  if (textFieldValue && String(textFieldValue).trim() !== "") {
    filledFields.push(fields.textField);
  }

  const emailFieldValue = formData.get(fields.emailField);
  if (emailFieldValue && String(emailFieldValue).trim() !== "") {
    filledFields.push(fields.emailField);
  }

  const phoneFieldValue = formData.get(fields.phoneField);
  if (phoneFieldValue && String(phoneFieldValue).trim() !== "") {
    filledFields.push(fields.phoneField);
  }

  // Check timing if enabled
  if (enableTiming) {
    const timestamp = formData.get(fields.timestampField);
    const validation = formData.get(fields.validationField);

    if (timestamp && validation) {
      const timestampStr = String(timestamp);
      const validationStr = String(validation);

      // Verify validation hash
      const expectedValidation = crypto
        .createHmac("sha256", secret)
        .update(timestampStr)
        .digest("hex")
        .substring(0, 16);

      if (validationStr === expectedValidation) {
        const formRenderTime = parseInt(timestampStr, 36);
        submissionTimeMs = Date.now() - formRenderTime;

        if (submissionTimeMs < minTime) {
          timingViolation = "too_fast";
        } else if (submissionTimeMs > maxTime) {
          timingViolation = "too_slow";
        }
      }
    }
  }

  // Determine if bot
  const isBot = filledFields.length > 0 || timingViolation === "too_fast";

  // Build reason string
  let reason: string | undefined;
  if (isBot) {
    const reasons: string[] = [];
    if (filledFields.length > 0) {
      reasons.push(`filled honeypot fields: ${filledFields.join(", ")}`);
    }
    if (timingViolation === "too_fast") {
      reasons.push(`submission too fast (${submissionTimeMs}ms < ${minTime}ms)`);
    }
    reason = reasons.join("; ");
  }

  return {
    isBot,
    reason,
    details: {
      filledFields,
      submissionTimeMs,
      timingViolation,
    },
  };
}

/**
 * Validate and throw if bot detected
 */
export async function requireHumanSubmission(
  request: Request,
  formData: FormData,
  config?: HoneypotConfig
): Promise<void> {
  const result = validateHoneypot(formData, config);

  if (result.isBot) {
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    const userAgent = request.headers.get("user-agent") || undefined;
    const url = new URL(request.url);

    await logSecurityEvent("bot_detected", "medium", `Bot submission blocked: ${result.reason}`, {
      ipAddress,
      userAgent,
      metadata: {
        path: url.pathname,
        ...result.details,
      },
    });

    // Throw generic error to not reveal detection method
    throw new BadRequestError("Unable to process your request. Please try again.");
  }
}

// ============================================
// React Component Props Generator
// ============================================

/**
 * Generate props for honeypot hidden inputs
 * Use with spread operator in React components
 */
export function getHoneypotInputProps(config?: HoneypotConfig): {
  fields: Array<{
    name: string;
    type: "text" | "email" | "tel" | "hidden";
    tabIndex: number;
    autoComplete: string;
    "aria-hidden": boolean;
    style: Record<string, string | number>;
    defaultValue?: string;
  }>;
  styles: string;
} {
  const fieldNames = getHoneypotFieldNames(config);
  const values = generateHoneypotValues(config?.seed);

  // Hidden styles to apply to container
  const styles = `
    position: absolute !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    height: 1px !important;
    width: 1px !important;
    margin: -1px !important;
    padding: 0 !important;
    border: 0 !important;
  `;

  return {
    fields: [
      // Visible (but hidden with CSS) honeypot fields
      {
        name: fieldNames.textField,
        type: "text",
        tabIndex: -1,
        autoComplete: "off",
        "aria-hidden": true,
        style: { position: "absolute", left: "-9999px" },
      },
      {
        name: fieldNames.emailField,
        type: "email",
        tabIndex: -1,
        autoComplete: "off",
        "aria-hidden": true,
        style: { position: "absolute", left: "-9999px" },
      },
      {
        name: fieldNames.phoneField,
        type: "tel",
        tabIndex: -1,
        autoComplete: "off",
        "aria-hidden": true,
        style: { position: "absolute", left: "-9999px" },
      },
      // Timing fields (truly hidden)
      {
        name: fieldNames.timestampField,
        type: "hidden",
        tabIndex: -1,
        autoComplete: "off",
        "aria-hidden": true,
        style: {},
        defaultValue: values.timestamp,
      },
      {
        name: fieldNames.validationField,
        type: "hidden",
        tabIndex: -1,
        autoComplete: "off",
        "aria-hidden": true,
        style: {},
        defaultValue: values.validation,
      },
    ],
    styles,
  };
}

// ============================================
// Advanced Bot Detection
// ============================================

/**
 * Additional bot detection heuristics
 */
export function detectBotBehavior(request: Request): {
  isSuspicious: boolean;
  signals: string[];
  score: number;
} {
  const signals: string[] = [];
  let score = 0;

  const userAgent = request.headers.get("user-agent") || "";
  const accept = request.headers.get("accept") || "";
  const acceptLanguage = request.headers.get("accept-language") || "";
  const acceptEncoding = request.headers.get("accept-encoding") || "";

  // Check for missing headers that browsers always send
  if (!userAgent) {
    signals.push("missing_user_agent");
    score += 30;
  }

  if (!accept) {
    signals.push("missing_accept_header");
    score += 20;
  }

  if (!acceptLanguage) {
    signals.push("missing_accept_language");
    score += 15;
  }

  if (!acceptEncoding) {
    signals.push("missing_accept_encoding");
    score += 10;
  }

  // Check for known bot user agents
  const botPatterns = [
    /bot/i,
    /crawl/i,
    /spider/i,
    /scrape/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /httpie/i,
    /postman/i,
    /insomnia/i,
    /axios/i,
    /node-fetch/i,
    /go-http-client/i,
    /java\//i,
    /libwww/i,
    /phantom/i,
    /selenium/i,
    /headless/i,
  ];

  for (const pattern of botPatterns) {
    if (pattern.test(userAgent)) {
      signals.push(`bot_user_agent: ${pattern.source}`);
      score += 50;
      break;
    }
  }

  // Check for suspicious accept headers
  if (accept === "*/*" && !userAgent.includes("Mozilla")) {
    signals.push("generic_accept_header");
    score += 15;
  }

  // Check for missing referer on form submission
  const referer = request.headers.get("referer");
  if (!referer && request.method === "POST") {
    signals.push("missing_referer");
    score += 10;
  }

  return {
    isSuspicious: score >= 50,
    signals,
    score: Math.min(100, score),
  };
}

/**
 * Comprehensive bot check combining honeypot and behavioral analysis
 */
export async function checkForBots(
  request: Request,
  formData: FormData,
  config?: HoneypotConfig
): Promise<{
  isBot: boolean;
  confidence: number;
  reasons: string[];
}> {
  const honeypotResult = validateHoneypot(formData, config);
  const behaviorResult = detectBotBehavior(request);

  const reasons: string[] = [];
  let confidence = 0;

  if (honeypotResult.isBot && honeypotResult.reason) {
    reasons.push(`Honeypot: ${honeypotResult.reason}`);
    confidence += 80;
  }

  if (behaviorResult.isSuspicious) {
    reasons.push(`Behavior: ${behaviorResult.signals.join(", ")}`);
    confidence += behaviorResult.score;
  }

  return {
    isBot: honeypotResult.isBot || behaviorResult.isSuspicious,
    confidence: Math.min(100, confidence),
    reasons,
  };
}

// ============================================
// Exports
// ============================================

export { HONEYPOT_FIELDS };
