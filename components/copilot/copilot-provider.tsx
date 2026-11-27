"use client";

/**
 * Copilot state shared by the side panel and the full page (one conversation per browser tab).
 * Keeps the full Anthropic messages array, including assistant thinking and tool_use blocks and the
 * user tool_result blocks, and sends it back unchanged every turn (CONTEXT §5.9). Confirm and Cancel
 * results reach the model as an "[App note]" text block at the start of the next user turn (Phase 0
 * Q15), so history stays append-only.
 */
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ChatResult, ToolCallRecord, UsageTotals } from "@/lib/copilot/chat";
import type { Proposal } from "@/lib/copilot/proposals";

export type ProposalView = Proposal & { busy?: "confirm" | "reject"; error?: string };

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCallRecord[];
  proposals?: ProposalView[];
  notice?: string;
  error?: string;
  usage?: UsageTotals;
  ms?: number;
}

interface Progress {
  round: number;
  tools: { id: string; name: string; done: boolean; ok?: boolean; summary?: string }[];
}

interface CopilotState {
  turns: Turn[];
  busy: boolean;
  progress: Progress | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  owners: { id: string; name: string }[];
  send: (text: string) => Promise<void>;
  confirm: (id: string, edits?: Record<string, unknown>) => Promise<void>;
  reject: (id: string) => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<CopilotState | null>(null);

export function useCopilot(): CopilotState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCopilot must be used inside CopilotProvider");
  return v;
}

type Message = { role: "user" | "assistant"; content: unknown };
let seq = 0;
const nextId = () => `t${Date.now()}-${seq++}`;

function describeResult(p: Proposal): string {
  const r = p.result ?? {};
  if (r.record === "task") return `task ${r.task_id} "${r.title}" created for ${r.owner_name}, due ${r.due_date}`;
  if (r.record === "campaign") return `campaign ${r.sponsor_campaign_id} ${r.campaign_name} is now ${r.status} (was ${r.previous_status})`;
  return "done";
}

export function CopilotProvider({ owners, children }: { owners: { id: string; name: string }[]; children: React.ReactNode }) {
  const router = useRouter();
  const history = useRef<Message[]>([]);
  const notes = useRef<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [open, setOpen] = useState(false);

  const updateProposal = useCallback((id: string, patch: Partial<ProposalView>) => {
    setTurns((ts) => ts.map((t) => (t.proposals?.some((p) => p.proposal_id === id) ? { ...t, proposals: t.proposals.map((p) => (p.proposal_id === id ? { ...p, ...patch } : p)) } : t)));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      const content: { type: "text"; text: string }[] = [];
      if (notes.current.length) content.push({ type: "text", text: `[App note] ${notes.current.join(" ")}` });
      content.push({ type: "text", text: q });
      const pendingNotes = notes.current;
      notes.current = [];
      history.current = [...history.current, { role: "user", content }];
      setTurns((ts) => [...ts, { id: nextId(), role: "user", text: q }]);
      setBusy(true);
      setProgress({ round: 1, tools: [] });
      let result: ChatResult | null = null;
      let error: string | null = null;
      try {
        const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.current }) });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(j?.message ?? `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === "round") setProgress((p) => ({ round: ev.round, tools: p?.tools ?? [] }));
            else if (ev.type === "tool_start") setProgress((p) => ({ round: p?.round ?? 1, tools: [...(p?.tools ?? []), { id: ev.id, name: ev.name, done: false }] }));
            else if (ev.type === "tool_end")
              setProgress((p) => ({ round: p?.round ?? 1, tools: (p?.tools ?? []).map((t) => (t.id === ev.id ? { ...t, done: true, ok: ev.ok, summary: ev.summary } : t)) }));
            else if (ev.type === "grounding")
              setProgress((p) => ({ round: p?.round ?? 1, tools: [...(p?.tools ?? []), { id: `grounding-${Date.now()}`, name: "grounding_check", done: true, ok: false, summary: ev.unverified.join(", ") }] }));
            else if (ev.type === "done") result = ev.result as ChatResult;
            else if (ev.type === "error") error = ev.message;
          }
        }
        if (!result && !error) error = "The connection closed before an answer arrived.";
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      if (result) {
        const r: ChatResult = result;
        history.current = [...history.current, ...(r.appended as Message[])];
        setTurns((ts) => [...ts, { id: nextId(), role: "assistant", text: r.text, toolCalls: r.tool_calls, proposals: r.proposals, notice: r.notice, usage: r.usage, ms: r.ms }]);
      } else {
        // Drop the unanswered user turn so a retry sends a clean history; keep the app notes for next time.
        history.current = history.current.slice(0, -1);
        notes.current = [...pendingNotes, ...notes.current];
        setTurns((ts) => [...ts, { id: nextId(), role: "assistant", text: "", error: error ?? "Unknown error" }]);
      }
      setBusy(false);
      setProgress(null);
    },
    [busy],
  );

  const confirm = useCallback(
    async (id: string, edits?: Record<string, unknown>) => {
      updateProposal(id, { busy: "confirm", error: undefined });
      const res = await fetch(`/api/proposals/${encodeURIComponent(id)}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; proposal?: Proposal; error?: string };
      if (j.ok && j.proposal) {
        updateProposal(id, { ...j.proposal, busy: undefined });
        notes.current.push(`Proposal ${id} was confirmed by the user${edits && Object.keys(edits).length ? " after editing it" : ""}: ${describeResult(j.proposal)}.`);
        router.refresh();
      } else updateProposal(id, { busy: undefined, error: j.error ?? `Confirm failed (${res.status})` });
    },
    [router, updateProposal],
  );

  const reject = useCallback(
    async (id: string) => {
      updateProposal(id, { busy: "reject", error: undefined });
      const res = await fetch(`/api/proposals/${encodeURIComponent(id)}/reject`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; proposal?: Proposal; error?: string };
      if (j.ok && j.proposal) {
        updateProposal(id, { ...j.proposal, busy: undefined });
        notes.current.push(`Proposal ${id} was cancelled by the user; nothing was written.`);
      } else updateProposal(id, { busy: undefined, error: j.error ?? `Cancel failed (${res.status})` });
    },
    [updateProposal],
  );

  const reset = useCallback(() => {
    history.current = [];
    notes.current = [];
    setTurns([]);
  }, []);

  const value = useMemo(() => ({ turns, busy, progress, open, setOpen, owners, send, confirm, reject, reset }), [turns, busy, progress, open, owners, send, confirm, reject, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
