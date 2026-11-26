import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  MessageSquare,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react';

export interface PuteriRanniaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
}

export interface PuteriRanniaSiteContext {
  siteId: string;
  siteCode: string;
  siteName: string;
  architectureName: string;
  adminWingSide: string;
  totalFacilityPowerMw: number;
  totalItLoadMw: number;
  pue: number;
  serverSummary: {
    total: number;
    nominal: number;
    warning: number;
    critical: number;
    maintenance: number;
  };
  plantSummary: {
    waterChillersOnline: number;
    waterChillersTotal: number;
    airChillersRunning: number;
    airChillersStandby: number;
    airChillersTotal: number;
    squareBufferTanksCount: number;
    generatorsTotal: number;
    generatorsRunning: number;
    dieselTanksCount: number;
    upsTotal: number;
    utilityFeed: string;
  };
  openAlertsCount: number;
  criticalAlertsCount: number;
  topOpenAlerts: Array<{
    ruleName: string;
    severity: string;
    target: string;
    message: string;
  }>;
  powerSurgeRules: Array<{
    name: string;
    thresholdMw: number;
    durationSec: number;
    enabled: boolean;
  }>;
  openTicketsCount: number;
  p1TicketsCount: number;
}

interface PuteriRanniaChatBoxProps {
  siteContext: PuteriRanniaSiteContext;
}

const QUICK_PROMPTS = [
  'Chiller & generator status',
  'Check active alerts',
  'Site power & PUE summary',
];

function createWelcomeMessage(siteCode: string, architectureName: string): PuteriRanniaMessage {
  return {
    id: `pr-welcome-${siteCode}`,
    role: 'assistant',
    content: `Hello, I am Rannia, your Orise DCIM AI Operations Assistant. I am synced to ${siteCode} (${architectureName}) live telemetry — ask me about chillers, generators, power surges, SLA compliance, or open operations tickets.`,
    timestamp: Date.now(),
  };
}

export function PuteriRanniaChatBox({ siteContext }: PuteriRanniaChatBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<PuteriRanniaMessage[]>(() => [
    createWelcomeMessage(siteContext.siteCode, siteContext.architectureName),
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen, isSending]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const sendMessage = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isSending) return;

    setErrorText(null);
    setLastPrompt(trimmed);

    const userMsg: PuteriRanniaMessage = {
      id: `pr-user-${Date.now().toString(36)}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const historyPayload = messages.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/ai/puteri-rannia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          siteContext,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string; model?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      const replyMsg: PuteriRanniaMessage = {
        id: `pr-ai-${Date.now().toString(36)}`,
        role: 'assistant',
        content: data.reply,
        timestamp: Date.now(),
        model: data.model,
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Unable to reach Rannia AI service.');
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setErrorText(null);
    setLastPrompt(null);
    setMessages([createWelcomeMessage(siteContext.siteCode, siteContext.architectureName)]);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
      {isOpen && (
        <section
          data-testid="puteri-rannia-panel"
          aria-label="Rannia AI Operations Chat"
          className="mb-3 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-white dark:bg-[#1B2026] border border-slate-300 dark:border-slate-700 rounded-md shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Solid EcoStruxure Dark Graphite Chat Header */}
          <div className="bg-[#1D2126] text-white px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-sm bg-[#009530] flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-semibold tracking-tight text-white truncate">
                    Rannia
                  </h2>
                  <Sparkles className="w-3.5 h-3.5 text-[#3DCD58] shrink-0" aria-hidden="true" />
                </div>
                <p className="text-[11px] font-mono text-slate-300 truncate">
                  AI Operations Assistant · {siteContext.siteCode}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleReset}
                aria-label="Reset Rannia conversation"
                title="Reset conversation"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-sm transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Minimize Rannia chat box"
                title="Minimize"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-sm transition-colors cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Live Site Telemetry Context Strip */}
          <div className="px-3.5 py-2 bg-slate-50 dark:bg-[#14181D] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 shrink-0 tabular-nums">
            <span>
              {siteContext.siteCode} · {siteContext.totalFacilityPowerMw.toFixed(2)} MW · PUE {siteContext.pue.toFixed(2)}
            </span>
            <span>
              {siteContext.openAlertsCount} Alerts · {siteContext.openTicketsCount} Tickets
            </span>
          </div>

          {/* Scrollable Message Transcript */}
          <div
            ref={listRef}
            data-testid="puteri-rannia-messages"
            className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-white dark:bg-[#1B2026]"
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mb-1 px-0.5">
                    {isUser ? 'You' : 'Rannia'}
                  </div>
                  <div
                    className={`max-w-[88%] rounded-md px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-[#009530] text-white'
                        : 'bg-slate-100 dark:bg-[#252A30] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex flex-col items-start">
                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mb-1 px-0.5">
                  Rannia
                </div>
                <div className="rounded-md px-3 py-2 text-xs bg-slate-100 dark:bg-[#252A30] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Analyzing {siteContext.siteCode} live telemetry...
                </div>
              </div>
            )}

            {errorText && (
              <div
                role="alert"
                data-testid="puteri-rannia-error"
                className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-2.5 text-xs text-red-800 dark:text-red-300 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{errorText}</span>
                </div>
                {lastPrompt && (
                  <button
                    type="button"
                    onClick={() => sendMessage(lastPrompt)}
                    className="text-[11px] font-semibold underline cursor-pointer"
                  >
                    Retry last question
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick Prompt Bar */}
          <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#14181D] flex flex-wrap gap-1.5 shrink-0">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={isSending}
                onClick={() => sendMessage(q)}
                className="px-2 py-1 text-[11px] font-medium rounded-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1B2026] text-slate-700 dark:text-slate-200 hover:border-[#009530] hover:text-[#009530] dark:hover:text-[#3DCD58] transition-colors cursor-pointer disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Message Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B2026] flex items-center gap-2 shrink-0"
          >
            <label htmlFor="puteri-rannia-input" className="sr-only">
              Ask Rannia
            </label>
            <input
              ref={inputRef}
              id="puteri-rannia-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSending}
              placeholder={`Ask Rannia about ${siteContext.siteCode}...`}
              className="flex-1 min-w-0 px-3 py-2 text-xs rounded-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#14181D] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#009530]/30 focus:border-[#009530]"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              aria-label="Send message to Rannia"
              className="inline-flex items-center justify-center px-3 py-2 rounded-sm bg-[#009530] hover:bg-[#007A27] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}

      {/* Floating Launcher Button (Solid opaque surface, zero backdrop-blur) */}
      <button
        type="button"
        data-testid="puteri-rannia-toggle"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close Rannia AI chat box' : 'Open Rannia AI chat box'}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-md bg-[#1D2126] hover:bg-[#252A30] text-white border border-[#3DCD58]/60 shadow-lg transition-colors cursor-pointer"
      >
        <span className="w-7 h-7 rounded-sm bg-[#009530] flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4 text-white" aria-hidden="true" />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-xs font-semibold tracking-tight text-white">
            Rannia
          </span>
          <span className="block text-[10px] font-mono text-[#3DCD58]">
            AI Chat · {siteContext.siteCode}
          </span>
        </span>
      </button>
    </div>
  );
}
