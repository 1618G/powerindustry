/**
 * Configuration Service - Environment validation and typed config access
 *
 * PURPOSE: Validate all environment variables at startup, fail fast on misconfig
 *
 * USAGE:
 * import { config } from "~/lib/config.server";
 * const apiKey = config.stripe.secretKey;
 *
 * LAYER: Infrastructure
 */

import { z } from "zod";

// ============================================
// Schema Definitions
// ============================================

const envSchema = z.object({
  // Core
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:8163"),
  APP_NAME: z.string().default("ZZA Platform"),
  APP_VERSION: z.string().default("1.0.0"),
  
  // Worker mode flag
  WORKER_MODE: z.coerce.boolean().default(false),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  
  // Redis
  REDIS_URL: z.string().url().optional(),

  // Security
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // Stripe (optional in dev)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Email (optional in dev)
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // AI (optional)
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Storage (optional)
  GCS_BUCKET_NAME: z.string().optional(),
  GCS_PROJECT_ID: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_REGION: z.string().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Feature Flags
  ENABLE_REGISTRATION: z.coerce.boolean().default(true),
  ENABLE_OAUTH: z.coerce.boolean().default(true),
  ENABLE_MFA: z.coerce.boolean().default(true),
  ENABLE_AI: z.coerce.boolean().default(false),
  
  // Observability
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  METRICS_TOKEN: z.string().min(16).optional(),
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  
  // Request limits
  MAX_REQUEST_BODY_SIZE: z.coerce.number().default(1048576), // 1MB
  MAX_UPLOAD_SIZE: z.coerce.number().default(52428800), // 50MB
  REQUEST_TIMEOUT_MS: z.coerce.number().default(30000), // 30s
});

type EnvConfig = z.infer<typeof envSchema>;

// ============================================
// Validation
// ============================================

let _config: EnvConfig | null = null;
let _validationError: string | null = null;

function validateEnv(): EnvConfig {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");

    _validationError = `Environment validation failed:\n${errors}`;

    // In production, fail immediately
    if (process.env.NODE_ENV === "production") {
      console.error("❌ " + _validationError);
      process.exit(1);
    }

    // In development, log warning but continue with defaults
    console.warn("⚠️ " + _validationError);
    console.warn("Continuing with defaults (dev mode only)...\n");
  }

  // If validation succeeded, use the data
  if (result.success) {
    _config = result.data;
  } else {
    // In development, create a fallback config with manual defaults
    // This handles the case where result.data is undefined on validation failure
    _config = {
      NODE_ENV: (process.env.NODE_ENV as "development" | "production" | "test") || "development",
      APP_URL: process.env.APP_URL || "http://localhost:8163",
      APP_NAME: process.env.APP_NAME || "ZZA Platform",
      APP_VERSION: process.env.APP_VERSION || "1.0.0",
      WORKER_MODE: process.env.WORKER_MODE === "true",
      DATABASE_URL: process.env.DATABASE_URL || "",
      REDIS_URL: process.env.REDIS_URL,
      SESSION_SECRET: process.env.SESSION_SECRET || "dev-secret-minimum-32-characters-long",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
      SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME,
      GCS_PROJECT_ID: process.env.GCS_PROJECT_ID,
      AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
      AWS_REGION: process.env.AWS_REGION,
      RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000"),
      RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
      ENABLE_REGISTRATION: process.env.ENABLE_REGISTRATION !== "false",
      ENABLE_OAUTH: process.env.ENABLE_OAUTH !== "false",
      ENABLE_MFA: process.env.ENABLE_MFA !== "false",
      ENABLE_AI: process.env.ENABLE_AI === "true",
      OTEL_ENABLED: process.env.OTEL_ENABLED === "true",
      OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
      METRICS_TOKEN: process.env.METRICS_TOKEN,
      SENTRY_DSN: process.env.SENTRY_DSN,
      LOG_LEVEL: (process.env.LOG_LEVEL as "trace" | "debug" | "info" | "warn" | "error" | "fatal") || "info",
      MAX_REQUEST_BODY_SIZE: parseInt(process.env.MAX_REQUEST_BODY_SIZE || "1048576"),
      MAX_UPLOAD_SIZE: parseInt(process.env.MAX_UPLOAD_SIZE || "52428800"),
      REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || "30000"),
    };
  }
  
  return _config;
}

// ============================================
// Typed Config Access
// ============================================

