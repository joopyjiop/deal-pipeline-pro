import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useAction } from "convex/react";
import {
  ArrowLeft,
  Bot,
  Calculator,
  Check,
  ExternalLink,
  FileSearch,
  Globe2,
  ListChecks,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type ToolAccess = {
  scraperEnabled: boolean;
  estimatorEnabled: boolean;
  aiEnabled: boolean;
};

type AutomationConfig = {
  enabled: boolean;
  mode: "DETERMINISTIC" | "BOTH";
  dailyRunLimit: number;
  maxTasksPerRun: number;
  runsToday: number;
  aiEnabled: boolean;
  providerConfigured: boolean;
  n8nSecretConfigured: boolean;
};

type AutomationTask = {
  _id: string;
  kind: "SCRAPE" | "ESTIMATE";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  error?: string;
  createdAt?: string | number;
  result?: unknown;
};

type ScrapeResult = {
  stagedId: string;
  url: string;
  title: string;
  excerpt: string;
  links: string[];
  contentType: string;
  fetchedAt: string;
  piiCreated: boolean;
};

type EstimateResult = {
  estimateStatus: "READY" | "NEEDS_APPRAISAL";
  compCount: number;
  compMedian?: number;
  arv?: { conservative: number; median: number; aggressive: number };
  repairs: { subtotal: number; contingency: number; total: number; ratePerSquareFoot: number };
  mao?: { conservative: number; median: number; aggressive: number };
  estimatedProfit?: number;
};

const sourceTypes = [
  ["SHERIFF_SALE", "Sheriff sale"],
  ["TAX_SALE", "Tax sale"],
  ["AUCTION_COM", "Auction.com public listing"],
  ["PROBATE", "Probate / court record"],
  ["OFF_MARKET", "Off-market evidence"],
  ["ASSESSOR", "Assessor"],
  ["RECORDER", "Recorder"],
  ["MANUAL", "Manual source"],
] as const;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function money(value: number | undefined) {
  return value === undefined ? "—" : currency.format(value);
}

function pretty(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function Toolkit() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isOwner = Boolean(
    user &&
      (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com"),
  );
  const getToolAccess = useAction(api.mongodb.getToolAccess);
  const setToolAccess = useAction(api.mongodb.setToolAccess);
  const getAiToolManifest = useAction(api.mongodb.getAiToolManifest);
  const getAutomationConfig = useAction(api.mongodb.getAutomationConfig);
  const setAutomationConfig = useAction(api.mongodb.setAutomationConfig);
  const enqueueAutomationTask = useAction(api.mongodb.enqueueAutomationTask);
  const listAutomationTasks = useAction(api.mongodb.listAutomationTasks);
  const runAutomationNow = useAction(api.mongodb.runAutomationNow);
  const scrapeSource = useAction(api.mongodb.scrapeSource);
  const qualifyStagedSource = useAction(api.mongodb.qualifyStagedSource);
  const estimateDeal = useAction(api.mongodb.estimateDeal);

  const [access, setAccess] = useState<ToolAccess>({ scraperEnabled: true, estimatorEnabled: true, aiEnabled: false });
  const [automation, setAutomation] = useState<AutomationConfig>({ enabled: false, mode: "BOTH", dailyRunLimit: 24, maxTasksPerRun: 5, runsToday: 0, aiEnabled: false, providerConfigured: false, n8nSecretConfigured: false });
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [manifest, setManifest] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);
  const [queueUrl, setQueueUrl] = useState("");
  const [scrapeForm, setScrapeForm] = useState({ url: "", sourceType: "SHERIFF_SALE" as (typeof sourceTypes)[number][0] });
  const [estimateForm, setEstimateForm] = useState({
    squareFeet: "1500",
    yearBuilt: "",
    repairTier: "MEDIUM" as "BASE" | "MEDIUM" | "GUT",
    soldComps: "",
    compSourceUrl: "",
    compSourceDate: new Date().toISOString().slice(0, 10),
    targetPct: "70",
    wholesaleFee: "10000",
    closingCosts: "5000",
    holdingCosts: "5000",
    acquisitionPrice: "",
  });

  const loadAccess = async () => {
    setLoading(true);
    try {
      const [accessResult, manifestResult, automationResult, taskResult] = await Promise.all([
        getToolAccess(),
        getAiToolManifest(),
        getAutomationConfig(),
        listAutomationTasks({}),
      ]);
      setAccess(accessResult as ToolAccess);
      setManifest(manifestResult);
      setAutomation(automationResult as AutomationConfig);
      setTasks(taskResult as AutomationTask[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load tool access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    Promise.all([getToolAccess(), getAiToolManifest(), getAutomationConfig(), listAutomationTasks({})])
      .then(([accessResult, manifestResult, automationResult, taskResult]) => {
        if (cancelled) return;
        setAccess(accessResult as ToolAccess);
        setManifest(manifestResult);
        setAutomation(automationResult as AutomationConfig);
        setTasks(taskResult as AutomationTask[]);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load tool access.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getAiToolManifest, getAutomationConfig, getToolAccess, isOwner, listAutomationTasks]);

  const updateTool = async (tool: "SCRAPER" | "ESTIMATOR", enabled: boolean) => {
    try {
      const result = await setToolAccess({ tool, enabled });
      setAccess((current) => ({
        ...current,
        [tool === "SCRAPER" ? "scraperEnabled" : "estimatorEnabled"]: result.enabled,
      }));
      setManifest(await getAiToolManifest());
      toast.success(`${pretty(tool)} tool ${enabled ? "enabled" : "disabled"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update tool access.");
    }
  };

  const updateAiAccess = async (enabled: boolean) => {
    try {
      await setToolAccess({ tool: "SCRAPER", enabled: access.scraperEnabled, aiEnabled: enabled });
      setAccess((current) => ({ ...current, aiEnabled: enabled }));
      setManifest(await getAiToolManifest());
      toast.success(enabled ? "AI tool access enabled." : "AI tool access disabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update AI access.");
    }
  };

  const saveAutomation = async () => {
    try {
      const result = await setAutomationConfig({
        enabled: automation.enabled,
        mode: automation.mode,
        dailyRunLimit: automation.dailyRunLimit,
        maxTasksPerRun: automation.maxTasksPerRun,
      });
      setAutomation((current) => ({ ...current, ...result }));
      toast.success(automation.enabled ? "Managed automation enabled." : "Managed automation paused.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save automation settings.");
    }
  };

  const queueScrape = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await enqueueAutomationTask({ task: { kind: "SCRAPE", url: queueUrl, sourceType: scrapeForm.sourceType } });
      setQueueUrl("");
      setTasks((await listAutomationTasks({ status: "PENDING" })) as AutomationTask[]);
      toast.success("Source added to the managed automation queue.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue this source.");
    }
  };

  const runCycle = async () => {
    try {
      const result = await runAutomationNow();
      setTasks((await listAutomationTasks({})) as AutomationTask[]);
      setAutomation((await getAutomationConfig()) as AutomationConfig);
      toast.success(`Automation cycle finished: ${JSON.stringify(result)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run the automation cycle.");
    }
  };

  const handleScrape = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setScraping(true);
    try {
      const result = await scrapeSource(scrapeForm) as ScrapeResult;
      setScrapeResult(result);
      const qualification = await qualifyStagedSource({ stagedId: result.stagedId }) as { status: string; reason?: string };
      if (qualification.status === "CANDIDATE_CREATED") {
        toast.success("Source fetched and turned into a review candidate.");
      } else if (qualification.status === "REJECTED") {
        toast.warning(`Source staged, but no candidate was created: ${qualification.reason ?? "missing structured fields"}.`);
      } else {
        toast.success("Source fetched and staged for owner review.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not fetch this source.");
    } finally {
      setScraping(false);
    }
  };

  const handleEstimate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEstimating(true);
    try {
      const compPrices = estimateForm.soldComps
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
      const result = await estimateDeal({
        squareFeet: Number(estimateForm.squareFeet),
        yearBuilt: estimateForm.yearBuilt ? Number(estimateForm.yearBuilt) : undefined,
        repairTier: estimateForm.repairTier,
        soldComps: compPrices.map((salePrice) => ({ salePrice })),
        compSourceUrl: estimateForm.compSourceUrl || undefined,
        compSourceDate: estimateForm.compSourceDate || undefined,
        targetPct: Number(estimateForm.targetPct),
        wholesaleFee: Number(estimateForm.wholesaleFee),
        closingCosts: Number(estimateForm.closingCosts),
        holdingCosts: Number(estimateForm.holdingCosts),
        acquisitionPrice: estimateForm.acquisitionPrice ? Number(estimateForm.acquisitionPrice) : undefined,
      }) as EstimateResult;
      setEstimateResult(result);
      toast.success(result.estimateStatus === "READY" ? "Underwriting estimate calculated." : "Estimate needs appraisal comps.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not calculate this estimate.");
    } finally {
      setEstimating(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (!isOwner) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <div className="glass-panel-strong max-w-md rounded-[2rem] p-8">
          <ShieldCheck className="mx-auto size-10 text-sky-700" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Owner toolkit only</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Scraping sources and underwriting deals are private owner operations.</p>
          <Link to="/dashboard" className="mt-6 inline-flex rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white">Back to leads</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-4 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/operations" className="flex size-9 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-600 transition-colors hover:text-sky-700" aria-label="Back to operations"><ArrowLeft className="size-4" /></Link>
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/75 text-sky-700 shadow-sm"><Wrench className="size-4" /></div>
            <div><p className="eyebrow">Owner controls</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Source & underwriting toolkit</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void loadAccess()} className="gap-2 rounded-xl border-white/85 bg-white/60 text-slate-700"><RefreshCw className="size-4" /> Refresh</Button>
            <button type="button" onClick={handleSignOut} className="flex size-10 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-500 hover:text-slate-800" aria-label="Sign out"><LogOut className="size-4" /></button>
          </div>
        </header>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Scraper</p><Globe2 className="size-4 text-sky-600" /></div><div className="mt-3 flex items-center justify-between"><p className="text-lg font-semibold text-slate-900">{access.scraperEnabled ? "Enabled" : "Disabled"}</p><button type="button" role="switch" aria-checked={access.scraperEnabled} onClick={() => void updateTool("SCRAPER", !access.scraperEnabled)} className={`relative h-6 w-11 rounded-full transition-colors ${access.scraperEnabled ? "bg-sky-700" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${access.scraperEnabled ? "translate-x-6" : "translate-x-1"}`} /></button></div><p className="mt-1 text-xs text-slate-500">Public evidence URLs only</p></div>
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Estimator</p><Calculator className="size-4 text-teal-600" /></div><div className="mt-3 flex items-center justify-between"><p className="text-lg font-semibold text-slate-900">{access.estimatorEnabled ? "Enabled" : "Disabled"}</p><button type="button" role="switch" aria-checked={access.estimatorEnabled} onClick={() => void updateTool("ESTIMATOR", !access.estimatorEnabled)} className={`relative h-6 w-11 rounded-full transition-colors ${access.estimatorEnabled ? "bg-teal-700" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${access.estimatorEnabled ? "translate-x-6" : "translate-x-1"}`} /></button></div><p className="mt-1 text-xs text-slate-500">Explicit inputs, no invented comps</p></div>
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">AI access</p><Bot className="size-4 text-violet-600" /></div><div className="mt-3 flex items-center justify-between"><p className="text-lg font-semibold text-slate-900">{access.aiEnabled ? "Granted" : "Owner only"}</p><button type="button" role="switch" aria-checked={access.aiEnabled} onClick={() => void updateAiAccess(!access.aiEnabled)} className={`relative h-6 w-11 rounded-full transition-colors ${access.aiEnabled ? "bg-violet-700" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${access.aiEnabled ? "translate-x-6" : "translate-x-1"}`} /></button></div><p className="mt-1 text-xs text-slate-500">Manifest is ready for an authenticated AI connector</p></div>
        </section>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 text-amber-700"><ListChecks className="size-5" /></div><div><p className="eyebrow">Managed automation</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Queue work for both modes</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Convex runs the schedule, MongoDB stores the queue and results, and the temporary AI reviewer only adds bounded review suggestions. Auction.com, probate/court records, and owner-provided off-market evidence are supported; login, CAPTCHA, and blocked requests are never bypassed. The hourly cycle stays paused until you enable it.</p></div></div>
            <Badge className={automation.enabled ? "border-0 bg-teal-100/80 text-teal-800" : "border-0 bg-slate-100/80 text-slate-600"}>{automation.enabled ? "Running when queued" : "Paused"}</Badge>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-3 rounded-2xl border border-white/80 bg-white/45 p-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Run mode</span><select value={automation.mode} onChange={(event) => setAutomation((current) => ({ ...current, mode: event.target.value as AutomationConfig["mode"] }))} className="h-10 rounded-xl border border-white/85 bg-white/70 px-3 text-sm text-slate-700 outline-none"><option value="BOTH">Deterministic + temporary AI</option><option value="DETERMINISTIC">Deterministic only</option></select></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Daily cycle limit</span><Input min="1" max="1000" type="number" value={automation.dailyRunLimit} onChange={(event) => setAutomation((current) => ({ ...current, dailyRunLimit: Number(event.target.value) }))} className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Tasks per cycle</span><Input min="1" max="20" type="number" value={automation.maxTasksPerRun} onChange={(event) => setAutomation((current) => ({ ...current, maxTasksPerRun: Number(event.target.value) }))} className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <div className="flex items-end gap-2"><Button type="button" onClick={() => void saveAutomation()} className="h-10 flex-1 rounded-xl bg-amber-700 text-xs hover:bg-amber-800">{automation.enabled ? "Save & keep enabled" : "Save settings"}</Button><Button type="button" variant="outline" onClick={() => setAutomation((current) => ({ ...current, enabled: !current.enabled }))} className="h-10 rounded-xl border-white/85 bg-white/65 text-xs">{automation.enabled ? "Pause" : "Enable"}</Button></div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/45 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">Temporary AI reviewer</p><p className="mt-1 text-xs text-slate-500">{automation.providerConfigured ? "Provider key is configured." : "Add SAMBANOVA_API_KEY in Environment vars to activate AI review."}</p></div><Badge className={automation.providerConfigured && access.aiEnabled ? "border-0 bg-violet-100/80 text-violet-800" : "border-0 bg-slate-100/80 text-slate-500"}>{automation.providerConfigured && access.aiEnabled ? "Available" : "Waiting"}</Badge></div><p className="mt-4 text-[0.68rem] leading-5 text-slate-500">AI output is saved as a review suggestion in staging. It cannot approve leads, create fabricated PII, or bypass owner review.</p></div>
          </div>
          <form onSubmit={queueScrape} className="mt-3 flex flex-col gap-2 sm:flex-row"><Input required type="url" value={queueUrl} onChange={(event) => setQueueUrl(event.target.value)} placeholder="Queue an official public source URL for the next cycle" className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /><Button type="submit" disabled={!automation.enabled} className="h-10 gap-2 rounded-xl bg-sky-700 text-xs hover:bg-sky-800"><ListChecks className="size-4" /> Queue source</Button><Button type="button" disabled={!automation.enabled} onClick={() => void runCycle()} variant="outline" className="h-10 gap-2 rounded-xl border-white/85 bg-white/65 text-xs"><Play className="size-4" /> Run now</Button></form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-[0.68rem] text-slate-500">Today: {automation.runsToday} / {automation.dailyRunLimit} cycles · {tasks.filter((task) => task.status === "PENDING").length} pending tasks</p><div className="flex flex-wrap gap-2">{tasks.slice(0, 5).map((task) => <Badge key={task._id} variant="outline" className="border-white/90 bg-white/55 text-[0.65rem] text-slate-600">{task.kind} · {task.status}</Badge>)}</div></div>
          <div className="mt-4 rounded-2xl border border-sky-100/80 bg-sky-50/45 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">n8n scheduler handoff</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">n8n can schedule source URLs and retry this queue endpoint. Convex still validates the URL, fetches bounded evidence, writes Mongo staging, and keeps every candidate in owner review.</p></div><Badge className={automation.n8nSecretConfigured ? "border-0 bg-teal-100/80 text-teal-800" : "border-0 bg-amber-100/80 text-amber-800"}>{automation.n8nSecretConfigured ? "Connected" : "Needs secret"}</Badge></div><div className="mt-3 grid gap-2 text-[0.68rem] leading-5 text-slate-500 sm:grid-cols-3"><p><strong className="text-slate-700">Endpoint</strong><br />your Convex site URL + <code>/api/n8n/source</code></p><p><strong className="text-slate-700">Header</strong><br /><code>x-convex-n8n-secret</code></p><p><strong className="text-slate-700">Body</strong><br /><code>{"{ url, sourceType, idempotencyKey? }"}</code></p></div><p className="mt-3 text-[0.68rem] text-slate-500">Add <code>CONVEX_N8N_WEBHOOK_SECRET</code> in the Convex Environment vars panel, then store the same value as an n8n secret. Do not put it in browser code.</p></div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="glass-panel rounded-[1.75rem] p-5 sm:p-6">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700"><FileSearch className="size-5" /></div><div><p className="eyebrow">Source scraper</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Fetch evidence for review</h2><p className="mt-1 text-xs leading-5 text-slate-500">Fetches a bounded preview from a public evidence page and stages it in MongoDB. Probate and off-market pages still need an explicit address, location, county, date, and reference before becoming a candidate. It never turns page text into a lead or invents PII.</p></div></div>
            <form onSubmit={handleScrape} className="mt-5 grid gap-3">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Public source URL</span><Input required type="url" value={scrapeForm.url} onChange={(event) => setScrapeForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://county.gov/official-sale-list" className="h-11 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Source type</span><select value={scrapeForm.sourceType} onChange={(event) => setScrapeForm((current) => ({ ...current, sourceType: event.target.value as (typeof sourceTypes)[number][0] }))} className="h-11 rounded-xl border border-white/85 bg-white/70 px-3 text-sm text-slate-700 outline-none">{sourceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <Button disabled={scraping || !access.scraperEnabled} type="submit" className="mt-1 h-11 gap-2 rounded-xl bg-sky-700 text-sm hover:bg-sky-800">{scraping ? <Loader2 className="size-4 animate-spin" /> : <Globe2 className="size-4" />} {scraping ? "Fetching source…" : "Fetch & stage source"}</Button>
            </form>
            {scrapeResult && <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/60 p-4"><div className="flex items-start justify-between gap-3"><div><Badge className="border-0 bg-teal-100/80 text-teal-800">Staged · no PII created</Badge><h3 className="mt-3 text-sm font-semibold text-slate-800">{scrapeResult.title}</h3></div><a href={scrapeResult.url} target="_blank" rel="noreferrer" className="text-sky-700" aria-label="Open source"><ExternalLink className="size-4" /></a></div><p className="mt-2 text-xs leading-5 text-slate-600">{scrapeResult.excerpt || "No readable text preview returned."}</p><p className="mt-3 text-[0.68rem] text-slate-400">Fetched {new Date(scrapeResult.fetchedAt).toLocaleString()} · {scrapeResult.contentType}</p></div>}
          </section>

          <section className="glass-panel rounded-[1.75rem] p-5 sm:p-6">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-100/80 text-teal-700"><Calculator className="size-5" /></div><div><p className="eyebrow">Deal estimator</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Underwrite from sourced numbers</h2><p className="mt-1 text-xs leading-5 text-slate-500">ARV comes from the sold comp median. No comps means <strong>NEEDS APPRAISAL</strong>, never a fabricated value.</p></div></div>
            <form onSubmit={handleEstimate} className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Square feet</span><Input required min="1" type="number" value={estimateForm.squareFeet} onChange={(event) => setEstimateForm((current) => ({ ...current, squareFeet: event.target.value }))} className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Year built <span className="font-normal text-slate-400">(optional)</span></span><Input type="number" value={estimateForm.yearBuilt} onChange={(event) => setEstimateForm((current) => ({ ...current, yearBuilt: event.target.value }))} placeholder="1985" className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Repair tier</span><select value={estimateForm.repairTier} onChange={(event) => setEstimateForm((current) => ({ ...current, repairTier: event.target.value as typeof current.repairTier }))} className="h-10 rounded-xl border border-white/85 bg-white/70 px-3 text-sm text-slate-700 outline-none"><option value="BASE">Base · $15/SF</option><option value="MEDIUM">Medium · $30/SF</option><option value="GUT">Gut · $50/SF</option></select></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Sold comp prices</span><Input value={estimateForm.soldComps} onChange={(event) => setEstimateForm((current) => ({ ...current, soldComps: event.target.value }))} placeholder="145000, 152000, 160000" className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-2"><span>Comp source URL <span className="font-normal text-slate-400">(required when comps are entered)</span></span><Input type="url" value={estimateForm.compSourceUrl} onChange={(event) => setEstimateForm((current) => ({ ...current, compSourceUrl: event.target.value }))} placeholder="https://recorder.example.gov/comps" className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Target percentage</span><Input required min="1" max="100" type="number" value={estimateForm.targetPct} onChange={(event) => setEstimateForm((current) => ({ ...current, targetPct: event.target.value }))} className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Acquisition / contract price</span><Input min="0" type="number" value={estimateForm.acquisitionPrice} onChange={(event) => setEstimateForm((current) => ({ ...current, acquisitionPrice: event.target.value }))} placeholder="Optional" className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <div className="grid grid-cols-3 gap-2 sm:col-span-2"><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Wholesale fee</span><Input min="0" type="number" value={estimateForm.wholesaleFee} onChange={(event) => setEstimateForm((current) => ({ ...current, wholesaleFee: event.target.value }))} className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Closing</span><Input min="0" type="number" value={estimateForm.closingCosts} onChange={(event) => setEstimateForm((current) => ({ ...current, closingCosts: event.target.value }))} className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Holding</span><Input min="0" type="number" value={estimateForm.holdingCosts} onChange={(event) => setEstimateForm((current) => ({ ...current, holdingCosts: event.target.value }))} className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label></div>
              <Button disabled={estimating || !access.estimatorEnabled} type="submit" className="h-11 gap-2 rounded-xl bg-teal-700 text-sm hover:bg-teal-800 sm:col-span-2">{estimating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {estimating ? "Calculating…" : "Calculate estimate"}</Button>
            </form>
            {estimateResult && <div className="mt-5 rounded-2xl border border-teal-100 bg-teal-50/55 p-4"><div className="flex items-center justify-between gap-3"><div><Badge className={estimateResult.estimateStatus === "READY" ? "border-0 bg-teal-100/80 text-teal-800" : "border-0 bg-amber-100/80 text-amber-800"}>{pretty(estimateResult.estimateStatus)}</Badge><p className="mt-2 text-xs text-slate-500">{estimateResult.compCount} sourced comp{estimateResult.compCount === 1 ? "" : "s"} · repairs {money(estimateResult.repairs.total)}</p></div><p className="text-right text-xl font-semibold text-teal-800">{money(estimateResult.estimatedProfit)}<span className="block text-[0.65rem] font-medium text-slate-500">estimated gross spread</span></p></div>{estimateResult.arv && estimateResult.mao && <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="glass-inset rounded-xl p-3"><p className="text-slate-400">Conservative ARV</p><p className="mt-1 font-semibold text-slate-700">{money(estimateResult.arv.conservative)}</p><p className="mt-2 text-slate-400">MAO {money(estimateResult.mao.conservative)}</p></div><div className="glass-inset rounded-xl border-teal-200/70 bg-white/55 p-3"><p className="text-slate-400">Median ARV</p><p className="mt-1 font-semibold text-slate-800">{money(estimateResult.arv.median)}</p><p className="mt-2 text-slate-400">MAO {money(estimateResult.mao.median)}</p></div><div className="glass-inset rounded-xl p-3"><p className="text-slate-400">Aggressive ARV</p><p className="mt-1 font-semibold text-slate-700">{money(estimateResult.arv.aggressive)}</p><p className="mt-2 text-slate-400">MAO {money(estimateResult.mao.aggressive)}</p></div></div>}</div>}
          </section>
        </div>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100/80 text-violet-700"><Bot className="size-5" /></div><div className="min-w-0 flex-1"><p className="eyebrow">AI connector handoff</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Controlled tool manifest</h2><p className="mt-1 text-xs leading-5 text-slate-500">This is the permission contract for a future authenticated AI connector. It does not expose Mongo credentials and it cannot bypass owner checks.</p></div><Badge className="border-0 bg-violet-100/80 text-violet-800">{loading ? "Loading" : access.aiEnabled ? "Enabled" : "Owner only"}</Badge></div><pre className="mt-4 max-h-72 overflow-auto rounded-2xl border border-white/80 bg-white/55 p-4 text-[0.7rem] leading-5 text-slate-600">{manifest ? JSON.stringify(manifest, null, 2) : "Manifest unavailable until tool access loads."}</pre><div className="mt-4 flex items-start gap-2 text-xs text-slate-500"><Check className="mt-0.5 size-3.5 shrink-0 text-teal-600" /><p>The scraper only accepts public HTTP(S) URLs, stores evidence in import staging, and reports no fabricated PII. The estimator only calculates from explicit numbers and reports when appraisal data is missing.</p></div></section>
        <p className="pb-5 pt-5 text-center text-xs text-slate-500">MongoDB is the source of truth for staged sources and saved underwriting. These actions are owner-only and refresh on demand.</p>
      </div>
    </main>
  );
}
