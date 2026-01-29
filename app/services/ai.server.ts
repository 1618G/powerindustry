/**
 * AI Service - OpenAI, Google Gemini, and Anthropic integration
 * Provides unified API for AI operations with usage tracking
 */

import { db } from "~/lib/prisma";

// ============================================
// Types
// ============================================

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  userId?: string;
  organizationId?: string;
}

export interface AICompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface AIEmbeddingResult {
  embedding: number[];
  inputTokens: number;
  model: string;
  provider: string;
}

type AIProvider = "openai" | "gemini" | "anthropic";

// ============================================
// Provider Configuration
// ============================================

const PROVIDER_MODELS = {
  openai: {
    chat: process.env.OPENAI_CHAT_MODEL || "gpt-4-turbo-preview",
    embedding: "text-embedding-3-small",
  },
  gemini: {
    chat: process.env.GEMINI_CHAT_MODEL || "gemini-pro",
    embedding: "embedding-001",
  },
  anthropic: {
    chat: process.env.ANTHROPIC_CHAT_MODEL || "claude-3-sonnet-20240229",
    embedding: null, // Anthropic doesn't have embeddings
  },
};

const DEFAULT_PROVIDER = (process.env.AI_DEFAULT_PROVIDER || "openai") as AIProvider;

// Cost per 1K tokens (approximate, in cents)
const COST_PER_1K_TOKENS = {
  "gpt-4-turbo-preview": { input: 1, output: 3 },
  "gpt-4": { input: 3, output: 6 },
  "gpt-3.5-turbo": { input: 0.05, output: 0.15 },
  "gemini-pro": { input: 0.025, output: 0.075 },
  "claude-3-sonnet-20240229": { input: 0.3, output: 1.5 },
  "claude-3-haiku-20240307": { input: 0.025, output: 0.125 },
  "text-embedding-3-small": { input: 0.002, output: 0 },
};

// ============================================
// OpenAI Implementation
// ============================================

async function openAIChat(
  messages: AIMessage[],
  options: AICompletionOptions
): Promise<AICompletionResult> {
  const startTime = Date.now();
  const model = options.model || PROVIDER_MODELS.openai.chat;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: options.systemPrompt
        ? [{ role: "system", content: options.systemPrompt }, ...messages]
        : messages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const latencyMs = Date.now() - startTime;

  return {
    content: data.choices[0].message.content,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    totalTokens: data.usage.total_tokens,
    model,
    provider: "openai",
    latencyMs,
  };
}

async function openAIEmbedding(text: string): Promise<AIEmbeddingResult> {
  const model = PROVIDER_MODELS.openai.embedding;

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();

  return {
    embedding: data.data[0].embedding,
    inputTokens: data.usage.total_tokens,
    model,
    provider: "openai",
  };
}

// ============================================
// Google Gemini Implementation
// ============================================

