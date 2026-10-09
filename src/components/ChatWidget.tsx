"use client";

import { useEffect, useRef, useState } from "react";
import { BUSINESS } from "@/lib/content";

/**
 * The website assistant.
 *
 * Presented as a restrained panel rather than a bouncing bubble - the brand
 * is premium, so the widget stays quiet until it is asked for. All reasoning
 * happens server-side at /api/chat; the browser holds only the transcript and
 * the lead id the server returns.
 */

interface Message {
  role: "user" | "assistant";
  content: string;
}

const OPENING: Message = {
  role: "assistant",
  content:
    "Thank you for visiting Merry Cleaners. I can explain what each of our cleans includes, provide an estimate for your London property, and arrange a booking. How may I help?",
};

const SUGGESTIONS = [
  "What does an end of tenancy clean include?",
  "Estimate for a 2 bedroom flat in SW4",
  "Office cleaning for a studio in E8",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([OPENING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Drop the opening line: the API expects the visitor to speak first.
          messages: next.filter(
            (message, index) => index > 0 || message.role === "user",
          ),
          leadId,
        }),
      });
      const data = await response.json();
      setLeadId(data.leadId ?? leadId);
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            data.reply ??
            `I am sorry, I could not reach our system just then. Please call us on ${BUSINESS.phonePrimary}.`,
        },
      ]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: `I am sorry, I could not reach our system just then. Please call us on ${BUSINESS.phonePrimary} and a member of our team will help you directly.`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="chat-launch"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls="chat-panel"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M1 3.5h14v8H8.5L5 14.5V11.5H1z" />
        </svg>
        Ask about a clean
      </button>
    );
  }

  return (
    <section
      className="chat-panel"
      id="chat-panel"
      aria-label="Chat with Merry Cleaners"
    >
      <header className="chat-head">
        <div>
          <p className="t">Merry Cleaners assistant</p>
          <p className="s">Estimates and bookings across London</p>
        </div>
        <button
          type="button"
          className="chat-close"
          onClick={() => setOpen(false)}
        >
          <span className="sr-only">Close the chat</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>
      </header>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.map((message, index) => (
          <p
            key={index}
            className={`msg ${message.role === "assistant" ? "from-us" : "from-them"}`}
          >
            {message.content}
          </p>
        ))}

        {busy && <p className="msg thinking">Checking that for you&hellip;</p>}

        {messages.length === 1 && !busy && (
          <div className="chat-suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your message
        </label>
        <input
          id="chat-input"
          className="input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type your message"
          autoComplete="off"
        />
        <button
          type="submit"
          className="chat-send"
          disabled={busy || !input.trim()}
        >
          <span className="sr-only">Send</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M1 8h12M9 4l4 4-4 4" />
          </svg>
        </button>
      </form>

      <p className="chat-legal">
        Estimates given here are indicative and confirmed by our team. We use
        the details you provide only to prepare your quote and arrange your
        clean.
      </p>
    </section>
  );
}
