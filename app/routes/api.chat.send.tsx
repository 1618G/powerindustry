/**
 * API: Send Chat Message
 * POST /api/chat/send
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { sendMessage, getConversation } from "~/services/chat.server";
import { getUser } from "~/utils/session.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { conversationId, content, visitorId, attachments } = body;

    if (!conversationId || !content) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if authenticated user
    const user = await getUser(request);

    // Determine sender type
    const senderType = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" 
      ? "ADMIN" 
      : "USER";

    const message = await sendMessage({
      conversationId,
      senderId: user?.id,
      senderType,
      senderName: user?.name || undefined,
      content,
      attachments,
    });

    return json({ message });
  } catch (error) {
    console.error("Failed to send message:", error);
    return json({ error: "Failed to send message" }, { status: 500 });
  }
}

