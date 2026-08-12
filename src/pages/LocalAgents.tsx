import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft,
  Bot,
  Check,
  Clipboard,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type LocalAgentRole = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
};

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

const DEFAULT_ENDPOINT = "http://127.0.0.1:11434/v1";
const DEFAULT_MODEL = "qwen3:4b";
const SETTINGS_KEY = "deal-pipeline-local-agent-settings";

const roles: LocalAgentRole[] = [
  {
    id: "source-researcher",
    name: "Source researcher",
    description: "Organizes public-source notes without inventing facts.",
    systemPrompt: "You are a careful real-estate source researcher. Use only the evidence supplied by the user. Separate facts, unknowns, and follow-up checks. Never invent names, addresses, phone numbers, ownership, distress, or sale details.",
  },
  {
    id: "evidence-auditor",
    name: "Evidence auditor",
    description: "Checks whether a listing note has enough source evidence for review.",
    systemPrompt: "You are an evidence auditor. Review only the supplied text. Identify source URL, source date, property location, source reference, and explicit distress evidence. Mark each field present, missing, or ambiguous. Do not upgrade unverified information.",
  },
  {
    id: "underwriting-analyst",
    name: "Underwriting analyst",
    description: "Creates a cautious analysis from explicit numbers and assumptions.",
    systemPrompt: "You are a conservative real-estate underwriting analyst. Use only numbers explicitly supplied by the user, show assumptions, label estimates, and identify missing comps or costs. Never present an estimate as a verified deal or financial advice.",
  },
  {
    id: "review-judge",
    name: "Review judge",
    description: "Summarizes risks and recommends next review steps.",
    systemPrompt: "You are a review judge for a source-first real-estate pipeline. Give a recommendation of PROCEED, HOLD, or PASS based only on supplied evidence. Explain missing evidence and compliance risks. Your recommendation is not approval and never authorizes contact, export, or a database write.",
  },
];

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function chatUrl(endpoint: string) {
  return `${cleanBaseUrl(endpoint)}/chat/completions`;
}

function modelsUrl(endpoint: string) {
  return `${cleanBaseUrl(endpoint)}/models`;
}

function extractContent(payload: ChatResponse) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("").trim();
  return "";
}

type LocalAgentSettings = {
  endpoint?: string;
  model?: string;
  roleId?: string;
};

function loadSettings(): LocalAgentSettings {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as LocalAgentSettings | null ?? {};
  } catch {
    return {};
  }
}