async function geminiChat(
  messages: AIMessage[],
  options: AICompletionOptions
): Promise<AICompletionResult> {
  const startTime = Date.now();
  const model = options.model || PROVIDER_MODELS.gemini.chat;

  // Convert messages to Gemini format
  const geminiMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Add system prompt as first user message if provided
  if (options.systemPrompt) {
    geminiMessages.unshift({
      role: "user",
      parts: [{ text: `System Instructions: ${options.systemPrompt}` }],
    });
    geminiMessages.splice(1, 0, {
      role: "model",
      parts: [{ text: "Understood. I will follow these instructions." }],
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: geminiMessages,
        generationConfig: {
          maxOutputTokens: options.maxTokens || 2048,
          temperature: options.temperature ?? 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const latencyMs = Date.now() - startTime;

  // Estimate tokens (Gemini doesn't always return exact counts)
  const inputTokens = Math.ceil(messages.map((m) => m.content).join("").length / 4);
  const outputContent = data.candidates[0].content.parts[0].text;
  const outputTokens = Math.ceil(outputContent.length / 4);

  return {
    content: outputContent,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    model,
    provider: "gemini",
    latencyMs,
  };
}

// ============================================
// Anthropic Implementation
// ============================================

async function anthropicChat(
  messages: AIMessage[],
  options: AICompletionOptions
): Promise<AICompletionResult> {
  const startTime = Date.now();
  const model = options.model || PROVIDER_MODELS.anthropic.chat;

  // Convert messages to Anthropic format (separate system prompt)
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const systemMessage = messages.find((m) => m.role === "system")?.content || options.systemPrompt;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens || 2048,
      system: systemMessage,
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const latencyMs = Date.now() - startTime;

  return {
    content: data.content[0].text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    model,
    provider: "anthropic",
    latencyMs,
  };
}

// ============================================
// Unified API
// ============================================

export async function chat(
  messages: AIMessage[],
  options: AICompletionOptions = {}
): Promise<AICompletionResult> {
  const provider = getProviderFromModel(options.model) || DEFAULT_PROVIDER;
  let result: AICompletionResult;

  try {
    switch (provider) {
      case "gemini":
        result = await geminiChat(messages, options);
        break;
      case "anthropic":
        result = await anthropicChat(messages, options);
        break;
      case "openai":
      default:
        result = await openAIChat(messages, options);
    }

    // Track usage
    await trackAIUsage({
      userId: options.userId,
      organizationId: options.organizationId,
      provider,
      model: result.model,
      operation: "chat",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      latencyMs: result.latencyMs,
      success: true,
    });

    return result;
  } catch (error) {
    // Track failed usage
    await trackAIUsage({
      userId: options.userId,
      organizationId: options.organizationId,
      provider,
      model: options.model || PROVIDER_MODELS[provider].chat,
      operation: "chat",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function embed(
  text: string,
  options: { userId?: string; organizationId?: string } = {}
): Promise<AIEmbeddingResult> {
  try {
    const result = await openAIEmbedding(text);

    await trackAIUsage({
      userId: options.userId,
      organizationId: options.organizationId,
      provider: "openai",
      model: result.model,
      operation: "embedding",
      inputTokens: result.inputTokens,
      outputTokens: 0,
      totalTokens: result.inputTokens,
      latencyMs: 0,
      success: true,
    });

    return result;
  } catch (error) {
    await trackAIUsage({
      userId: options.userId,
      organizationId: options.organizationId,
      provider: "openai",
      model: PROVIDER_MODELS.openai.embedding,
      operation: "embedding",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// ============================================
// Usage Tracking
// ============================================

async function trackAIUsage(data: {
  userId?: string;
  organizationId?: string;
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}): Promise<void> {
  const cost = calculateCost(data.model, data.inputTokens, data.outputTokens);

  await db.aIUsage.create({
    data: {
      userId: data.userId,
      organizationId: data.organizationId,
      provider: data.provider,
      model: data.model,
      operation: data.operation,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.totalTokens,
      cost,
      latencyMs: data.latencyMs,
      success: data.success,
      error: data.error,
    },
  });
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = COST_PER_1K_TOKENS[model as keyof typeof COST_PER_1K_TOKENS];
  if (!costs) return 0;

  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

function getProviderFromModel(model?: string): AIProvider | null {
  if (!model) return null;
  if (model.startsWith("gpt")) return "openai";
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("claude")) return "anthropic";
  return null;
}

// ============================================
// Usage Statistics
// ============================================

export async function getAIUsageStats(
  userId?: string,
  organizationId?: string,
  days: number = 30
): Promise<{
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  byProvider: Record<string, { tokens: number; cost: number; count: number }>;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const usage = await db.aIUsage.findMany({
    where: {
      OR: [
        { userId },
        { organizationId },
      ],
      createdAt: { gte: since },
    },
  });

  const byProvider: Record<string, { tokens: number; cost: number; count: number }> = {};

  let totalTokens = 0;
  let totalCost = 0;

  for (const record of usage) {
    totalTokens += record.totalTokens;
    totalCost += record.cost;

    if (!byProvider[record.provider]) {
      byProvider[record.provider] = { tokens: 0, cost: 0, count: 0 };
    }
    byProvider[record.provider].tokens += record.totalTokens;
    byProvider[record.provider].cost += record.cost;
    byProvider[record.provider].count += 1;
  }

  return {
    totalTokens,
    totalCost,
    requestCount: usage.length,
    byProvider,
  };
}

// ============================================
// Helper Functions
// ============================================

export function simpleChat(
  prompt: string,
  options: AICompletionOptions = {}
): Promise<AICompletionResult> {
  return chat([{ role: "user", content: prompt }], options);
}

export async function summarize(
  text: string,
  options: AICompletionOptions = {}
): Promise<string> {
  const result = await chat(
    [{ role: "user", content: `Please summarize the following text:\n\n${text}` }],
    { ...options, systemPrompt: "You are a helpful assistant that provides concise summaries." }
  );
  return result.content;
}

export async function extractKeywords(
  text: string,
  options: AICompletionOptions = {}
): Promise<string[]> {
  const result = await chat(
    [{ role: "user", content: `Extract 5-10 keywords from this text. Return only the keywords as a comma-separated list:\n\n${text}` }],
    { ...options, systemPrompt: "Extract keywords. Respond only with comma-separated keywords." }
  );
  return result.content.split(",").map((k) => k.trim());
}