export const config = {
  get env() {
    return validateEnv();
  },

  get isProduction() {
    return this.env.NODE_ENV === "production";
  },

  get isDevelopment() {
    return this.env.NODE_ENV === "development";
  },

  get isTest() {
    return this.env.NODE_ENV === "test";
  },
  
  get isWorker() {
    return this.env.WORKER_MODE;
  },

  app: {
    get url() {
      return validateEnv().APP_URL;
    },
    get name() {
      return validateEnv().APP_NAME;
    },
    get version() {
      return validateEnv().APP_VERSION;
    },
  },
  
  redis: {
    get url() {
      return validateEnv().REDIS_URL;
    },
    get isConfigured() {
      return !!validateEnv().REDIS_URL;
    },
  },

  database: {
    get url() {
      return validateEnv().DATABASE_URL;
    },
  },

  security: {
    get sessionSecret() {
      return validateEnv().SESSION_SECRET;
    },
    get encryptionKey() {
      return validateEnv().ENCRYPTION_KEY;
    },
  },

  stripe: {
    get secretKey() {
      return validateEnv().STRIPE_SECRET_KEY;
    },
    get webhookSecret() {
      return validateEnv().STRIPE_WEBHOOK_SECRET;
    },
    get publishableKey() {
      return validateEnv().STRIPE_PUBLISHABLE_KEY;
    },
    get isConfigured() {
      return !!validateEnv().STRIPE_SECRET_KEY;
    },
  },

  email: {
    get sendgridKey() {
      return validateEnv().SENDGRID_API_KEY;
    },
    get from() {
      return validateEnv().EMAIL_FROM || "noreply@spinney.com";
    },
    get smtp() {
      const env = validateEnv();
      if (!env.SMTP_HOST) return null;
      return {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      };
    },
    get isConfigured() {
      const env = validateEnv();
      return !!(env.SENDGRID_API_KEY || env.SMTP_HOST);
    },
  },

  oauth: {
    google: {
      get clientId() {
        return validateEnv().GOOGLE_CLIENT_ID;
      },
      get clientSecret() {
        return validateEnv().GOOGLE_CLIENT_SECRET;
      },
      get isConfigured() {
        const env = validateEnv();
        return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
      },
    },
    github: {
      get clientId() {
        return validateEnv().GITHUB_CLIENT_ID;
      },
      get clientSecret() {
        return validateEnv().GITHUB_CLIENT_SECRET;
      },
      get isConfigured() {
        const env = validateEnv();
        return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
      },
    },
  },

  ai: {
    get openaiKey() {
      return validateEnv().OPENAI_API_KEY;
    },
    get geminiKey() {
      return validateEnv().GOOGLE_AI_API_KEY;
    },
    get anthropicKey() {
      return validateEnv().ANTHROPIC_API_KEY;
    },
    get isConfigured() {
      const env = validateEnv();
      return !!(
        env.OPENAI_API_KEY ||
        env.GOOGLE_AI_API_KEY ||
        env.ANTHROPIC_API_KEY
      );
    },
  },

  storage: {
    gcs: {
      get bucket() {
        return validateEnv().GCS_BUCKET_NAME;
      },
      get projectId() {
        return validateEnv().GCS_PROJECT_ID;
      },
      get isConfigured() {
        const env = validateEnv();
        return !!(env.GCS_BUCKET_NAME && env.GCS_PROJECT_ID);
      },
    },
    s3: {
      get bucket() {
        return validateEnv().AWS_S3_BUCKET;
      },
      get region() {
        return validateEnv().AWS_REGION;
      },
      get isConfigured() {
        const env = validateEnv();
        return !!(env.AWS_S3_BUCKET && env.AWS_REGION);
      },
    },
  },

  rateLimit: {
    get windowMs() {
      return validateEnv().RATE_LIMIT_WINDOW_MS;
    },
    get maxRequests() {
      return validateEnv().RATE_LIMIT_MAX_REQUESTS;
    },
  },

  features: {
    get registration() {
      return validateEnv().ENABLE_REGISTRATION;
    },
    get oauth() {
      return validateEnv().ENABLE_OAUTH;
    },
    get mfa() {
      return validateEnv().ENABLE_MFA;
    },
    get ai() {
      return validateEnv().ENABLE_AI;
    },
  },
  
  observability: {
    get otelEnabled() {
      return validateEnv().OTEL_ENABLED;
    },
    get otelEndpoint() {
      return validateEnv().OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
    },
    get otelServiceName() {
      return validateEnv().OTEL_SERVICE_NAME || validateEnv().APP_NAME;
    },
    get metricsToken() {
      return validateEnv().METRICS_TOKEN;
    },
    get sentryDsn() {
      return validateEnv().SENTRY_DSN;
    },
    get logLevel() {
      return validateEnv().LOG_LEVEL;
    },
  },
  
  limits: {
    get maxRequestBodySize() {
      return validateEnv().MAX_REQUEST_BODY_SIZE;
    },
    get maxUploadSize() {
      return validateEnv().MAX_UPLOAD_SIZE;
    },
    get requestTimeoutMs() {
      return validateEnv().REQUEST_TIMEOUT_MS;
    },
  },
};

// ============================================
// Health Check Helper
// ============================================

export function getConfigStatus(): {
  valid: boolean;
  error: string | null;
  services: Record<string, { configured: boolean; required: boolean }>;
} {
  validateEnv();

  return {
    valid: _validationError === null,
    error: _validationError,
    services: {
      database: { configured: !!config.database.url, required: true },
      stripe: { configured: config.stripe.isConfigured, required: false },
      email: { configured: config.email.isConfigured, required: false },
      googleOAuth: {
        configured: config.oauth.google.isConfigured,
        required: false,
      },
      githubOAuth: {
        configured: config.oauth.github.isConfigured,
        required: false,
      },
      ai: { configured: config.ai.isConfigured, required: false },
      gcs: { configured: config.storage.gcs.isConfigured, required: false },
      s3: { configured: config.storage.s3.isConfigured, required: false },
    },
  };
}

// Validate on import (fail fast)
validateEnv();