export default function LocalAgents() {
  const { user } = useAuth();
  const isOwner = Boolean(
    user &&
      (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com"),
  );
  const [savedSettings] = useState<LocalAgentSettings>(loadSettings);
  const [endpoint, setEndpoint] = useState(() => savedSettings.endpoint ?? DEFAULT_ENDPOINT);
  const [model, setModel] = useState(() => savedSettings.model ?? DEFAULT_MODEL);
  const [roleId, setRoleId] = useState(() => savedSettings.roleId && roles.some((role) => role.id === savedSettings.roleId) ? savedSettings.roleId : roles[0].id);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [connectionState, setConnectionState] = useState<"unknown" | "checking" | "connected" | "offline">("unknown");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedRole = useMemo(() => roles.find((role) => role.id === roleId) ?? roles[0], [roleId]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ endpoint, model, roleId }));
  }, [endpoint, model, roleId]);

  const checkConnection = async () => {
    setConnectionState("checking");
    try {
      const response = await fetch(modelsUrl(endpoint), { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Local server returned HTTP ${response.status}`);
      const payload = (await response.json()) as { data?: Array<{ id?: string }> };
      const models = (payload.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
      setAvailableModels(models);
      setConnectionState("connected");
      toast.success(models.length ? `Local model server connected (${models.length} model${models.length === 1 ? "" : "s"}).` : "Local model server connected.");
    } catch (error) {
      setAvailableModels([]);
      setConnectionState("offline");
      toast.error(error instanceof Error ? `${error.message}. Check the endpoint and CORS settings.` : "Could not reach the local model server.");
    }
  };

  const runAgent = async () => {
    const message = prompt.trim();
    if (!message) {
      toast.error("Add source notes or a question first.");
      return;
    }
    if (!cleanBaseUrl(endpoint)) {
      toast.error("Add a local OpenAI-compatible endpoint.");
      return;
    }
    setBusy(true);
    setAnswer("");
    try {
      const response = await fetch(chatUrl(endpoint), {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          model: model.trim() || DEFAULT_MODEL,
          messages: [
            { role: "system", content: selectedRole.systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.2,
          stream: false,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ChatResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? `Local server returned HTTP ${response.status}`);
      const content = extractContent(payload);
      if (!content) throw new Error("The local model returned no text");
      setAnswer(content);
      setConnectionState("connected");
      toast.success(`${selectedRole.name} completed locally.`);
    } catch (error) {
      setConnectionState("offline");
      toast.error(error instanceof Error ? error.message : "The local agent request failed.");
    } finally {
      setBusy(false);
    }
  };

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the local answer.");
    }
  };

  const clearWorkspace = () => {
    setPrompt("");
    setAnswer("");
  };

  if (!isOwner) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <div className="glass-panel-strong max-w-md rounded-[2rem] p-8">
          <ShieldCheck className="mx-auto size-10 text-sky-700" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Owner workspace only</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Local agent review is restricted to the owner and never writes leads automatically.</p>
          <Link to="/dashboard" className="mt-6 inline-flex rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white">Back to leads</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-4 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/toolkit" className="flex size-9 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-600 transition-colors hover:text-sky-700" aria-label="Back to toolkit"><ArrowLeft className="size-4" /></Link>
            <div className="flex size-9 items-center justify-center rounded-xl bg-violet-100/80 text-violet-700"><Bot className="size-4" /></div>
            <div><p className="eyebrow">No API key required</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Local agent workspace</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/operations" className="hidden text-sm font-medium text-slate-600 hover:text-sky-700 sm:inline">Operations</Link>
            <Badge className={connectionState === "connected" ? "border-0 bg-teal-100/80 text-teal-800" : connectionState === "offline" ? "border-0 bg-rose-100/80 text-rose-800" : "border-0 bg-slate-100/80 text-slate-600"}>{connectionState === "connected" ? <><Wifi className="mr-1 size-3" /> Local connected</> : connectionState === "offline" ? <><WifiOff className="mr-1 size-3" /> Offline</> : "Not checked"}</Badge>
          </div>
        </header>

        <section className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-5">
            <section className="glass-panel rounded-[1.75rem] p-5 sm:p-6">
              <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700"><Settings2 className="size-5" /></div><div><p className="eyebrow">Local connection</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Point the app at your phone</h2><p className="mt-1 text-xs leading-5 text-slate-500">These settings stay in this browser only. No API key is sent or stored.</p></div></div>
              <div className="mt-5 space-y-3"><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>OpenAI-compatible base URL</span><Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="http://127.0.0.1:11434/v1" autoComplete="off" spellCheck={false} className="rounded-xl border-white/85 bg-white/70 text-xs" /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Model name</span><Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="qwen3:4b" autoComplete="off" spellCheck={false} className="rounded-xl border-white/85 bg-white/70 text-xs" /></label><Button type="button" variant="outline" onClick={() => void checkConnection()} disabled={connectionState === "checking"} className="h-10 w-full gap-2 rounded-xl border-white/85 bg-white/65 text-xs text-slate-700">{connectionState === "checking" ? <Loader2 className="size-4 animate-spin" /> : <Wifi className="size-4" />} Test local connection</Button></div>
              {availableModels.length > 0 && <div className="mt-4 rounded-xl border border-teal-100/80 bg-teal-50/60 p-3"><p className="text-[0.65rem] font-semibold uppercase tracking-wide text-teal-800">Models reported by server</p><div className="mt-2 flex flex-wrap gap-1.5">{availableModels.slice(0, 12).map((item) => <button type="button" key={item} onClick={() => setModel(item)} className="rounded-lg border border-teal-200/70 bg-white/70 px-2 py-1 text-[0.68rem] text-teal-800 hover:bg-white">{item}</button>)}</div></div>}
            </section>

            <section className="glass-panel rounded-[1.75rem] p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100/80 text-violet-700"><MessageSquare className="size-5" /></div><div><p className="eyebrow">Choose a role</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">One bounded local agent</h2></div></div><div className="mt-5 grid gap-2">{roles.map((role) => <button type="button" key={role.id} onClick={() => setRoleId(role.id)} className={`rounded-xl border px-3 py-3 text-left transition-colors ${role.id === roleId ? "border-violet-300/80 bg-violet-50/75" : "border-white/80 bg-white/45 hover:bg-white/70"}`}><p className="text-xs font-semibold text-slate-800">{role.name}</p><p className="mt-1 text-[0.68rem] leading-4 text-slate-500">{role.description}</p></button>)}</div></section>
          </div>

          <section className="glass-panel rounded-[1.75rem] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">{selectedRole.name}</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Analyze notes privately</h2><p className="mt-1 text-xs leading-5 text-slate-500">Paste source text, explicit numbers, or a review question. The model only sees this browser request.</p></div><Badge variant="outline" className="border-violet-200/80 bg-violet-50/60 text-xs text-violet-800">Local only</Badge></div><Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: Audit these sourced notes. List the source date, property address, sale reference, explicit distress evidence, missing fields, and the next owner review step.\n\nPaste only evidence you are permitted to review. Do not include API keys or unnecessary personal data." className="mt-5 min-h-[280px] resize-y rounded-2xl border-white/85 bg-white/65 text-sm leading-6" /><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[0.68rem] text-slate-400">No automatic database writes, exports, approvals, or contact actions.</p><div className="flex gap-2"><Button type="button" variant="ghost" onClick={clearWorkspace} className="h-9 gap-1.5 rounded-xl px-3 text-xs"><RotateCcw className="size-3.5" /> Clear</Button><Button type="button" onClick={() => void runAgent()} disabled={busy || !prompt.trim()} className="h-9 gap-1.5 rounded-xl bg-violet-700 px-4 text-xs hover:bg-violet-800">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Run locally</Button></div></div>{answer && <div className="mt-5 rounded-2xl border border-violet-100/90 bg-violet-50/45 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Check className="size-4 text-violet-700" /><p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Local response</p></div><Button type="button" variant="ghost" onClick={() => void copyAnswer()} className="h-8 gap-1.5 rounded-lg px-2 text-xs text-violet-800">{copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />} {copied ? "Copied" : "Copy"}</Button></div><div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{answer}</div></div>}</section>
        </section>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 text-amber-700"><Smartphone className="size-5" /></div><div><p className="eyebrow">Android setup</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Run the model on your phone</h2></div></div><div className="mt-4 grid gap-3 text-xs leading-5 text-slate-600 md:grid-cols-3"><div className="rounded-xl border border-white/80 bg-white/45 p-3"><p className="font-semibold text-slate-800">1. Install a local server</p><p className="mt-1">Use an Android app that exposes an OpenAI-compatible API, or run llama.cpp/Ollama through Termux. The phone and browser must use the same device.</p></div><div className="rounded-xl border border-white/80 bg-white/45 p-3"><p className="font-semibold text-slate-800">2. Enable browser access</p><p className="mt-1">Allow CORS for this app origin and keep the server bound to localhost. If the server does not support CORS, the browser cannot call it safely.</p></div><div className="rounded-xl border border-white/80 bg-white/45 p-3"><p className="font-semibold text-slate-800">3. Select a small model</p><p className="mt-1">Start with a 3B–4B quantized model such as the one your local server reports. Larger models may be slow or exceed phone memory.</p></div></div><p className="mt-4 text-[0.68rem] text-slate-400">If the page says Offline, first test the endpoint in the phone browser. A hosted HTTPS app cannot call an arbitrary remote HTTP server without the server allowing CORS and the browser permitting the connection.</p></section>
      </div>
    </main>
  );
}
