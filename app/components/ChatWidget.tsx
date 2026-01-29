/**
 * ZZA Platform - Live Chat Widget
 * A floating chat widget for customer support (Intercom-like)
 *
 * Usage:
 * <ChatWidget
 *   primaryColor="#6366f1"
 *   greeting="Hi there! How can we help you?"
 *   position="bottom-right"
 * />
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComments,
  faTimes,
  faPaperPlane,
  faPaperclip,
  faSmile,
  faCircle,
} from "@fortawesome/free-solid-svg-icons";

interface Message {
  id: string;
  content: string;
  senderType: "USER" | "ADMIN" | "SYSTEM" | "BOT";
  senderName?: string;
  createdAt: string;
  isRead: boolean;
}

interface ChatWidgetProps {
  primaryColor?: string;
  greeting?: string;
  position?: "bottom-right" | "bottom-left";
  requireEmail?: boolean;
  isOnline?: boolean;
  offlineMessage?: string;
  conversationId?: string;
  userId?: string;
  visitorId?: string;
}

export function ChatWidget({
  primaryColor = "#6366f1",
  greeting = "Hi there! How can we help you today?",
  position = "bottom-right",
  requireEmail = false,
  isOnline = true,
  offlineMessage = "We're currently away. Leave a message and we'll get back to you!",
  conversationId: initialConversationId,
  userId,
  visitorId: initialVisitorId,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [visitorId, setVisitorId] = useState(initialVisitorId);
  const [visitorEmail, setVisitorEmail] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(requireEmail && !userId);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher();

  // Generate visitor ID on mount
  useEffect(() => {
    if (!visitorId && !userId) {
      const storedId = localStorage.getItem("zza_chat_visitor_id");
      if (storedId) {
        setVisitorId(storedId);
      } else {
        const newId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem("zza_chat_visitor_id", newId);
        setVisitorId(newId);
      }
    }
  }, [visitorId, userId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !showEmailForm) {
      inputRef.current?.focus();
    }
  }, [isOpen, showEmailForm]);

  // Load existing conversation
  useEffect(() => {
    if (conversationId) {
      loadMessages();
    }
  }, [conversationId]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;

    try {
      const response = await fetch(`/api/chat/${conversationId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }, [conversationId]);

  const startConversation = async () => {
    if (requireEmail && !visitorEmail && !userId) return;

    try {
      const response = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          visitorId,
          visitorEmail,
          visitorName,
          source: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setConversationId(data.conversationId);
        setShowEmailForm(false);

        // Add greeting as first message
        setMessages([
          {
            id: "greeting",
            content: greeting,
            senderType: "BOT",
            senderName: "Support",
            createdAt: new Date().toISOString(),
            isRead: true,
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to start conversation:", error);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    const content = inputValue.trim();
    setInputValue("");

    // Optimistically add message
    const tempMessage: Message = {
      id: `temp_${Date.now()}`,
      content,
      senderType: "USER",
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    setMessages((prev) => [...prev, tempMessage]);

    // Start conversation if needed
    if (!conversationId) {
      await startConversation();
    }

    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          content,
          visitorId,
          userId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update with real message
        setMessages((prev) =>
          prev.map((m) => (m.id === tempMessage.id ? data.message : m))
        );
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const positionClasses =
    position === "bottom-right" ? "right-4 sm:right-6" : "left-4 sm:left-6";

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 sm:bottom-6 ${positionClasses} z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105`}
        style={{ backgroundColor: primaryColor }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        <FontAwesomeIcon
          icon={isOpen ? faTimes : faComments}
          className="h-6 w-6 text-white"
        />
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          className={`fixed bottom-20 sm:bottom-24 ${positionClasses} z-50 flex h-[500px] w-[350px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <FontAwesomeIcon icon={faComments} className="h-5 w-5 text-white" />
              </div>
              <FontAwesomeIcon
                icon={faCircle}
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 ${
                  isOnline ? "text-green-400" : "text-gray-400"
                }`}
              />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white">Support</h3>
              <p className="text-xs text-white/80">
                {isOnline ? "We typically reply in minutes" : "Currently away"}
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <FontAwesomeIcon icon={faTimes} className="h-5 w-5" />
            </button>
          </div>

          {/* Email Form */}
          {showEmailForm ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6">
              <div className="mb-6 text-center">
                <h4 className="text-lg font-semibold text-gray-900">
                  Start a conversation
                </h4>
                <p className="mt-1 text-sm text-gray-600">
                  Enter your details to begin
                </p>
              </div>
              <div className="w-full space-y-4">
                <input
                  type="text"
                  placeholder="Your name"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  type="email"
                  placeholder="Your email"
                  value={visitorEmail}
                  onChange={(e) => setVisitorEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={startConversation}
                  disabled={!visitorEmail}
                  className="w-full rounded-lg py-2 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  Start Chat
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <p className="text-gray-600">{isOnline ? greeting : offlineMessage}</p>
                      <p className="mt-2 text-sm text-gray-500">
                        Send us a message to get started
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`mb-4 flex ${
                      message.senderType === "USER" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        message.senderType === "USER"
                          ? "rounded-br-md bg-indigo-600 text-white"
                          : message.senderType === "SYSTEM"
                          ? "bg-gray-100 text-center text-xs text-gray-500"
                          : "rounded-bl-md bg-gray-100 text-gray-900"
                      }`}
                      style={
                        message.senderType === "USER"
                          ? { backgroundColor: primaryColor }
                          : {}
                      }
                    >
                      {message.senderType !== "USER" && message.senderType !== "SYSTEM" && (
                        <p className="mb-1 text-xs font-medium text-gray-500">
                          {message.senderName || "Support"}
                        </p>
                      )}
                      <p className="text-sm">{message.content}</p>
                      <p
                        className={`mt-1 text-xs ${
                          message.senderType === "USER" ? "text-white/70" : "text-gray-400"
                        }`}
                      >
                        {formatTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="mb-4 flex justify-start">
                    <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3">
                      <div className="flex space-x-1">
                        <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                        <div
                          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: "0.1s" }}
                        />
                        <div
                          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: "0.2s" }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <FontAwesomeIcon icon={faPaperclip} className="h-4 w-4" />
                  </button>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Type a message..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <FontAwesomeIcon icon={faSmile} className="h-4 w-4" />
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!inputValue.trim()}
                    className="rounded-full p-2 text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <FontAwesomeIcon icon={faPaperPlane} className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-gray-400">
                  Powered by ZZA Platform
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default ChatWidget;

