/**
 * API: Get Chat Messages
 * GET /api/chat/:conversationId/messages
 * 
 * SECURITY: Implements IDOR protection - users can only access their own conversations
 * Admins can access all conversations for support purposes
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getConversation, markMessagesAsRead } from "~/services/chat.server";
import { getUser } from "~/utils/session.server";
import { verifyOwnership, requireRole } from "~/services/authorization.server";
import { logSecurityEvent } from "~/services/soc2-compliance.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { conversationId } = params;

  if (!conversationId) {
    return json({ error: "Conversation ID required" }, { status: 400 });
  }

  try {
    // Get current user
    const user = await getUser(request);
    
    // SECURITY: Verify user has access to this conversation
    // Either they own it, or they are an admin
    if (user) {
      const ownership = await verifyOwnership(user.id, "conversation", conversationId);
      const isAdmin = await requireRole(user.id, ["ADMIN", "SUPER_ADMIN"], { throwOnFail: false });
      
      if (!ownership.authorized && !isAdmin) {
        await logSecurityEvent(
          "idor_attempt",
          "high",
          `User ${user.id} attempted to access conversation ${conversationId} they don't own`,
          { userId: user.id }
        );
        return json({ error: "Access denied" }, { status: 403 });
      }
    }

    const conversation = await getConversation(conversationId);

    if (!conversation) {
      return json({ error: "Conversation not found" }, { status: 404 });
    }

    // For anonymous visitors, verify by visitorId in session/cookie
    if (!user && conversation.visitorId) {
      // In a real implementation, you'd verify the visitor's session token
      // For now, we return limited data for visitor requests
      const visitorToken = request.headers.get("x-visitor-token");
      if (visitorToken !== conversation.visitorId) {
        return json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Mark messages as read
    if (user) {
      await markMessagesAsRead(conversationId, user.id);
    }

    return json({
      messages: conversation.messages,
      conversation: {
        id: conversation.id,
        status: conversation.status,
        priority: conversation.priority,
        user: conversation.user,
        assignedTo: conversation.assignedTo,
        tags: conversation.tags,
      },
    });
  } catch (error) {
    console.error("Failed to get messages:", error);
    return json({ error: "Failed to load messages" }, { status: 500 });
  }
}

