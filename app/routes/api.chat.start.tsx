/**
 * API: Start Chat Conversation
 * POST /api/chat/start
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getOrCreateConversation, getChatSettings, sendSystemMessage } from "~/services/chat.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();

    const { userId, visitorId, visitorEmail, visitorName, source, userAgent } = body;

    // Get IP from request headers
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const conversation = await getOrCreateConversation({
      userId,
      visitorId,
      visitorEmail,
      visitorName,
      source,
      userAgent,
      ipAddress,
    });

    // Get chat settings for greeting
    const settings = await getChatSettings();

    // Send greeting as system message if new conversation
    if (conversation.messages.length === 0) {
      await sendSystemMessage(conversation.id, settings.greeting);
    }

    return json({
      conversationId: conversation.id,
      messages: conversation.messages,
    });
  } catch (error) {
    console.error("Failed to start chat:", error);
    return json({ error: "Failed to start conversation" }, { status: 500 });
  }
}

