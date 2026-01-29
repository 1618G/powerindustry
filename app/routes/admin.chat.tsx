/**
 * Admin Chat Dashboard
 * View and manage customer chat conversations
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, Link, useSearchParams } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComments,
  faSearch,
  faCircle,
  faPaperPlane,
  faUser,
  faClock,
  faTag,
  faCheck,
  faCheckDouble,
  faArrowLeft,
  faEllipsisV,
} from "@fortawesome/free-solid-svg-icons";

import { requireAdmin } from "~/utils/session.server";
import {
  listConversations,
  getConversation,
  sendMessage,
  updateConversationStatus,
  assignConversation,
  markMessagesAsRead,
  getChatStats,
  getQuickReplies,
} from "~/services/chat.server";

export const meta: MetaFunction = () => [
  { title: "Chat Support - Admin Dashboard" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversation");
  const status = url.searchParams.get("status") as any;
  const page = parseInt(url.searchParams.get("page") || "1");

  // Get conversations list
  const conversationsData = await listConversations(
    { status: status || undefined },
    page,
    20
  );

  // Get selected conversation if any
  let selectedConversation = null;
  if (conversationId) {
    selectedConversation = await getConversation(conversationId);
    if (selectedConversation) {
      await markMessagesAsRead(conversationId, user.id);
    }
  }

  // Get stats and quick replies
  const [stats, quickReplies] = await Promise.all([
    getChatStats(),
    getQuickReplies(),
  ]);

  return json({
    user,
    conversations: conversationsData.conversations,
    totalConversations: conversationsData.total,
    totalPages: conversationsData.totalPages,
    currentPage: page,
    selectedConversation,
    stats,
    quickReplies,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "send-message": {
      const conversationId = formData.get("conversationId") as string;
      const content = formData.get("content") as string;

      if (!conversationId || !content) {
        return json({ error: "Missing fields" }, { status: 400 });
      }

      await sendMessage({
        conversationId,
        senderId: user.id,
        senderType: "ADMIN",
        senderName: user.name || user.email,
        content,
      });

      return json({ success: true });
    }

    case "update-status": {
      const conversationId = formData.get("conversationId") as string;
      const status = formData.get("status") as any;

      await updateConversationStatus(conversationId, status);
      return json({ success: true });
    }

    case "assign": {
      const conversationId = formData.get("conversationId") as string;
      const assigneeId = formData.get("assigneeId") as string | null;

      await assignConversation(conversationId, assigneeId);
      return json({ success: true });
    }

    default:
      return json({ error: "Invalid intent" }, { status: 400 });
  }
}

export default function AdminChat() {
  const {
    user,
    conversations,
    selectedConversation,
    stats,
    quickReplies,
    totalPages,
    currentPage,
  } = useLoaderData<typeof loader>();

  const [searchParams, setSearchParams] = useSearchParams();
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();

  const selectedConversationId = searchParams.get("conversation");

  // Scroll to bottom when conversation changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.messages]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConversationId) return;

    fetcher.submit(
      {
        intent: "send-message",
        conversationId: selectedConversationId,
        content: messageInput,
      },
      { method: "post" }
    );

    setMessageInput("");
  };

  const handleStatusChange = (status: string) => {
    if (!selectedConversationId) return;

    fetcher.submit(
      {
        intent: "update-status",
        conversationId: selectedConversationId,
        status,
      },
      { method: "post" }
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return date.toLocaleDateString("en-US", { weekday: "short" });
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN":
        return "text-green-500";
      case "PENDING":
        return "text-yellow-500";
      case "RESOLVED":
        return "text-blue-500";
      case "CLOSED":
        return "text-gray-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - Conversation List */}
      <div className="flex w-80 flex-col border-r border-gray-200 bg-white">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">
              <FontAwesomeIcon icon={faComments} className="mr-2 text-indigo-600" />
              Conversations
            </h1>
            <Link to="/admin" className="text-gray-400 hover:text-gray-600">
              <FontAwesomeIcon icon={faArrowLeft} />
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-green-50 p-2">
              <p className="text-lg font-bold text-green-600">{stats.openConversations}</p>
              <p className="text-xs text-green-600">Open</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-2">
              <p className="text-lg font-bold text-blue-600">{stats.resolvedConversations}</p>
              <p className="text-xs text-blue-600">Resolved</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-2">
              <p className="text-lg font-bold text-gray-600">{stats.totalConversations}</p>
              <p className="text-xs text-gray-600">Total</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Filter Tabs */}
          <div className="mt-4 flex gap-2">
            {["all", "OPEN", "PENDING", "RESOLVED"].map((status) => (
              <button
                key={status}
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  if (status === "all") {
                    params.delete("status");
                  } else {
                    params.set("status", status);
                  }
                  setSearchParams(params);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  (status === "all" && !searchParams.get("status")) ||
                  searchParams.get("status") === status
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {status === "all" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-gray-500">
              <p>No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv: any) => (
              <button
                key={conv.id}
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set("conversation", conv.id);
                  setSearchParams(params);
                }}
                className={`w-full border-b border-gray-100 p-4 text-left transition hover:bg-gray-50 ${
                  selectedConversationId === conv.id ? "bg-indigo-50" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200">
                    <FontAwesomeIcon icon={faUser} className="text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate font-medium text-gray-900">
                        {conv.user?.name || conv.visitorName || conv.visitorEmail || "Visitor"}
                      </p>
                      <span className="flex-shrink-0 text-xs text-gray-500">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <p className="truncate text-sm text-gray-500">
                      {conv.messages[0]?.content || "No messages"}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <FontAwesomeIcon
                        icon={faCircle}
                        className={`h-2 w-2 ${getStatusColor(conv.status)}`}
                      />
                      <span className="text-xs text-gray-400">{conv._count.messages} messages</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                  <FontAwesomeIcon icon={faUser} className="text-gray-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {selectedConversation.user?.name ||
                      selectedConversation.visitorName ||
                      selectedConversation.visitorEmail ||
                      "Visitor"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedConversation.visitorEmail || selectedConversation.source}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Status Dropdown */}
                <select
                  value={selectedConversation.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="OPEN">Open</option>
                  <option value="PENDING">Pending</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>

                <button className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                  <FontAwesomeIcon icon={faEllipsisV} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
              {selectedConversation.messages.map((message: any) => (
                <div
                  key={message.id}
                  className={`mb-4 flex ${
                    message.senderType === "ADMIN" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[60%] rounded-2xl px-4 py-3 ${
                      message.senderType === "ADMIN"
                        ? "rounded-br-md bg-indigo-600 text-white"
                        : message.senderType === "SYSTEM"
                        ? "bg-gray-200 text-center text-xs text-gray-600"
                        : "rounded-bl-md bg-white text-gray-900 shadow-sm"
                    }`}
                  >
                    {message.senderType === "ADMIN" && (
                      <p className="mb-1 text-xs text-indigo-200">
                        {message.senderName || "You"}
                      </p>
                    )}
                    <p className="text-sm">{message.content}</p>
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <span
                        className={`text-xs ${
                          message.senderType === "ADMIN" ? "text-indigo-200" : "text-gray-400"
                        }`}
                      >
                        {formatTime(message.createdAt)}
                      </span>
                      {message.senderType === "ADMIN" && (
                        <FontAwesomeIcon
                          icon={message.isRead ? faCheckDouble : faCheck}
                          className={`h-3 w-3 ${
                            message.isRead ? "text-indigo-200" : "text-indigo-300"
                          }`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies */}
            {quickReplies.length > 0 && (
              <div className="border-t border-gray-200 bg-white px-4 py-2">
                <div className="flex gap-2 overflow-x-auto">
                  {quickReplies.slice(0, 5).map((reply: any) => (
                    <button
                      key={reply.id}
                      onClick={() => setMessageInput(reply.content)}
                      className="flex-shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                    >
                      {reply.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="border-t border-gray-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Type your message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faPaperPlane} className="mr-2" />
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          /* No Conversation Selected */
          <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 text-gray-500">
            <FontAwesomeIcon icon={faComments} className="mb-4 h-16 w-16 text-gray-300" />
            <h2 className="text-xl font-medium text-gray-900">Select a conversation</h2>
            <p className="mt-1 text-sm">Choose a conversation from the list to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}

