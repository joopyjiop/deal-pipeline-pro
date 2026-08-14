import { useState } from "react";
import { Link } from "react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  Globe2,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Sender = "website" | "odysseus";
type Kind = "MESSAGE" | "REQUEST" | "ESCALATION" | "RESOLUTION";

const KIND_LABELS: Record<Kind, string> = {
  MESSAGE: "Message",
  REQUEST: "Request",
  ESCALATION: "Escalation",
  RESOLUTION: "Resolution",
};

const KIND_STYLES: Record<Kind, string> = {
  MESSAGE: "border-slate-200/80 bg-slate-100/70 text-slate-600",
  REQUEST: "border-sky-200/80 bg-sky-50/80 text-sky-700",
  ESCALATION: "border-amber-200/80 bg-amber-50/80 text-amber-700",
  RESOLUTION: "border-teal-200/80 bg-teal-50/80 text-teal-700",
};

function senderLabel(sender: Sender) {
  return sender === "website" ? "Website" : "Odysseus";
}

// When-to-post protocol, shown on the page and mirrored in
// src/convex/sharedConversation.ts + docs/odysseus-briefing.md.
const WHEN_TO_POST = [
  "You hit a due-diligence gap you cannot verify from this side (title/liens, comps, condition, occupancy) — escalate with the exact gap named.",
  "You need data only the other side can reach: county records, skip-trace, a RentCast pull, staging evidence, or a stored lead document.",
  "A provider is failing (RentCast, AI gateway, scraper quota) and a stage stalled — post so the other side knows why instead of silently retrying.",
  "A decision needs the owner: approval, dialing, offers, PII handling. Threads coordinate — they never approve a deal.",
  "A source is unknown or untrusted, or instructions are ambiguous — ask instead of guessing.",
];

