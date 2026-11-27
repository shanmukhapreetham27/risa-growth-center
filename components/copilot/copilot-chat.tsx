"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCopilot } from "./copilot-provider";
import { ProposalCard } from "./proposal-card";

const TOOL_LABEL: Record<string, string> = {
  get_overview: "overview metrics",
  get_funnel: "funnel",
  compare_snapshots: "snapshot comparison",
  list_opportunities: "opportunities",
  get_opportunity_history: "opportunity history",
  get_campaign_decisions: "campaign decisions",
  get_collections: "collections",
  get_budgets: "budgets and spend",
  list_tasks: "tasks",
  query_data: "SQL query",
  calculate: "calculation",
  data_dictionary: "data dictionary",
  propose_task: "task proposal",
  propose_campaign_status: "campaign status proposal",
  grounding_check: "number check: recalculating untraced figures",
};

function Answer({ text }: { text: string }) {
  return (
    <div className="copilot-md flex flex-col gap-2 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="max-w-full overflow-x-auto" data-allow-hscroll="copilot-answer-table">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b px-2 py-1 align-top">{children}</td>,
          ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          code: ({ children }) => <code className="rounded bg-muted px-1 text-xs">{children}</code>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** The conversation, "Data used" lists, proposal cards, working indicator and input (panel and full page). */
export function CopilotChat({ full = false }: { full?: boolean }) {
  const { turns, busy, progress, send, reset } = useCopilot();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, progress?.tools.length, busy]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    const q = draft;
    setDraft("");
    void send(q);
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", full && "min-h-[70vh]")} data-testid="copilot-chat">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-4" data-testid="copilot-messages">
        {turns.length === 0 && (
          <div className="text-sm text-muted-foreground">
            <p>Ask about CampusFest 2025 sponsorship: partnerships, pipeline, campaigns, collections or tasks. Answers use the app&apos;s simulation date and only numbers from the data.</p>
            <p className="mt-2">Actions (create a task, pause a campaign) come back as cards; nothing is saved until you click Confirm.</p>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={t.id} className="ml-8 self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" data-testid="copilot-user-turn">
              {t.text}
            </div>
          ) : (
            <div key={t.id} className="flex flex-col gap-2" data-testid="copilot-assistant-turn" data-last={i === turns.length - 1 ? "true" : undefined}>
              {t.error ? (
                <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" data-testid="copilot-error">
                  {t.error}
                </p>
              ) : (
                t.text && (
                  <div data-testid="copilot-answer" data-markdown={t.text}>
                    <Answer text={t.text} />
                  </div>
                )
              )}
              {t.notice && <p className="text-xs text-amber-700">{t.notice}</p>}
              {t.proposals?.map((p) => <ProposalCard key={p.proposal_id} p={p} />)}
              {t.toolCalls && t.toolCalls.length > 0 && (
                <details className="rounded-md border px-2 py-1 text-xs" data-testid="data-used">
                  <summary className="cursor-pointer text-muted-foreground">
                    Data used ({t.toolCalls.length} tool call{t.toolCalls.length === 1 ? "" : "s"}
                    {t.ms ? `, ${(t.ms / 1000).toFixed(1)} s` : ""})
                  </summary>
                  <ul className="mt-1 flex flex-col gap-1">
                    {t.toolCalls.map((c) => (
                      <li key={c.id} className="break-words">
                        <span className={cn("font-mono", !c.ok && "text-destructive")}>{c.name}</span>: {c.summary}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ),
        )}
        {busy && (
          <div className="flex flex-col gap-1 rounded-lg border border-dashed p-2 text-xs text-muted-foreground" data-testid="copilot-working" aria-live="polite">
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              Working{progress && progress.round > 1 ? ` (step ${progress.round})` : ""}…
            </span>
            {progress?.tools.map((t) => (
              <span key={t.id}>
                {t.name === "grounding_check" ? `↻ ${TOOL_LABEL.grounding_check}` : `${t.done ? (t.ok ? "✓" : "✗") : "…"} Reading ${TOOL_LABEL[t.name] ?? t.name}`}
              </span>
            ))}
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          data-testid="copilot-input"
          aria-label="Ask the copilot"
          placeholder="Ask about partnerships, pipeline, campaigns, collections…"
          rows={full ? 3 : 2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy || turns.length === 0}>
            New conversation
          </Button>
          <Button type="submit" size="sm" disabled={busy || !draft.trim()} data-testid="copilot-send">
            {busy ? "Working…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
