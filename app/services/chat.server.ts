/**
 * ZZA Platform - Live Chat Service
 * Intercom-like chat system for customer support
 *
 * Features:
 * - Real-time messaging
 * - Visitor tracking
 * - Agent assignment
 * - Quick replies
 * - File attachments
 * - Chat tags and priority
 * - Business hours
 * - Auto-replies
 */

import { db } from "~/lib/prisma";
import type { ChatStatus, ChatPriority, SenderType, MessageContentType } from "@prisma/client";

// ============================================
// Types
// ============================================

export interface CreateConversationInput {
  userId?: string;
  visitorId?: string;
  visitorEmail?: string;
  visitorName?: string;
  subject?: string;
  source?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface SendMessageInput {
  conversationId: string;
  senderId?: string;
  senderType: SenderType;
  senderName?: string;
  content: string;
  contentType?: MessageContentType;
  attachments?: Array<{ name: string; url: string; type: string; size: number }>;
}

export interface ConversationFilters {
  status?: ChatStatus;
  assignedToId?: string;
  unassigned?: boolean;
  priority?: ChatPriority;
  search?: string;
}

// ============================================
// Conversations
// ============================================

/**
 * Create a new chat conversation
 */
export async function createConversation(input: CreateConversationInput) {
  const conversation = await db.chatConversation.create({
    data: {
      userId: input.userId,
      visitorId: input.visitorId || generateVisitorId(),
      visitorEmail: input.visitorEmail,
      visitorName: input.visitorName,
      subject: input.subject,
      source: input.source,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    },
    include: {
      messages: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return conversation;
}

/**
 * Get conversation by ID
 */
export async function getConversation(id: string) {
  return db.chatConversation.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          sender: { select: { id: true, name: true, email: true } },
        },
      },
      user: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      tags: true,
    },
  });
}

/**
 * Get or create conversation for a visitor/user
 */
export async function getOrCreateConversation(input: CreateConversationInput) {
  // Try to find existing open conversation
  const existing = await db.chatConversation.findFirst({
    where: {
      OR: [
        { userId: input.userId, status: { in: ["OPEN", "PENDING"] } },
        { visitorId: input.visitorId, status: { in: ["OPEN", "PENDING"] } },
      ],
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 50, // Last 50 messages
      },
    },
  });

  if (existing) {
    return existing;
  }

  return createConversation(input);
}

/**
 * List conversations with filters
 */