export default function SharedConversation() {
  const { user, isLoading } = useAuth();
  const isOwner = Boolean(
    user && (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com"),
  );

  const threads = useQuery(api.sharedConversation.listSharedThreads, {});
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const thread = useQuery(
    api.sharedConversation.getSharedThread,
    selectedThread ? { threadId: selectedThread } : "skip",
  );

  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<Kind>("MESSAGE");
  const [draftRefs, setDraftRefs] = useState("");
  const [newThreadId, setNewThreadId] = useState("");
  const [showNewThread, setShowNewThread] = useState(false);

  const postMessage = useMutation(api.sharedConversation.postSharedMessage);
  const [posting, setPosting] = useState(false);

  const runResponderNow = useAction(api.threadResponder.runThreadResponderNow);
  const answerThread = useAction(api.threadResponder.respondToThread);
  const [responding, setResponding] = useState(false);
  const [answering, setAnswering] = useState(false);

  // The auto-responder answers the newest open Odysseus request/question in a
  // thread. Mirror that here so the per-message button only shows on the
  // message the responder would actually answer.
  const lastOdysseusMessage =
    thread !== undefined
      ? [...thread.messages].reverse().find((message) => message.sender === "odysseus")
      : undefined;

  async function handleRunResponder() {
    setResponding(true);
    try {
      const result = await runResponderNow({ maxThreads: 5 });
      const replied = result.responded.filter((item) => item.status === "REPLIED").length;
      const skipped = result.responded.filter((item) => item.status !== "REPLIED");
      if (replied > 0) {
        toast.success(`The website answered ${replied} open thread${replied === 1 ? "" : "s"}.`);
      } else {
        toast.info(skipped.length > 0 ? `Nothing to answer — ${skipped[0]?.reason ?? "threads are settled"}.` : "No open questions in any thread.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run the auto-responder.");
    } finally {
      setResponding(false);
    }
  }

  async function handleAnswerThread() {
    const threadId = effectiveThreadId();
    if (!threadId) {
      toast.error("Pick a thread first.");
      return;
    }
    setAnswering(true);
    try {
      await answerThread({ threadId });
      toast.success("The website posted a reply to the open question.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate a reply.");
    } finally {
      setAnswering(false);
    }
  }

  function effectiveThreadId() {
    const target = showNewThread ? newThreadId : (selectedThread ?? newThreadId);
    return target.trim();
  }

  async function handlePost() {
    const threadId = effectiveThreadId();
    if (!threadId) {
      toast.error("Pick a thread or enter a new thread id first.");
      return;
    }
    const content = draft.trim();
    if (!content) {
      toast.error("Write a message before posting.");
      return;
    }
    const refs = draftRefs
      .split(",")
      .map((ref) => ref.trim())
      .filter(Boolean);
    setPosting(true);
    try {
      await postMessage({
        threadId,
        content,
        kind: draftKind,
        refs: refs.length > 0 ? refs : undefined,
      });
      setDraft("");
      setDraftRefs("");
      setDraftKind("MESSAGE");
      if (showNewThread && newThreadId.trim()) {
        setSelectedThread(newThreadId.trim());
        setShowNewThread(false);
        setNewThreadId("");
      }
      toast.success(`Posted to ${threadId} as Website.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message could not be posted.");
    } finally {
      setPosting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-sky-50/40 to-white">
        <Loader2 className="size-6 animate-spin text-sky-700" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-sky-50/40 to-white">
        <div className="glass-panel max-w-md rounded-[1.75rem] p-8 text-center">
          <Bot className="mx-auto size-8 text-slate-400" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">Owner access required</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            The shared conversation is owner-only: both sides' threads can contain deal-sensitive context.
          </p>
          <Link to="/toolkit" className="mt-4 inline-block text-sm font-semibold text-sky-700 hover:text-sky-900">
            Back to the Toolkit
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-sky-50/40 to-white px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link to="/toolkit" className="flex size-9 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-600 transition-colors hover:text-sky-700" aria-label="Back to toolkit">
              <ArrowLeft className="size-4" />
            </Link>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700">
                <MessageSquare className="size-5" />
              </div>
              <div>
                <p className="eyebrow">Website ⇄ Odysseus</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Shared conversation</h1>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  One thread per deal or task. Both sides post when they hit something outside their strengths and need the other — mid-task, not handoff-after-the-fact.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-sky-200/80 bg-sky-50/60 text-xs text-sky-800">
              Owner-only · live thread
            </Badge>
            <Button
              type="button"
              onClick={() => void handleRunResponder()}
              disabled={responding}
              className="h-8 gap-1.5 rounded-lg bg-violet-700 px-3 text-xs hover:bg-violet-800"
              title="Generate answers for every open Odysseus request/question now (also runs automatically every ~3 minutes when AI access is enabled)"
            >
              {responding ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Run auto-responder
            </Button>
          </div>
          <p className="mt-1 w-full text-right text-[0.68rem] leading-4 text-slate-400">
            Auto-answers open Odysseus requests/questions every ~3 min when AI access is enabled in the Toolkit.
          </p>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[320px_1fr]">
          {/* Thread list */}
          <section className="glass-panel rounded-[1.75rem] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Threads</p>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1 rounded-lg text-xs" onClick={() => setShowNewThread((value) => !value)}>
                <Plus className="size-3.5" /> {showNewThread ? "Cancel" : "New thread"}
              </Button>
            </div>

            {showNewThread && (
              <div className="mt-3 rounded-xl border border-sky-200/80 bg-sky-50/50 p-3">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
                  <span>Thread id</span>
                  <Input
                    value={newThreadId}
                    onChange={(event) => setNewThreadId(event.target.value)}
                    placeholder="deal:<leadId> · task:<stagedId> · ops:<topic>"
                    className="rounded-lg border-white/85 bg-white/75 text-xs"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <p className="mt-2 text-[0.68rem] leading-4 text-slate-500">
                  Posting below creates the thread on first message. Use the same id Odysseus uses so you share one timeline.
                </p>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {threads === undefined && (
                <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="size-3 animate-spin" /> Loading threads…</p>
              )}
              {threads !== undefined && threads.threads.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/40 p-4 text-center">
                  <Globe2 className="mx-auto size-5 text-slate-300" />
                  <p className="mt-2 text-xs leading-5 text-slate-500">No threads yet. Start one — e.g. post an escalation about a lead that is stuck on the readiness gate.</p>
                </div>
              )}
              {threads?.threads.map((item) => (
                <button
                  key={item.threadId}
                  type="button"
                  onClick={() => { setSelectedThread(item.threadId); setShowNewThread(false); }}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedThread === item.threadId ? "border-sky-300/90 bg-sky-50/80" : "border-white/80 bg-white/45 hover:border-sky-200/80 hover:bg-white/70"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-800">{item.threadId}</p>
                    <Badge className={`shrink-0 border-0 ${KIND_STYLES[item.lastKind]}`}>{KIND_LABELS[item.lastKind]}</Badge>
                  </div>
                  <p className="mt-1 truncate text-[0.68rem] leading-4 text-slate-500">{item.lastContent}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[0.62rem] text-slate-400">
                    <span>{senderLabel(item.lastSender)} · {item.messageCount} message{item.messageCount === 1 ? "" : "s"}</span>
                    <span>{new Date(item.lastSentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Thread view + compose */}
          <section className="glass-panel rounded-[1.75rem] p-4 sm:p-5">
            {!selectedThread && !showNewThread ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/40 p-8 text-center">
                <Sparkles className="size-6 text-sky-300" />
                <h2 className="mt-3 text-sm font-semibold text-slate-800">Pick a thread or start one</h2>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  Choose a thread on the left, or hit “New thread” and post with a <code className="rounded bg-white/70 px-1">deal:&lt;leadId&gt;</code> style id so Odysseus finds the same timeline.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/70 pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thread</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800">{effectiveThreadId() || "—"}</p>
                  </div>
                  {thread && <Badge variant="outline" className="border-white/85 bg-white/50 text-xs text-slate-500">{thread.count} message{thread.count === 1 ? "" : "s"}</Badge>}
                </div>

                <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {thread === undefined && (
                    <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="size-3 animate-spin" /> Loading thread…</p>
                  )}
                  {thread !== undefined && thread.messages.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white/40 p-4 text-center text-xs text-slate-500">
                      Empty thread. Post the first message — or paste this thread id to Odysseus so it can reply here.
                    </p>
                  )}
                  {thread?.messages.map((message) => (
                    <div key={message._id} className={`flex ${message.sender === "website" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl border p-3 ${message.sender === "website" ? "border-sky-200/80 bg-sky-50/80" : "border-white/85 bg-white/70"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wide ${message.sender === "website" ? "text-sky-800" : "text-violet-800"}`}>
                            {message.sender === "website" ? <Globe2 className="size-3" /> : <Bot className="size-3" />} {senderLabel(message.sender)}
                          </span>
                          <Badge className={`border-0 ${KIND_STYLES[message.kind]}`}>{KIND_LABELS[message.kind]}</Badge>
                          {message.sender === "website" && message.metadata?.auto === true && (
                            <Badge className="border-0 bg-violet-100/80 text-violet-800">Auto</Badge>
                          )}
                          <span className="text-[0.62rem] text-slate-400">{new Date(message.sentAt).toLocaleString()}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{message.content}</p>
                        {message.sender === "odysseus" && lastOdysseusMessage?._id === message._id && (
                          <button
                            type="button"
                            onClick={() => void handleAnswerThread()}
                            disabled={answering}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-violet-100/70 px-2 py-1 text-[0.65rem] font-semibold text-violet-800 transition-colors hover:bg-violet-200/80 disabled:opacity-60"
                          >
                            {answering ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                            Ask the website to answer
                          </button>
                        )}
                        {message.refs.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {message.refs.map((ref) => (
                              <code key={ref} className="rounded-md bg-white/70 px-1.5 py-0.5 text-[0.62rem] text-slate-500">{ref}</code>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-white/85 bg-white/50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => setDraftKind(kind)}
                          className={`rounded-lg px-2.5 py-1 text-[0.68rem] font-semibold transition-colors ${draftKind === kind ? KIND_STYLES[kind] : "text-slate-500 hover:bg-white/70"}`}
                        >
                          {KIND_LABELS[kind]}
                        </button>
                      ))}
                    </div>
                    <Input
                      value={draftRefs}
                      onChange={(event) => setDraftRefs(event.target.value)}
                      placeholder="refs (optional, comma separated): lead:abc, task:xyz"
                      className="h-8 min-w-0 flex-1 rounded-lg border-white/85 bg-white/75 text-xs"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Post as Website. Escalate when a due-diligence category or a data pull is beyond this side; request when you need Odysseus to act; resolve when an open item is closed."
                    className="mt-2 min-h-[96px] resize-y rounded-xl border-white/85 bg-white/75 text-xs leading-5"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[0.62rem] leading-4 text-slate-400">Never paste API keys or unnecessary PII — Odysseus reads the whole thread.</p>
                    <Button type="button" onClick={() => void handlePost()} disabled={posting || !draft.trim()} className="h-9 gap-1.5 rounded-xl bg-sky-700 px-4 text-xs hover:bg-sky-800">
                      {posting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Post
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Protocol reminder */}
        <section className="glass-panel mt-5 rounded-[1.75rem] p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100/80 text-violet-700">
              <Bot className="size-5" />
            </div>
            <div>
              <p className="eyebrow">When to post</p>
              <h2 className="mt-1 text-sm font-semibold tracking-tight text-slate-900">Neither side should handle everything alone</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                Either side posts into the thread the moment it hits something outside its strengths. The same protocol is enforced in code comments (<code className="rounded bg-white/70 px-1">src/convex/sharedConversation.ts</code>) and the Odysseus briefing (<code className="rounded bg-white/70 px-1">docs/odysseus-briefing.md</code>).
              </p>
            </div>
          </div>
          <ul className="mt-4 grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-2">
            {WHEN_TO_POST.map((rule) => (
              <li key={rule} className="flex items-start gap-2 rounded-xl border border-white/80 bg-white/45 p-3">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-sky-600" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