export async function listConversations(filters: ConversationFilters = {}, page = 1, limit = 20) {
  const where: any = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.assignedToId) {
    where.assignedToId = filters.assignedToId;
  }

  if (filters.unassigned) {
    where.assignedToId = null;
  }

  if (filters.priority) {
    where.priority = filters.priority;
  }

  if (filters.search) {
    where.OR = [
      { visitorEmail: { contains: filters.search, mode: "insensitive" } },
      { visitorName: { contains: filters.search, mode: "insensitive" } },
      { subject: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const [conversations, total] = await Promise.all([
    db.chatConversation.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        tags: true,
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.chatConversation.count({ where }),
  ]);

  return {
    conversations,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Update conversation status
 */
export async function updateConversationStatus(id: string, status: ChatStatus) {
  return db.chatConversation.update({
    where: { id },
    data: {
      status,
      closedAt: status === "CLOSED" || status === "RESOLVED" ? new Date() : null,
    },
  });
}

/**
 * Assign conversation to an agent
 */
export async function assignConversation(id: string, assignedToId: string | null) {
  return db.chatConversation.update({
    where: { id },
    data: { assignedToId },
  });
}

/**
 * Update conversation priority
 */
export async function updateConversationPriority(id: string, priority: ChatPriority) {
  return db.chatConversation.update({
    where: { id },
    data: { priority },
  });
}

// ============================================
// Messages
// ============================================

/**
 * Send a message in a conversation
 */
export async function sendMessage(input: SendMessageInput) {
  const message = await db.chatMessage.create({
    data: {
      conversationId: input.conversationId,
      senderId: input.senderId,
      senderType: input.senderType,
      senderName: input.senderName,
      content: input.content,
      contentType: input.contentType || "TEXT",
      attachments: input.attachments,
    },
    include: {
      sender: { select: { id: true, name: true, email: true } },
    },
  });

  // Update conversation's lastMessageAt
  await db.chatConversation.update({
    where: { id: input.conversationId },
    data: {
      lastMessageAt: new Date(),
      status: input.senderType === "USER" ? "OPEN" : undefined, // Reopen if user sends message
    },
  });

  return message;
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(conversationId: string, userId?: string) {
  const where: any = {
    conversationId,
    isRead: false,
  };

  // If user is admin, mark user messages as read
  // If user is customer, mark admin messages as read
  if (userId) {
    where.NOT = { senderId: userId };
  }

  await db.chatMessage.updateMany({
    where,
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

/**
 * Get unread message count for a conversation
 */
export async function getUnreadCount(conversationId: string, forSenderType: SenderType) {
  return db.chatMessage.count({
    where: {
      conversationId,
      isRead: false,
      senderType: { not: forSenderType },
    },
  });
}

// ============================================
// Quick Replies
// ============================================

/**
 * Get all active quick replies
 */
export async function getQuickReplies(category?: string) {
  return db.chatQuickReply.findMany({
    where: {
      isActive: true,
      ...(category && { category }),
    },
    orderBy: { usageCount: "desc" },
  });
}

/**
 * Create a quick reply
 */
export async function createQuickReply(data: {
  title: string;
  content: string;
  shortcut?: string;
  category?: string;
}) {
  return db.chatQuickReply.create({ data });
}

/**
 * Use a quick reply (increments usage count)
 */
export async function useQuickReply(id: string) {
  return db.chatQuickReply.update({
    where: { id },
    data: { usageCount: { increment: 1 } },
  });
}

// ============================================
// Chat Settings
// ============================================

/**
 * Get chat settings (singleton)
 */
export async function getChatSettings() {
  let settings = await db.chatSettings.findFirst();

  if (!settings) {
    settings = await db.chatSettings.create({
      data: {},
    });
  }

  return settings;
}

/**
 * Update chat settings
 */
export async function updateChatSettings(data: {
  primaryColor?: string;
  position?: string;
  greeting?: string;
  awayMessage?: string;
  isOnline?: boolean;
  offlineMessage?: string;
  businessHours?: any;
  timezone?: string;
  requireEmail?: boolean;
  showAgentPhoto?: boolean;
  playSound?: boolean;
  autoReplyEnabled?: boolean;
  autoReplyDelay?: number;
  autoReplyMessage?: string;
}) {
  const settings = await getChatSettings();

  return db.chatSettings.update({
    where: { id: settings.id },
    data,
  });
}

/**
 * Check if chat is currently available (based on business hours)
 */
export async function isChatAvailable(): Promise<boolean> {
  const settings = await getChatSettings();

  if (!settings.isOnline) {
    return false;
  }

  if (!settings.businessHours) {
    return true; // Always available if no business hours set
  }

  const now = new Date();
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDay = days[now.getDay()];
  const hours = settings.businessHours as Record<string, { start: string; end: string }>;

  if (!hours[currentDay]) {
    return false;
  }

  const { start, end } = hours[currentDay];
  const currentTime = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: settings.timezone,
  });

  return currentTime >= start && currentTime <= end;
}

// ============================================
// Tags
// ============================================

/**
 * Get all chat tags
 */
export async function getChatTags() {
  return db.chatTag.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * Create a chat tag
 */
export async function createChatTag(name: string, color?: string) {
  return db.chatTag.create({
    data: { name, color },
  });
}

/**
 * Add tag to conversation
 */
export async function addTagToConversation(conversationId: string, tagId: string) {
  return db.chatConversation.update({
    where: { id: conversationId },
    data: {
      tags: { connect: { id: tagId } },
    },
  });
}

/**
 * Remove tag from conversation
 */
export async function removeTagFromConversation(conversationId: string, tagId: string) {
  return db.chatConversation.update({
    where: { id: conversationId },
    data: {
      tags: { disconnect: { id: tagId } },
    },
  });
}

// ============================================
// Analytics
// ============================================

/**
 * Get chat statistics
 */
export async function getChatStats(dateRange?: { start: Date; end: Date }) {
  const where = dateRange
    ? { createdAt: { gte: dateRange.start, lte: dateRange.end } }
    : {};

  const [
    totalConversations,
    openConversations,
    resolvedConversations,
    totalMessages,
    avgResponseTime,
  ] = await Promise.all([
    db.chatConversation.count({ where }),
    db.chatConversation.count({ where: { ...where, status: "OPEN" } }),
    db.chatConversation.count({ where: { ...where, status: "RESOLVED" } }),
    db.chatMessage.count({ where }),
    // Calculate average response time would require more complex query
    Promise.resolve(null),
  ]);

  return {
    totalConversations,
    openConversations,
    resolvedConversations,
    totalMessages,
    avgResponseTime,
    resolutionRate:
      totalConversations > 0
        ? Math.round((resolvedConversations / totalConversations) * 100)
        : 0,
  };
}

// ============================================
// Utilities
// ============================================

/**
 * Generate a unique visitor ID
 */
function generateVisitorId(): string {
  return `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send system message (e.g., "Agent joined the chat")
 */
export async function sendSystemMessage(conversationId: string, content: string) {
  return sendMessage({
    conversationId,
    senderType: "SYSTEM",
    content,
    contentType: "SYSTEM",
  });
}

/**
 * Auto-assign conversation to least busy agent
 */
export async function autoAssignConversation(conversationId: string) {
  // Find agents with least open conversations
  const agents = await db.user.findMany({
    where: {
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
      isActive: true,
    },
    include: {
      _count: {
        select: {
          assignedConversations: {
            where: { status: "OPEN" },
          },
        },
      },
    },
    orderBy: {
      assignedConversations: { _count: "asc" },
    },
    take: 1,
  });

  if (agents.length > 0) {
    await assignConversation(conversationId, agents[0].id);
    await sendSystemMessage(
      conversationId,
      `${agents[0].name || "An agent"} has been assigned to this conversation.`
    );
  }
}

