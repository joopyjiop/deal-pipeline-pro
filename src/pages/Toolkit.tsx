import { api } from "@/convex/_generated/api";
import { CONVEX_SITE_URL } from "@/lib/convex-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useAction } from "convex/react";
import {
  ArrowLeft,
  Bot,
  Calculator,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  FileSearch,
  Globe2,
  Home,
  Link2,
  MapPin,
  ListChecks,
  Landmark,
  Loader2,
  LogOut,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
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

type MongoHealth = {
  configured: boolean;
  connected: boolean;
  status: string;
  fallbackConfigured?: boolean;
  fallbackHost?: string | null;
  usingFallback?: boolean;
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

type SgResult = {
  stagedId: string;
  provider: "scrapegraph";
  url: string;
  json: Record<string, unknown> | null;
  usage?: { promptTokens: number; completionTokens: number };
  excerpt: string;
  piiCreated: boolean;
};

type RentcastResult = {
  provider: "rentcast";
  address: string;
  property: {
    id: string;
    formattedAddress?: string;
    propertyType?: string;
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    yearBuilt?: number;
    county?: string;
  } | null;
  rentEstimate: { rent?: number; rentRangeLow?: number; rentRangeHigh?: number } | null;
  comps: { radiusMiles: number; saleDateRangeDays: number; soldPrices: number[] };
  summary: {
    squareFeet?: number;
    yearBuilt?: number;
    bedrooms?: number;
    bathrooms?: number;
    annualPropertyTax?: number;
    rentPerMonth?: number;
    rentRangeLow?: number;
    rentRangeHigh?: number;
    soldCompsCount: number;
    soldComps: number[];
  };
};

type SitemapResult = {
  provider: "sitemap";
  seeds: string[];
  maxUrls: number;
  truncated: boolean;
  sitemapsUsed: string[];
  discovered: Array<{ seed: string; url: string }>;
  staged: Array<{ url: string; stagedId: string; qualification: { status: string; reason?: string; leadId?: string } }>;
  stagingFailed: Array<{ url: string; error: string }>;
  errors: Array<{ url: string; error: string }>;
};

type CrawlResult = {
  provider?: "camofox" | "firecrawl";
  requested: string[];
  maxPages: number;
  pages: Array<{
    url: string;
    finalUrl: string;
    snapshot: string;
    truncated: boolean;
    refsCount: number;
    discoveredLinks: string[];
  }>;
  failed: Array<{ url: string; error: string }>;
  discoveredLinks: string[];
  queuedButNotVisited: string[];
  staged?: Array<{
    url: string;
    stagedId: string;
    qualification: { status: string; reason?: string; leadId?: string };
  }>;
  stagingFailed?: Array<{ url: string; error: string }>;
};

type DefaultDealSource = {
  id: string;
  name: string;
  domain: string;
  description: string;
  urls: string[];
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

type DataGap = { category: string; detail: string; blocksReady: boolean };

type AgentReport = {
  agent: string;
  status: "COMPLETED" | "BLOCKED";
  summary: string;
  findings: string[];
  dataGaps: DataGap[];
};

type ReadinessReport = {
  ready: boolean;
  status: "READY" | "INCOMPLETE";
  gaps: DataGap[];
  categories: Record<string, "FOUND" | "MISSING">;
  ranAt: number;
};

type ScoredBuyerMatch = {
  buyerId: string;
  matchScore: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  components: { area: number; budget: number; exit: number; pofBoost: number };
  summary: string;
  rejectReason?: string;
};

type TeamLead = { _id: string; propertyAddress: string; city: string; state: string };

type PipelineBrief = {
  total: number;
  readyCount: number;
  incompleteCount: number;
  notRunCount: number;
  leads: Array<{
    _id: string;
    propertyAddress: string;
    city: string;
    state: string;
    sourceType: string;
    readinessStatus: string;
    ready: boolean;
    gapCount: number;
  }>;
};

type PropertyBrief = {
  leadId: string;
  address: string;
  stored: {
    squareFeet?: number;
    yearBuilt?: number;
    acquisitionPrice?: number;
    mao?: number;
    parcelId?: string;
    sourceRef?: string;
    sourceType?: string;
    pipelineStatus: string;
    verificationStatus: string;
    distressScore?: number;
    dueDiligence?: Record<string, { status?: string; sourceUrl?: string; summary?: string; checkedAt?: number }>;
  };
  rentcast: null | {
    address: string;
    matched: boolean;
    squareFeet?: number;
    yearBuilt?: number;
    rentPerMonth?: number;
    rentRangeLow?: number;
    rentRangeHigh?: number;
    annualPropertyTax?: number;
    soldCompsCount: number;
  };
  prefill: {
    purchasePrice?: number;
    rentComps: number[];
    squareFeet?: number;
    annualPropertyTax?: number;
    compPrices: number[];
  };
};

const DD_CATEGORIES = [
  { key: "TITLE_AND_LIENS", label: "Title status & liens", hint: "Assessor/recorder: current ownership, tax status, recorded liens." },
  { key: "SALE_HISTORY", label: "Sale history & comparables", hint: "Past sales and 3-5 nearby comps. RentCast auto-records this when comps match." },
  { key: "CONDITION", label: "Property condition", hint: "Listing photos, inspection, or condition report; flag unknown rather than guess." },
  { key: "OCCUPANCY", label: "Occupancy", hint: "Vacant, owner-occupied, or tenant-occupied. Not blocking." },
] as const;

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

// Built-in, owner-reviewed starting points. Add another site here only after
// confirming its public pages and crawl permissions; custom URLs remain
// available below for sources that are not part of the default registry.
const defaultDealSources: DefaultDealSource[] = [
  {
    id: "auction-com",
    name: "Auction.com",
    domain: "auction.com",
    description: "Public foreclosure and auction catalog",
    urls: ["https://www.auction.com/", "https://www.auction.com/residential/"],
  },
];

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

const mcpEndpoint = `${CONVEX_SITE_URL.replace(/\/$/, "")}/api/mcp`;

export default function Toolkit() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isOwner = Boolean(
    user &&
      (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com"),
  );
  const getToolAccess = useAction(api.mongodb.getToolAccess);
  const healthCheck = useAction(api.mongodb.healthCheck);
  const setMongoUriFallback = useAction(api.mongodb.setMongoUriFallback);
  const clearMongoUriFallback = useAction(api.mongodb.clearMongoUriFallback);
  const setToolAccess = useAction(api.mongodb.setToolAccess);
  const getAiToolManifest = useAction(api.mongodb.getAiToolManifest);
  const getAutomationConfig = useAction(api.mongodb.getAutomationConfig);
  const setAutomationConfig = useAction(api.mongodb.setAutomationConfig);
  const enqueueAutomationTask = useAction(api.mongodb.enqueueAutomationTask);
  const queueAllenCountySources = useAction(api.mongodb.queueAllenCountySources);
  const listAutomationTasks = useAction(api.mongodb.listAutomationTasks);
  const runAutomationNow = useAction(api.mongodb.runAutomationNow);
  const scrapeSource = useAction(api.mongodb.scrapeSource);
  const stageCamofoxEvidence = useAction(api.mongodb.stageCamofoxEvidence);
  const crawlWithCamofox = useAction(api.camofox.camofoxCrawl);
  const crawlWithFirecrawl = useAction(api.mongodb.firecrawlCrawl);
  const qualifyStagedSource = useAction(api.mongodb.qualifyStagedSource);
  const estimateDeal = useAction(api.mongodb.estimateDeal);
  const runAgentTeamAction = useAction(api.mongodb.runAgentTeam);
  const getAgentTeamAction = useAction(api.mongodb.getAgentTeam);
  const runBuyerMatchesAction = useAction(api.mongodb.runBuyerMatches);
  const listPipelineBriefAction = useAction(api.mongodb.listPipelineBrief);
  const queueOffMarket = useAction(api.mongodb.queueOffMarketSources);
  const scrapegraphExtractAction = useAction(api.mongodb.scrapegraphExtractSource);
  const sitemapDiscoverAction = useAction(api.mongodb.sitemapDiscover);
  const rentcastPropertyDataAction = useAction(api.mongodb.rentcastPropertyData);
  const rentcastUnderwriteAction = useAction(api.mongodb.rentcastUnderwrite);
  const loadPropertyBriefAction = useAction(api.mongodb.loadPropertyBrief);
  const updateDueDiligenceAction = useAction(api.mongodb.updateDueDiligence);
  const listLeadsAction = useAction(api.mongodb.listLeads);

  const [access, setAccess] = useState<ToolAccess>({ scraperEnabled: true, estimatorEnabled: true, aiEnabled: false });
  const [automation, setAutomation] = useState<AutomationConfig>({ enabled: false, mode: "BOTH", dailyRunLimit: 24, maxTasksPerRun: 5, runsToday: 0, aiEnabled: false, providerConfigured: false, n8nSecretConfigured: false });
  const [mongoHealth, setMongoHealth] = useState<MongoHealth>({ configured: false, connected: false, status: "Not checked" });
  const [mongoUriInput, setMongoUriInput] = useState("");
  const [savingMongoUri, setSavingMongoUri] = useState(false);
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [manifest, setManifest] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [crawlUrls, setCrawlUrls] = useState("");
  const [crawlMaxPages, setCrawlMaxPages] = useState("8");
  const [crawlDiscoverLinks, setCrawlDiscoverLinks] = useState(true);
  const [selectedDefaultSourceIds, setSelectedDefaultSourceIds] = useState<string[]>(["auction-com"]);
  const [crawlSameOrigin, setCrawlSameOrigin] = useState(true);
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);
  const [copiedMcpField, setCopiedMcpField] = useState<string | null>(null);
  const [queueUrl, setQueueUrl] = useState("");
  const [scrapeForm, setScrapeForm] = useState({ url: "", sourceType: "SHERIFF_SALE" as (typeof sourceTypes)[number][0] });
  const [sgForm, setSgForm] = useState({ url: "", sourceType: "SHERIFF_SALE" as (typeof sourceTypes)[number][0], prompt: "" });
  const [sgRunning, setSgRunning] = useState(false);
  const [sgResult, setSgResult] = useState<SgResult | null>(null);
  const [smForm, setSmForm] = useState({ url: "", sourceType: "AUCTION_COM" as (typeof sourceTypes)[number][0], maxUrls: "60" });
  const [smRunning, setSmRunning] = useState(false);
  const [smResult, setSmResult] = useState<SitemapResult | null>(null);
  const [rcForm, setRcForm] = useState({ address: "", radius: "3", saleDateRange: "365" });
  const [rcRunning, setRcRunning] = useState(false);
  const [rcResult, setRcResult] = useState<RentcastResult | null>(null);
  const [rcUnderwriting, setRcUnderwriting] = useState(false);
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
  const [teamLeads, setTeamLeads] = useState<Array<{ _id: string; propertyAddress: string; city: string; state: string }>>([]);
  const [teamLeadId, setTeamLeadId] = useState("");
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [teamRental, setTeamRental] = useState({ purchasePrice: "", rentComps: "", annualPropertyTax: "", annualInsurance: "", loanAmount: "", interestRatePct: "", loanTermYears: "", squareFeet: "", compPrices: "", repairTier: "MEDIUM" as "BASE" | "MEDIUM" | "GUT" });
  const [teamRunning, setTeamRunning] = useState(false);
  const [teamReports, setTeamReports] = useState<AgentReport[] | null>(null);
  const [teamReadiness, setTeamReadiness] = useState<ReadinessReport | null>(null);
  const [matching, setMatching] = useState(false);
  const [teamMatches, setTeamMatches] = useState<ScoredBuyerMatch[] | null>(null);
  const [brief, setBrief] = useState<PipelineBrief | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [loadingPropBrief, setLoadingPropBrief] = useState(false);
  const [briefNote, setBriefNote] = useState<string | null>(null);
  const [propBrief, setPropBrief] = useState<PropertyBrief | null>(null);
  const [ddDrafts, setDdDrafts] = useState<Record<string, { sourceUrl: string; summary: string }>>({});
  const [savingDd, setSavingDd] = useState<string | null>(null);

  const loadAccess = async () => {
    setLoading(true);
    try {
      const [accessResult, manifestResult, automationResult, taskResult, mongoResult] = await Promise.all([
        getToolAccess(),
        getAiToolManifest(),
        getAutomationConfig(),
        listAutomationTasks({}),
        healthCheck(),
      ]);
      setAccess(accessResult as ToolAccess);
      setManifest(manifestResult);
      setAutomation(automationResult as AutomationConfig);
      setTasks(taskResult as AutomationTask[]);
      setMongoHealth(mongoResult as MongoHealth);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load tool access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    Promise.all([getToolAccess(), getAiToolManifest(), getAutomationConfig(), listAutomationTasks({}), healthCheck()])
      .then(([accessResult, manifestResult, automationResult, taskResult, mongoResult]) => {
        if (cancelled) return;
        setAccess(accessResult as ToolAccess);
        setManifest(manifestResult);
        setAutomation(automationResult as AutomationConfig);
        setTasks(taskResult as AutomationTask[]);
        setMongoHealth(mongoResult as MongoHealth);
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
  }, [getAiToolManifest, getAutomationConfig, getToolAccess, healthCheck, isOwner, listAutomationTasks]);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    Promise.all([listLeadsAction({}), listPipelineBriefAction({})])
      .then(([leadsResult, briefResult]) => {
        if (cancelled) return;
        const leads = (leadsResult as unknown as { leads: TeamLead[] }).leads;
        setTeamLeads(leads.slice(0, 100));
        if (leads.length > 0) setTeamLeadId(leads[0]._id);
        setBrief(briefResult as PipelineBrief);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load the agent team data.");
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, listLeadsAction, listPipelineBriefAction]);

  const saveMongoFallback = async () => {
    const uri = mongoUriInput.trim();
    if (!uri) return;
    setSavingMongoUri(true);
    try {
      const result = await setMongoUriFallback({ uri });
      setMongoUriInput("");
      toast.success(result.host ? `Saved fallback connection (${result.host}).` : "Saved fallback connection.");
      setMongoHealth(await healthCheck());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save fallback connection.");
    } finally {
      setSavingMongoUri(false);
    }
  };

  const clearMongoFallback = async () => {
    try {
      await clearMongoUriFallback();
      toast.success("Cleared saved fallback connection.");
      setMongoHealth(await healthCheck());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear fallback connection.");
    }
  };

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

  const queueOfficialAllenCountySources = async () => {
    try {
      const result = await queueAllenCountySources({});
      setTasks((await listAutomationTasks({ status: "PENDING" })) as AutomationTask[]);
      toast.success(`${result.queued.length} official Allen County source${result.queued.length === 1 ? "" : "s"} queued.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the Allen County sources.");
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

  const toggleDefaultSource = (sourceId: string) => {
    setSelectedDefaultSourceIds((current) =>
      current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId],
    );
  };

  const executeCrawl = async (urls: string[], sourceLabel?: string) => {
    const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
    if (uniqueUrls.length === 0) {
      toast.error("Select at least one default website or add a URL below.");
      return;
    }
    if (uniqueUrls.some((url) => /^(?:https?:\/\/)?(?:www\.)?auction\.co\/?$/i.test(url))) {
      toast.error("Use https://www.auction.com/ — auction.co is not the Auction.com listing site.");
      return;
    }
    setCrawling(true);
    try {
      let result = await crawlWithCamofox({
        urls: uniqueUrls,
        maxPages: Number(crawlMaxPages),
        discoverLinks: crawlDiscoverLinks,
        sameOriginOnly: crawlSameOrigin,
      }) as CrawlResult;
      let provider: CrawlResult["provider"] = "camofox";
      let fallbackNotice = "";

      if (result.pages.length === 0 && result.failed.length > 0) {
        try {
          result = await crawlWithFirecrawl({
            urls: uniqueUrls,
            sourceType: "AUCTION_COM",
            maxPages: Number(crawlMaxPages),
          }) as CrawlResult;
          provider = "firecrawl";
          fallbackNotice = " Camofox returned no pages, so Firecrawl handled this batch.";
        } catch (fallbackError) {
          fallbackNotice = ` Firecrawl fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`;
        }
      }

      const staged: NonNullable<CrawlResult["staged"]> = result.staged ?? [];
      const stagingFailed: NonNullable<CrawlResult["stagingFailed"]> = result.stagingFailed ?? [];
      if (provider === "camofox") {
        for (const page of result.pages) {
          try {
            const captured = await stageCamofoxEvidence({
              url: page.finalUrl || page.url,
              sourceType: "AUCTION_COM",
              title: page.finalUrl || page.url,
              excerpt: page.snapshot,
              links: page.discoveredLinks,
            }) as NonNullable<CrawlResult["staged"]>[number];
            staged.push({
              url: page.finalUrl || page.url,
              stagedId: captured.stagedId,
              qualification: captured.qualification,
            });
          } catch (error) {
            stagingFailed.push({
              url: page.finalUrl || page.url,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      const resultWithStaging = { ...result, provider, staged, stagingFailed };
      setCrawlUrls(uniqueUrls.join("\n"));
      setCrawlResult(resultWithStaging);
      const candidates = staged.filter((item) => item.qualification.status === "CANDIDATE_CREATED").length;
      toast.success(`${sourceLabel ? `${sourceLabel}: ` : ""}captured ${result.pages.length} page${result.pages.length === 1 ? "" : "s"}, staged ${staged.length} for review${candidates ? `, created ${candidates} sourced candidate${candidates === 1 ? "" : "s"}` : ""}${result.failed.length ? `, ${result.failed.length} crawl failed` : ""}.${fallbackNotice}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not crawl these links.");
    } finally {
      setCrawling(false);
    }
  };

  const findDealsFromDefaults = async () => {
    const selectedSources = defaultDealSources.filter((source) => selectedDefaultSourceIds.includes(source.id));
    const urls = selectedSources.flatMap((source) => source.urls);
    await executeCrawl(urls, selectedSources.map((source) => source.name).join(" + "));
  };

  const useAuctionCatalogPreset = () => {
    setSelectedDefaultSourceIds(["auction-com"]);
    setCrawlUrls("https://www.auction.com/\nhttps://www.auction.com/residential/");
    setCrawlMaxPages("12");
    setCrawlDiscoverLinks(true);
    setCrawlSameOrigin(true);
    toast.success("Auction.com public catalog preset loaded. Review the links, then start the crawl.");
  };

  const handleCrawl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await executeCrawl(crawlUrls.split(/\r?\n|,/));
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

  const runRentcastFetch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRcRunning(true);
    setRcResult(null);
    try {
      const result = await rentcastPropertyDataAction({
        address: rcForm.address,
        radius: rcForm.radius ? Number(rcForm.radius) : undefined,
        saleDateRange: rcForm.saleDateRange ? Number(rcForm.saleDateRange) : undefined,
      }) as RentcastResult;
      setRcResult(result);
      if (!result.property) toast.warning("No RentCast property record matched this address.");
      else toast.success(`RentCast: ${result.summary.squareFeet ?? "?"} SF, rent $${result.summary.rentPerMonth ?? "—"}/mo, ${result.summary.soldCompsCount} sold comps.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not fetch RentCast data.");
    } finally {
      setRcRunning(false);
    }
  };

  const useLeadAddressForRentcast = () => {
    const selected = teamLeads.find((lead) => lead._id === teamLeadId);
    if (!selected) {
      toast.error("Pick a lead first (Coordinated agent team).");
      return;
    }
    setRcForm((current) => ({ ...current, address: `${selected.propertyAddress}, ${selected.city}, ${selected.state}` }));
    toast.success("Lead address loaded — pull RentCast data or run the underwrite.");
  };

  const runRentcastUnderwrite = async () => {
    if (!teamLeadId) {
      toast.error("Pick a lead first (Coordinated agent team).");
      return;
    }
    setRcUnderwriting(true);
    try {
      const result = await rentcastUnderwriteAction({
        leadId: teamLeadId,
        radius: rcForm.radius ? Number(rcForm.radius) : undefined,
        saleDateRange: rcForm.saleDateRange ? Number(rcForm.saleDateRange) : undefined,
      }) as { leadId: string; reports: AgentReport[]; readiness: ReadinessReport; source: { provider: string; address: string; propertyId: string; compsUsed: number; rentEstimate?: number } };
      setTeamReports(result.reports);
      setTeamReadiness(result.readiness);
      const blocking = result.readiness.gaps.length;
      if (result.readiness.ready) toast.success(`RentCast underwrite complete — READY (${result.source.compsUsed} comps, rent $${result.source.rentEstimate ?? "—"}/mo).`);
      else toast.warning(`RentCast underwrite flagged ${blocking} blocking gap${blocking === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run the RentCast underwrite.");
    } finally {
      setRcUnderwriting(false);
    }
  };

  const runSitemapDiscover = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSmRunning(true);
    setSmResult(null);
    try {
      const result = await sitemapDiscoverAction({
        urls: [smForm.url],
        sourceType: smForm.sourceType,
        maxUrls: smForm.maxUrls ? Number(smForm.maxUrls) : undefined,
      }) as SitemapResult;
      setSmResult(result);
      const candidates = result.staged.filter((item) => item.qualification.status === "CANDIDATE_CREATED").length;
      toast.success(`Discovered ${result.discovered.length} URL${result.discovered.length === 1 ? "" : "s"} from ${result.sitemapsUsed.length} sitemap${result.sitemapsUsed.length === 1 ? "" : "s"}, staged ${result.staged.length}${candidates ? `, created ${candidates} sourced candidate${candidates === 1 ? "" : "s"}` : ""}${result.truncated ? " (batch capped)" : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run sitemap discovery.");
    } finally {
      setSmRunning(false);
    }
  };

  const runScrapegraphExtract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSgRunning(true);
    setSgResult(null);
    try {
      const result = await scrapegraphExtractAction({
        url: sgForm.url,
        sourceType: sgForm.sourceType,
        prompt: sgForm.prompt,
      }) as SgResult;
      setSgResult(result);
      toast.success("Facts extracted and staged for owner review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run the extraction.");
    } finally {
      setSgRunning(false);
    }
  };

  const loadTeamLeads = async () => {
    setLoadingLeads(true);
    try {
      const result = await listLeadsAction({}) as unknown as { leads: TeamLead[] };
      setTeamLeads(result.leads.slice(0, 100));
      if (teamLeadId === "" && result.leads.length > 0) setTeamLeadId(result.leads[0]._id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load leads.");
    } finally {
      setLoadingLeads(false);
    }
  };

  const runAgentTeamNow = async () => {
    if (!teamLeadId) {
      toast.error("Pick a lead first.");
      return;
    }
    setTeamRunning(true);
    setTeamReports(null);
    setTeamReadiness(null);
    setTeamMatches(null);
    try {
      const purchasePrice = Number(teamRental.purchasePrice);
      const rental = purchasePrice > 0
        ? {
            purchasePrice,
            rentComps: teamRental.rentComps.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0),
            annualPropertyTax: teamRental.annualPropertyTax ? Number(teamRental.annualPropertyTax) : undefined,
            annualInsurance: teamRental.annualInsurance ? Number(teamRental.annualInsurance) : undefined,
            loanAmount: teamRental.loanAmount ? Number(teamRental.loanAmount) : undefined,
            interestRatePct: teamRental.interestRatePct ? Number(teamRental.interestRatePct) : undefined,
            loanTermYears: teamRental.loanTermYears ? Number(teamRental.loanTermYears) : undefined,
          }
        : undefined;
      const compPrices = teamRental.compPrices.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0);
      const result = await runAgentTeamAction({
        leadId: teamLeadId,
        rental,
        compPrices,
        repairTier: teamRental.repairTier,
        autoData: true,
      }) as { reports: AgentReport[]; readiness: ReadinessReport; source?: { provider: string; compsUsed?: number; rentEstimate?: number; status?: "OK" | "NO_MATCH" | "ERROR"; message?: string } };
      setTeamReports(result.reports);
      setTeamReadiness(result.readiness);
      const blocking = result.readiness.gaps.length;
      const sourced = result.source?.status === "OK"
        ? ` (${result.source.compsUsed ?? 0} RentCast comps, rent $${result.source.rentEstimate ?? "—"}/mo)`
        : result.source?.message
          ? ` (RentCast: ${result.source.message})`
          : "";
      if (result.readiness.ready) toast.success(`Agent team complete${sourced} — this deal is ready for owner review.`);
      else toast.warning(`Agent team flagged ${blocking} blocking gap${blocking === 1 ? "" : "s"}${sourced} — this deal is not ready.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run the agent team.");
    } finally {
      setTeamRunning(false);
    }
  };

  const runBuyerMatchesNow = async () => {
    if (!teamLeadId) {
      toast.error("Pick a lead first.");
      return;
    }
    setMatching(true);
    try {
      const result = await runBuyerMatchesAction({ leadId: teamLeadId, minScore: 55 }) as { matches: ScoredBuyerMatch[]; skipped: number; buyersScored: number };
      setTeamMatches(result.matches);
      toast.success(`${result.matches.length} buyer match${result.matches.length === 1 ? "" : "es"} from ${result.buyersScored} approved buyers (${result.skipped} below the 55-point minimum).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run buyer matching.");
    } finally {
      setMatching(false);
    }
  };

  const loadPipelineBrief = async () => {
    setLoadingBrief(true);
    try {
      setBrief(await listPipelineBriefAction({}) as PipelineBrief);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the pipeline brief.");
    } finally {
      setLoadingBrief(false);
    }
  };

  const loadPropertyBriefNow = async () => {
    if (!teamLeadId) {
      toast.error("Pick a lead first.");
      return;
    }
    setLoadingPropBrief(true);
    setBriefNote(null);
    try {
      const result = await loadPropertyBriefAction({ leadId: teamLeadId }) as PropertyBrief;
      setPropBrief(result);
      setTeamRental((current) => ({
        ...current,
        purchasePrice: result.prefill.purchasePrice ? String(result.prefill.purchasePrice) : current.purchasePrice,
        rentComps: result.prefill.rentComps.length ? result.prefill.rentComps.join(", ") : current.rentComps,
        annualPropertyTax: result.prefill.annualPropertyTax ? String(result.prefill.annualPropertyTax) : current.annualPropertyTax,
        squareFeet: result.prefill.squareFeet ? String(result.prefill.squareFeet) : current.squareFeet,
        compPrices: result.prefill.compPrices.length ? result.prefill.compPrices.join(", ") : current.compPrices,
      }));
      const filled: string[] = [];
      if (result.prefill.purchasePrice) filled.push("purchase price");
      if (result.prefill.rentComps.length) filled.push("rent estimate");
      if (result.prefill.squareFeet) filled.push("square feet");
      if (result.prefill.annualPropertyTax) filled.push("property tax");
      if (result.prefill.compPrices.length) filled.push(`${result.prefill.compPrices.length} sold comps`);
      setBriefNote(filled.length > 0
        ? `Pre-filled ${filled.join(", ")} from ${result.rentcast ? "RentCast" : "stored lead data"}. Fields with no source value stay blank — enter insurance and loan terms when you have them.`
        : result.rentcast
          ? "RentCast returned no record for this address — no market data to pre-fill. Fields stay blank for owner input."
          : "No connected source returned data for this address — fields stay blank for owner input.");
      toast.success("Property brief loaded — the agent team will start from it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the property brief.");
    } finally {
      setLoadingPropBrief(false);
    }
  };

  const queueOffMarketSourcesNow = async () => {
    try {
      const result = await queueOffMarket({});
      setTasks((await listAutomationTasks({ status: "PENDING" })) as AutomationTask[]);
      toast.success(`${result.queued.length} off-market source${result.queued.length === 1 ? "" : "s"} queued for review.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the off-market sources.");
    }
  };

  const saveDueDiligence = async (category: typeof DD_CATEGORIES[number]["key"]) => {
    if (!teamLeadId) {
      toast.error("Pick a lead first.");
      return;
    }
    const draft = ddDrafts[category];
    if (!draft?.sourceUrl?.trim()) {
      toast.error("A source URL is required to record evidence.");
      return;
    }
    setSavingDd(category);
    try {
      await updateDueDiligenceAction({
        id: teamLeadId,
        category,
        patch: {
          status: "FOUND",
          sourceUrl: draft.sourceUrl.trim(),
          summary: draft.summary.trim() || undefined,
        },
      });
      toast.success("Evidence recorded — rerun the agent team to re-check the gate.");
      setDdDrafts((current) => ({ ...current, [category]: { sourceUrl: "", summary: "" } }));
      setPropBrief((current) => current ? {
        ...current,
        stored: {
          ...current.stored,
          dueDiligence: {
            ...current.stored.dueDiligence,
            [category]: { status: "FOUND", sourceUrl: draft.sourceUrl.trim(), summary: draft.summary.trim() || undefined, checkedAt: Date.now() },
          },
        },
      } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record evidence.");
    } finally {
      setSavingDd(null);
    }
  };

  const copyMcpValue = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedMcpField(field);
      window.setTimeout(() => setCopiedMcpField(null), 1600);
    } catch {
      toast.error("Could not copy this value. Copy it manually instead.");
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
            <Link to="/local-agents" className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/65 px-3 text-xs font-semibold text-violet-800 transition-colors hover:bg-violet-100/80"><Smartphone className="size-4" /> Local agents</Link>
            <Button type="button" variant="outline" onClick={() => void loadAccess()} className="gap-2 rounded-xl border-white/85 bg-white/60 text-slate-700"><RefreshCw className="size-4" /> Refresh</Button>
            <button type="button" onClick={handleSignOut} className="flex size-10 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-500 hover:text-slate-800" aria-label="Sign out"><LogOut className="size-4" /></button>
          </div>
        </header>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100/80 text-indigo-700"><Radar className="size-5" /></div><div><p className="eyebrow">Coordinated agent team</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Full financial model before a deal surfaces</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Sourcing, title/lien verification, rental underwriting (rent, NOI, DSCR, cap rate, cash flow), and ARV/repairs run as one team over the chosen lead. The readiness gate aggregates every blocking data gap — an incomplete deal is flagged, never presented as ready. Every input is explicit; nothing is invented.</p></div></div>
            <Badge className={teamReadiness ? (teamReadiness.ready ? "border-0 bg-teal-100/80 text-teal-800" : "border-0 bg-amber-100/80 text-amber-800") : "border-0 bg-slate-100/80 text-slate-600"}>{teamReadiness ? (teamReadiness.ready ? "READY" : "INCOMPLETE") : "Not run"}</Badge>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-2xl border border-white/80 bg-white/45 p-4">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Lead to model</span><div className="flex gap-2"><select value={teamLeadId} onChange={(event) => setTeamLeadId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-white/85 bg-white/70 px-3 text-sm text-slate-700 outline-none"><option value="">Choose an eligible lead…</option>{teamLeads.map((lead) => <option key={lead._id} value={lead._id}>{lead.propertyAddress || lead._id} · {lead.city}, {lead.state}</option>)}</select><Button type="button" variant="outline" onClick={() => void loadTeamLeads()} disabled={loadingLeads} className="h-10 shrink-0 rounded-xl border-white/85 bg-white/65 px-3 text-xs" aria-label="Refresh leads">{loadingLeads ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}</Button></div></label>
              <div className="mt-2 flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={loadingPropBrief || !teamLeadId} onClick={() => void loadPropertyBriefNow()} className="h-8 gap-2 rounded-xl border-indigo-200/80 bg-white/65 text-xs text-indigo-800"><ClipboardList className="size-3.5" /> {loadingPropBrief ? "Loading…" : "Load brief"}</Button><span className="text-[0.68rem] leading-4 text-slate-500">Pre-fills the underwriting inputs below from RentCast + data already on file for this lead.</span></div>
              {briefNote && <p className="mt-2 rounded-lg border border-indigo-100/80 bg-indigo-50/55 px-2.5 py-1.5 text-[0.68rem] leading-4 text-indigo-800">{briefNote}</p>}
              <p className="mt-2 text-[0.68rem] leading-4 text-slate-500">Only non-fabricated leads are eligible. Rental underwriting falls back to the lead's MAO or acquisition price when no purchase price is entered below.</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/45 p-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">Pipeline brief</p><p className="mt-1 text-xs text-slate-500">Readiness across every eligible lead.</p></div><Button type="button" variant="outline" onClick={() => void loadPipelineBrief()} disabled={loadingBrief} className="h-9 gap-2 rounded-xl border-white/85 bg-white/65 text-xs"><ClipboardList className="size-3.5" /> {loadingBrief ? "Loading…" : "Load brief"}</Button></div>
              {brief && <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><div className="glass-inset rounded-xl p-2"><p className="text-slate-400">Leads</p><p className="mt-0.5 font-semibold text-slate-800">{brief.total}</p></div><div className="glass-inset rounded-xl p-2"><p className="text-slate-400">Ready</p><p className="mt-0.5 font-semibold text-teal-700">{brief.readyCount}</p></div><div className="glass-inset rounded-xl p-2"><p className="text-slate-400">Incomplete</p><p className="mt-0.5 font-semibold text-amber-700">{brief.incompleteCount}</p></div><div className="glass-inset rounded-xl p-2"><p className="text-slate-400">Not run</p><p className="mt-0.5 font-semibold text-slate-600">{brief.notRunCount}</p></div></div>}
            </div>
          </div>
          <div className="mt-3 grid gap-3 rounded-2xl border border-white/80 bg-white/45 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Purchase price</span><Input type="number" min="0" value={teamRental.purchasePrice} onChange={(event) => setTeamRental((current) => ({ ...current, purchasePrice: event.target.value }))} placeholder="Optional" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Rent comps /mo</span><Input value={teamRental.rentComps} onChange={(event) => setTeamRental((current) => ({ ...current, rentComps: event.target.value }))} placeholder="1400, 1500, 1600" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Property tax /yr</span><Input type="number" min="0" value={teamRental.annualPropertyTax} onChange={(event) => setTeamRental((current) => ({ ...current, annualPropertyTax: event.target.value }))} placeholder="Required for NOI" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Insurance /yr</span><Input type="number" min="0" value={teamRental.annualInsurance} onChange={(event) => setTeamRental((current) => ({ ...current, annualInsurance: event.target.value }))} placeholder="Required for NOI" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Repair tier</span><select value={teamRental.repairTier} onChange={(event) => setTeamRental((current) => ({ ...current, repairTier: event.target.value as typeof current.repairTier }))} className="h-9 rounded-xl border border-white/85 bg-white/70 px-3 text-xs text-slate-700 outline-none"><option value="BASE">Base · $15/SF</option><option value="MEDIUM">Medium · $30/SF</option><option value="GUT">Gut · $50/SF</option></select></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Square feet</span><Input type="number" min="0" value={teamRental.squareFeet} onChange={(event) => setTeamRental((current) => ({ ...current, squareFeet: event.target.value }))} placeholder="For repairs" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Sold comps</span><Input value={teamRental.compPrices} onChange={(event) => setTeamRental((current) => ({ ...current, compPrices: event.target.value }))} placeholder="145000, 152000" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Loan amount</span><Input type="number" min="0" value={teamRental.loanAmount} onChange={(event) => setTeamRental((current) => ({ ...current, loanAmount: event.target.value }))} placeholder="Defaults to 75% LTV" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Interest %</span><Input type="number" min="0" step="0.01" value={teamRental.interestRatePct} onChange={(event) => setTeamRental((current) => ({ ...current, interestRatePct: event.target.value }))} placeholder="6.5" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Term years</span><Input type="number" min="1" value={teamRental.loanTermYears} onChange={(event) => setTeamRental((current) => ({ ...current, loanTermYears: event.target.value }))} placeholder="30" className="h-9 rounded-xl border-white/85 bg-white/70 text-xs" /></label>
          </div>
          <div className="mt-3 rounded-2xl border border-white/80 bg-white/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">Due diligence evidence</p><p className="mt-1 text-[0.68rem] leading-4 text-slate-500">Record the county/public-record evidence the verification agent needs. FOUND requires a source URL; nothing is claimed without a source, and approval stays owner-only.</p></div><p className="text-[0.68rem] text-slate-400">Load brief to see current status</p></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DD_CATEGORIES.map((category) => {
                const entry = propBrief?.stored.dueDiligence?.[category.key];
                const status = entry?.status ?? "UNCHECKED";
                const draft = ddDrafts[category.key] ?? { sourceUrl: "", summary: "" };
                return <div key={category.key} className="rounded-xl border border-white/80 bg-white/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-800">{category.label}</p><Badge className={status === "FOUND" ? "border-0 bg-teal-100/80 text-teal-800" : status === "MISSING" ? "border-0 bg-amber-100/80 text-amber-800" : "border-0 bg-slate-100/80 text-slate-600"}>{status === "FOUND" ? "FOUND" : status === "MISSING" ? "MISSING" : "Unchecked"}</Badge></div>
                  <p className="mt-1 text-[0.65rem] leading-4 text-slate-500">{category.hint}{status === "FOUND" && entry?.sourceUrl ? ` Recorded: ${entry.sourceUrl}` : ""}</p>
                  <div className="mt-2 flex gap-2">
                    <Input value={draft.sourceUrl} onChange={(event) => setDdDrafts((current) => ({ ...current, [category.key]: { ...(current[category.key] ?? { sourceUrl: "", summary: "" }), sourceUrl: event.target.value } }))} placeholder="Source URL (assessor, recorder, listing)" className="h-8 flex-1 rounded-xl border-white/85 bg-white/70 text-[0.68rem]" />
                    <Button type="button" variant="outline" disabled={savingDd === category.key || !teamLeadId} onClick={() => void saveDueDiligence(category.key)} className="h-8 shrink-0 rounded-xl border-teal-200/80 bg-white/65 px-3 text-[0.68rem] text-teal-800">{savingDd === category.key ? <Loader2 className="size-3.5 animate-spin" /> : "Mark found"}</Button>
                  </div>
                  <Input value={draft.summary} onChange={(event) => setDdDrafts((current) => ({ ...current, [category.key]: { ...(current[category.key] ?? { sourceUrl: "", summary: "" }), summary: event.target.value } }))} placeholder="What the source shows (optional)" className="mt-2 h-8 rounded-xl border-white/85 bg-white/70 text-[0.68rem]" />
                </div>;
              })}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={teamRunning || !teamLeadId} onClick={() => void runAgentTeamNow()} className="h-10 gap-2 rounded-xl bg-indigo-700 text-xs hover:bg-indigo-800">{teamRunning ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />} {teamRunning ? "Running team…" : "Run agent team"}</Button>
            <Button type="button" disabled={matching || !teamLeadId} onClick={() => void runBuyerMatchesNow()} variant="outline" className="h-10 gap-2 rounded-xl border-indigo-200/80 bg-white/65 text-xs text-indigo-800">{matching ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} {matching ? "Scoring buyers…" : "Match approved buyers"}</Button>
            <p className="text-[0.68rem] leading-4 text-slate-500">Agent outputs are recommendations only. Approval, exports, and contact actions stay owner-only.</p>
          </div>
          {teamReadiness && <div className={`mt-4 rounded-2xl border p-4 ${teamReadiness.ready ? "border-teal-100/80 bg-teal-50/45" : "border-amber-200/80 bg-amber-50/55"}`}><div><p className="text-xs font-semibold text-slate-700">{teamReadiness.ready ? "Readiness gate passed" : "Readiness gate: not ready"}</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{teamReadiness.ready ? "Every blocking category is covered across the team. The owner may still reject the deal after review." : `${teamReadiness.gaps.length} blocking data gap${teamReadiness.gaps.length === 1 ? "" : "s"} must be resolved before this deal can surface as ready.`}</p></div>{teamReadiness.gaps.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{teamReadiness.gaps.map((gap) => <div key={`${gap.category}-${gap.detail}`} className="rounded-xl border border-amber-200/70 bg-white/60 p-3"><p className="text-xs font-semibold text-amber-800">{pretty(gap.category)}</p><p className="mt-1 text-[0.68rem] leading-4 text-slate-600">{gap.detail}</p></div>)}</div>}</div>}
          {teamReports && <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{teamReports.map((report) => <div key={report.agent} className={`rounded-2xl border p-3 ${report.status === "COMPLETED" ? "border-teal-100/80 bg-white/50" : "border-amber-200/80 bg-amber-50/45"}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-800">{pretty(report.agent)}</p><Badge className={report.status === "COMPLETED" ? "border-0 bg-teal-100/80 text-teal-800" : "border-0 bg-amber-100/80 text-amber-800"}>{report.status === "COMPLETED" ? "OK" : "Blocked"}</Badge></div><p className="mt-2 text-[0.68rem] leading-4 text-slate-600">{report.summary}</p>{report.findings.length > 0 && <ul className="mt-2 space-y-1 text-[0.65rem] leading-4 text-slate-500">{report.findings.map((finding) => <li key={finding}>· {finding}</li>)}</ul>}</div>)}</div>}
          {teamMatches && <div className="mt-4 rounded-2xl border border-indigo-100/80 bg-indigo-50/40 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">Buyer matches</p><p className="mt-1 text-xs text-slate-500">Ranked recommendations against approved buyers. Save the ones you approve in Operations.</p></div><Badge className="border-0 bg-indigo-100/80 text-indigo-800">{teamMatches.length} match{teamMatches.length === 1 ? "" : "es"}</Badge></div>{teamMatches.length === 0 ? <p className="mt-3 text-xs text-slate-500">No approved buyer cleared the 55-point minimum for this lead.</p> : <div className="mt-3 grid gap-2">{teamMatches.map((match) => <div key={match.buyerId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/60 p-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="text-xs font-semibold text-slate-800">{match.buyerId}</p><Badge className={match.confidence === "HIGH" ? "border-0 bg-teal-100/80 text-teal-800" : match.confidence === "MEDIUM" ? "border-0 bg-sky-100/80 text-sky-800" : "border-0 bg-slate-100/80 text-slate-600"}>{match.confidence}</Badge></div><p className="mt-1 text-[0.68rem] leading-4 text-slate-500">{match.summary}</p></div><p className="shrink-0 text-right"><span className="text-lg font-semibold text-indigo-800">{match.matchScore}</span><span className="block text-[0.6rem] text-slate-400">/100</span></p></div>)}</div>}</div>}
        </section>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100/80 text-emerald-700"><Sparkles className="size-5" /></div><div><p className="eyebrow">ScrapeGraphAI extraction</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Extract structured facts from a public source</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Ask ScrapeGraphAI's extract endpoint for property facts (address, sale date, case/parcel numbers, lien details) from a public probate, tax-sale, or auction page. The result is staged as bounded evidence for the same owner review — nothing is invented and nothing self-approves. Requires the SGAI_API_KEY on the Convex deployment.</p></div></div>
            <Badge className={sgResult ? "border-0 bg-emerald-100/80 text-emerald-800" : "border-0 bg-slate-100/80 text-slate-600"}>{sgRunning ? "Extracting…" : sgResult ? "Staged for review" : "Not run"}</Badge>
          </div>
          <form onSubmit={runScrapegraphExtract} className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]">
            <Input required type="url" value={sgForm.url} onChange={(event) => setSgForm((current) => ({ ...current, url: event.target.value }))} placeholder="Public source URL (probate, tax sale, auction)" className="h-10 rounded-xl border-white/85 bg-white/70 text-xs" />
            <select value={sgForm.sourceType} onChange={(event) => setSgForm((current) => ({ ...current, sourceType: event.target.value as typeof current.sourceType }))} className="h-10 rounded-xl border border-white/85 bg-white/70 px-3 text-xs text-slate-700 outline-none">{sourceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <Input required minLength={10} maxLength={2000} value={sgForm.prompt} onChange={(event) => setSgForm((current) => ({ ...current, prompt: event.target.value }))} placeholder="Prompt: extract address, sale date, case number, and lien details" className="h-10 rounded-xl border-white/85 bg-white/70 text-xs" />
            <Button type="submit" disabled={sgRunning} className="h-10 gap-2 rounded-xl bg-emerald-700 text-xs hover:bg-emerald-800">{sgRunning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {sgRunning ? "Extracting…" : "Extract & stage"}</Button>
          </form>
          {sgResult && <div className="mt-4 rounded-2xl border border-emerald-100/80 bg-emerald-50/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">Extraction staged</p><p className="mt-1 text-[0.68rem] leading-4 text-slate-500">Review it in the staging queue (qualify / consultant court). Staged ID: <span className="font-mono text-slate-700">{sgResult.stagedId}</span></p></div><Badge className="border-0 bg-emerald-100/80 text-emerald-800">{sgResult.usage ? `${sgResult.usage.promptTokens + sgResult.usage.completionTokens} tokens` : "No usage data"}</Badge></div>
            {sgResult.json && <pre className="mt-3 max-h-56 overflow-auto rounded-xl border border-white/80 bg-white/60 p-3 text-[0.65rem] leading-4 text-slate-600">{JSON.stringify(sgResult.json, null, 2)}</pre>}
          </div>}
        </section>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-100/80 text-teal-700"><FileSearch className="size-5" /></div><div><p className="eyebrow">Sitemap discovery</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">One portal seed → thousands of listing URLs</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Reads the site's robots.txt sitemap refs (or standard sitemap locations), expands them into a bounded batch of real listing pages, and stages each for the same owner review. Auction.com alone publishes 24 sitemaps with up to 5,000 property pages each. Nothing is invented and nothing self-approves.</p></div></div>
            <Badge className={smResult ? "border-0 bg-teal-100/80 text-teal-800" : "border-0 bg-slate-100/80 text-slate-600"}>{smRunning ? "Discovering…" : smResult ? `${smResult.discovered.length} URLs found` : "Not run"}</Badge>
          </div>
          <form onSubmit={runSitemapDiscover} className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input required type="url" value={smForm.url} onChange={(event) => setSmForm((current) => ({ ...current, url: event.target.value }))} placeholder="Portal seed URL, e.g. https://www.auction.com/" className="h-10 rounded-xl border-white/85 bg-white/70 text-xs" />
            <select value={smForm.sourceType} onChange={(event) => setSmForm((current) => ({ ...current, sourceType: event.target.value as typeof current.sourceType }))} className="h-10 rounded-xl border border-white/85 bg-white/70 px-3 text-xs text-slate-700 outline-none">{sourceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <Input type="number" min="1" max="200" value={smForm.maxUrls} onChange={(event) => setSmForm((current) => ({ ...current, maxUrls: event.target.value }))} placeholder="Batch size (default 60)" className="h-10 rounded-xl border-white/85 bg-white/70 text-xs" />
            <Button type="submit" disabled={smRunning} className="h-10 gap-2 rounded-xl bg-teal-700 text-xs hover:bg-teal-800">{smRunning ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />} {smRunning ? "Discovering…" : "Discover & stage"}</Button>
          </form>
          {smResult && <div className="mt-4 rounded-2xl border border-teal-100/80 bg-teal-50/45 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="glass-inset rounded-xl p-3"><p className="text-xs font-semibold text-slate-700">Sitemaps used</p><p className="mt-1 text-lg font-semibold text-teal-800">{smResult.sitemapsUsed.length}</p></div>
              <div className="glass-inset rounded-xl p-3"><p className="text-xs font-semibold text-slate-700">URLs discovered</p><p className="mt-1 text-lg font-semibold text-teal-800">{smResult.discovered.length}{smResult.truncated ? "+" : ""}</p></div>
              <div className="glass-inset rounded-xl p-3"><p className="text-xs font-semibold text-slate-700">Staged for review</p><p className="mt-1 text-lg font-semibold text-teal-800">{smResult.staged.length}</p></div>
            </div>
            {smResult.discovered.length > 0 && <div className="mt-3 max-h-44 overflow-auto rounded-xl border border-white/80 bg-white/60 p-3"><ul className="space-y-1 text-[0.65rem] leading-4 text-slate-600">{smResult.discovered.slice(0, 20).map((item) => <li key={item.url} className="truncate">· {item.url}</li>)}</ul></div>}
            {(smResult.stagingFailed.length > 0 || smResult.errors.length > 0) && <p className="mt-3 text-[0.68rem] leading-4 text-amber-700">{smResult.stagingFailed.length + smResult.errors.length} fetch or staging issue{smResult.stagingFailed.length + smResult.errors.length === 1 ? "" : "s"} — see below.</p>}
          </div>}
        </section>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100/80 text-orange-700"><Home className="size-5" /></div><div><p className="eyebrow">RentCast property data</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Real comps, rent, and attributes for underwriting</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Official property records, rent estimates, and sold comparables feed the agent team's readiness gate with real market data instead of manual entry. One click underwrites the selected lead with RentCast comps, rent, square footage, and property tax — nothing is invented, and approval stays owner-only.</p></div></div>
            <Badge className={rcResult ? (rcResult.property ? "border-0 bg-orange-100/80 text-orange-800" : "border-0 bg-amber-100/80 text-amber-800") : "border-0 bg-slate-100/80 text-slate-600"}>{rcRunning ? "Fetching…" : rcResult ? (rcResult.property ? "Data matched" : "No record") : "Not run"}</Badge>
          </div>
          <form onSubmit={runRentcastFetch} className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input required type="text" value={rcForm.address} onChange={(event) => setRcForm((current) => ({ ...current, address: event.target.value }))} placeholder="Full property address, e.g. 5500 Grand Lake Dr, San Antonio, TX" className="h-10 rounded-xl border-white/85 bg-white/70 text-xs" />
            <Input type="number" min="0.5" max="25" step="0.5" value={rcForm.radius} onChange={(event) => setRcForm((current) => ({ ...current, radius: event.target.value }))} placeholder="Radius mi" className="h-10 rounded-xl border-white/85 bg-white/70 text-xs" aria-label="Comps radius in miles" />
            <Input type="number" min="30" value={rcForm.saleDateRange} onChange={(event) => setRcForm((current) => ({ ...current, saleDateRange: event.target.value }))} placeholder="Days" className="h-10 rounded-xl border-white/85 bg-white/70 text-xs" aria-label="Comps look-back in days" />
            <Button type="submit" disabled={rcRunning} className="h-10 gap-2 rounded-xl bg-orange-700 text-xs hover:bg-orange-800">{rcRunning ? <Loader2 className="size-4 animate-spin" /> : <Home className="size-4" />} {rcRunning ? "Fetching…" : "Pull property data"}</Button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={useLeadAddressForRentcast} className="h-9 gap-2 rounded-xl border-orange-200/80 bg-white/65 text-xs text-orange-800"><MapPin className="size-3.5" /> Use lead address</Button>
            <Button type="button" disabled={rcUnderwriting || !teamLeadId} onClick={() => void runRentcastUnderwrite()} className="h-9 gap-2 rounded-xl bg-orange-700 text-xs hover:bg-orange-800">{rcUnderwriting ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-3.5" />} {rcUnderwriting ? "Underwriting…" : "Run agent team with RentCast data"}</Button>
            <p className="text-[0.68rem] leading-4 text-slate-500">Underwrite uses the lead selected in Coordinated agent team. Free RentCast plan covers 50 requests/month.</p>
          </div>
          {rcResult && <div className="mt-4 rounded-2xl border border-orange-100/80 bg-orange-50/45 p-4">
            {rcResult.property ? <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="glass-inset rounded-xl p-3"><p className="text-[0.65rem] font-semibold text-slate-500">Size</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{rcResult.summary.squareFeet ? `${rcResult.summary.squareFeet.toLocaleString()} SF` : "—"}</p></div>
              <div className="glass-inset rounded-xl p-3"><p className="text-[0.65rem] font-semibold text-slate-500">Built</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{rcResult.summary.yearBuilt ?? "—"}</p></div>
              <div className="glass-inset rounded-xl p-3"><p className="text-[0.65rem] font-semibold text-slate-500">Beds / baths</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{rcResult.summary.bedrooms ?? "—"} / {rcResult.summary.bathrooms ?? "—"}</p></div>
              <div className="glass-inset rounded-xl p-3"><p className="text-[0.65rem] font-semibold text-slate-500">Property tax /yr</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{rcResult.summary.annualPropertyTax ? `$${rcResult.summary.annualPropertyTax.toLocaleString()}` : "—"}</p></div>
              <div className="glass-inset rounded-xl p-3"><p className="text-[0.65rem] font-semibold text-slate-500">Rent /mo</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{rcResult.summary.rentPerMonth ? `$${rcResult.summary.rentPerMonth.toLocaleString()}` : "—"}</p></div>
              <div className="glass-inset rounded-xl p-3"><p className="text-[0.65rem] font-semibold text-slate-500">Sold comps</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{rcResult.summary.soldCompsCount}</p></div>
            </div> : <p className="text-xs text-amber-700">No RentCast property record matched this address — check the address or try the full street, city, state format.</p>}
            {rcResult.summary.soldComps.length > 0 && <div className="mt-3 rounded-xl border border-white/80 bg-white/60 p-3"><p className="text-[0.65rem] font-semibold text-slate-500">Sold comp prices ({rcResult.summary.soldComps.length}) — {rcResult.comps.radiusMiles} mi, last {rcResult.comps.saleDateRangeDays} days</p><div className="mt-1.5 flex flex-wrap gap-1.5">{rcResult.summary.soldComps.slice(0, 12).map((price) => <span key={price} className="rounded-lg bg-orange-100/70 px-2 py-0.5 text-[0.68rem] font-semibold text-orange-800">${price.toLocaleString()}</span>)}</div></div>}
            {rcResult.rentEstimate?.rentRangeLow && rcResult.rentEstimate?.rentRangeHigh && <p className="mt-2 text-[0.68rem] leading-4 text-slate-500">Rent range: ${rcResult.rentEstimate.rentRangeLow.toLocaleString()} – ${rcResult.rentEstimate.rentRangeHigh.toLocaleString()}/mo. Source: RentCast property records + AVM.</p>}
          </div>}
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Scraper</p><Globe2 className="size-4 text-sky-600" /></div><div className="mt-3 flex items-center justify-between"><p className="text-lg font-semibold text-slate-900">{access.scraperEnabled ? "Enabled" : "Disabled"}</p><button type="button" role="switch" aria-checked={access.scraperEnabled} onClick={() => void updateTool("SCRAPER", !access.scraperEnabled)} className={`relative h-6 w-11 rounded-full transition-colors ${access.scraperEnabled ? "bg-sky-700" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${access.scraperEnabled ? "translate-x-6" : "translate-x-1"}`} /></button></div><p className="mt-1 text-xs text-slate-500">Public evidence URLs only</p></div>
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Estimator</p><Calculator className="size-4 text-teal-600" /></div><div className="mt-3 flex items-center justify-between"><p className="text-lg font-semibold text-slate-900">{access.estimatorEnabled ? "Enabled" : "Disabled"}</p><button type="button" role="switch" aria-checked={access.estimatorEnabled} onClick={() => void updateTool("ESTIMATOR", !access.estimatorEnabled)} className={`relative h-6 w-11 rounded-full transition-colors ${access.estimatorEnabled ? "bg-teal-700" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${access.estimatorEnabled ? "translate-x-6" : "translate-x-1"}`} /></button></div><p className="mt-1 text-xs text-slate-500">Explicit inputs, no invented comps</p></div>
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">AI access</p><Bot className="size-4 text-violet-600" /></div><div className="mt-3 flex items-center justify-between"><p className="text-lg font-semibold text-slate-900">{access.aiEnabled ? "Granted" : "Owner only"}</p><button type="button" role="switch" aria-checked={access.aiEnabled} onClick={() => void updateAiAccess(!access.aiEnabled)} className={`relative h-6 w-11 rounded-full transition-colors ${access.aiEnabled ? "bg-violet-700" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${access.aiEnabled ? "translate-x-6" : "translate-x-1"}`} /></button></div><p className="mt-1 text-xs text-slate-500">Three consultants + judge review sourced deals</p></div>
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">MongoDB Atlas</p><ShieldCheck className="size-4 text-teal-600" /></div><p className="mt-3 text-lg font-semibold text-slate-900">{mongoHealth.connected ? "Connected" : mongoHealth.configured ? "Connection failed" : "Not configured"}</p><p className="mt-1 text-xs text-slate-500">{mongoHealth.connected ? (mongoHealth.usingFallback ? "Connected via saved fallback" : "Source of truth is reachable") : mongoHealth.status}</p>{mongoHealth.fallbackConfigured ? <p className="mt-1 text-[0.68rem] text-slate-500">Saved fallback: {mongoHealth.fallbackHost ?? "configured"}</p> : null}<div className="mt-3 flex items-center gap-2"><input type="password" value={mongoUriInput} onChange={(event) => setMongoUriInput(event.target.value)} placeholder="mongodb+srv://user:pass@cluster..." autoComplete="off" spellCheck={false} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none" /><button type="button" onClick={() => void saveMongoFallback()} disabled={savingMongoUri || !mongoUriInput.trim()} className="shrink-0 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">{savingMongoUri ? "Saving…" : "Save"}</button></div>{mongoHealth.fallbackConfigured ? <button type="button" onClick={() => void clearMongoFallback()} className="mt-1.5 text-[0.68rem] text-slate-400 transition-colors hover:text-slate-600">Clear saved fallback</button> : null}<p className="mt-2 text-[0.68rem] leading-4 text-slate-400">Only used when the deployment's MONGODB_URI env var is missing or rejected. Stored in this project's Convex settings, owner-readable only.</p></div>
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">n8n handoff</p><ListChecks className="size-4 text-amber-600" /></div><p className="mt-3 text-lg font-semibold text-slate-900">{automation.n8nSecretConfigured ? "Ready" : "Needs secret"}</p><p className="mt-1 text-xs text-slate-500">{automation.n8nSecretConfigured ? "Authenticated queue is available" : "Add the Convex shared secret"}</p></div>
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">AI reviewer</p><Bot className="size-4 text-violet-600" /></div><p className="mt-3 text-lg font-semibold text-slate-900">{automation.providerConfigured && access.aiEnabled ? "Ready" : "Optional"}</p><p className="mt-1 text-xs text-slate-500">{automation.providerConfigured && access.aiEnabled ? "Temporary review suggestions enabled" : "Deterministic sourcing works without it"}</p></div>
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
            <div className="rounded-2xl border border-white/80 bg-white/45 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">AI consultant court</p><p className="mt-1 text-xs text-slate-500">{automation.providerConfigured ? "Three consultants and a judge run through Ollama Cloud." : "Add OLLAMA_API_KEY in Environment vars to activate the court."}</p></div><Badge className={automation.providerConfigured && access.aiEnabled ? "border-0 bg-violet-100/80 text-violet-800" : "border-0 bg-slate-100/80 text-slate-500"}>{automation.providerConfigured && access.aiEnabled ? "Available" : "Waiting"}</Badge></div><p className="mt-4 text-[0.68rem] leading-5 text-slate-500">The evidence auditor, underwriting analyst, and risk/compliance consultant review independently; a judge reconciles them. The verdict is a recommendation only, and the owner must still approve.</p></div>
          </div>
          <form onSubmit={queueScrape} className="mt-3 flex flex-col gap-2 sm:flex-row"><Input required type="url" value={queueUrl} onChange={(event) => setQueueUrl(event.target.value)} placeholder="Queue an official public source URL for the next cycle" className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /><Button type="submit" disabled={!automation.enabled} className="h-10 gap-2 rounded-xl bg-sky-700 text-xs hover:bg-sky-800"><ListChecks className="size-4" /> Queue source</Button><Button type="button" disabled={!automation.enabled} onClick={() => void queueOfficialAllenCountySources()} variant="outline" className="h-10 gap-2 rounded-xl border-amber-200/80 bg-amber-50/55 text-xs text-amber-800"><Landmark className="size-4" /> Queue Allen County</Button><Button type="button" disabled={!automation.enabled} onClick={() => void queueOffMarketSourcesNow()} variant="outline" className="h-10 gap-2 rounded-xl border-teal-200/80 bg-teal-50/55 text-xs text-teal-800"><Radar className="size-4" /> Queue off-market</Button><Button type="button" disabled={!automation.enabled} onClick={() => void runCycle()} variant="outline" className="h-10 gap-2 rounded-xl border-white/85 bg-white/65 text-xs"><Play className="size-4" /> Run now</Button></form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-[0.68rem] text-slate-500">Today: {automation.runsToday} / {automation.dailyRunLimit} cycles · {tasks.filter((task) => task.status === "PENDING").length} pending tasks</p><div className="flex flex-wrap gap-2">{tasks.slice(0, 5).map((task) => <Badge key={task._id} variant="outline" className="border-white/90 bg-white/55 text-[0.65rem] text-slate-600">{task.kind} · {task.status}</Badge>)}</div></div>
          <div className="mt-4 rounded-2xl border border-sky-100/80 bg-sky-50/45 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-700">n8n scheduler handoff</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">n8n can schedule source URLs and retry this queue endpoint. Use one workflow with a daily or twice-daily schedule to conserve trial executions; Convex still validates the URL, fetches bounded evidence, writes Mongo staging, and keeps every candidate in owner review.</p></div><Badge className={automation.n8nSecretConfigured ? "border-0 bg-teal-100/80 text-teal-800" : "border-0 bg-amber-100/80 text-amber-800"}>{automation.n8nSecretConfigured ? "Connected" : "Needs secret"}</Badge></div><div className="mt-3 grid gap-2 text-[0.68rem] leading-5 text-slate-500 sm:grid-cols-3"><p><strong className="text-slate-700">Endpoint</strong><br />your Convex site URL + <code>/api/n8n/source</code></p><p><strong className="text-slate-700">Header</strong><br /><code>x-convex-n8n-secret</code></p><p><strong className="text-slate-700">Body</strong><br /><code>{"{ url, sourceType, idempotencyKey? }"}</code></p></div><p className="mt-3 text-[0.68rem] text-slate-500">Add <code>CONVEX_N8N_WEBHOOK_SECRET</code> in the Convex Environment vars panel, then store the same value as an n8n secret. Do not put it in browser code.</p></div>
        </section>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100/80 text-cyan-700"><Link2 className="size-5" /></div><div><p className="eyebrow">Camofox link crawler</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Scrape the links you send</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Paste one or more public URLs, one per line. The browser captures each page sequentially, optionally follows links it can identify, and closes every tab after capture. Results stay evidence-only until you review and qualify them.</p></div></div>
            <Badge className="border-0 bg-cyan-100/80 text-cyan-800">Owner only</Badge>
          </div>
          <div className="mt-5 rounded-2xl border border-cyan-100/80 bg-cyan-50/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-semibold text-slate-700">Default deal websites</p><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Select a saved public source and click <strong>Find deals</strong> whenever you want to run it. No URL entry is needed; the crawler still uses the same bounded, evidence-only review flow.</p></div>
              <Badge className="border-0 bg-white/75 text-cyan-800">Reusable sources</Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {defaultDealSources.map((source) => {
                const selected = selectedDefaultSourceIds.includes(source.id);
                return <label key={source.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selected ? "border-cyan-300/80 bg-white/75" : "border-white/80 bg-white/40 hover:bg-white/60"}`}>
                  <input type="checkbox" checked={selected} onChange={() => toggleDefaultSource(source.id)} className="mt-0.5 size-4 accent-cyan-700" />
                  <span className="min-w-0"><span className="flex items-center gap-2 text-xs font-semibold text-slate-700">{source.name}{selected ? <Check className="size-3.5 text-cyan-700" /> : null}</span><span className="mt-1 block text-[0.68rem] leading-4 text-slate-500">{source.description} · {source.domain}</span></span>
                </label>;
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2"><Button type="button" disabled={crawling || selectedDefaultSourceIds.length === 0} onClick={() => void findDealsFromDefaults()} className="h-9 gap-2 rounded-xl bg-cyan-700 text-xs hover:bg-cyan-800"><Play className="size-3.5" /> Find deals from selected</Button><Button type="button" variant="outline" onClick={useAuctionCatalogPreset} className="h-9 rounded-xl border-cyan-200/80 bg-white/65 text-xs text-cyan-800">Load Auction.com into custom links</Button></div>
          </div>
          <form onSubmit={handleCrawl} className="mt-5 grid gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span className="flex flex-wrap items-center justify-between gap-2">Custom starting links <span className="font-normal text-slate-400">(optional when using defaults)</span></span><Textarea value={crawlUrls} onChange={(event) => setCrawlUrls(event.target.value)} placeholder={"https://county.gov/sales\nhttps://auction.example/listings"} className="min-h-28 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Maximum pages</span><Input required min="1" max="12" type="number" value={crawlMaxPages} onChange={(event) => setCrawlMaxPages(event.target.value)} className="h-10 rounded-xl border-white/85 bg-white/70 text-sm" /></label>
              <div className="flex flex-wrap gap-4 pb-2 text-xs text-slate-600"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={crawlDiscoverLinks} onChange={(event) => setCrawlDiscoverLinks(event.target.checked)} className="size-4 accent-cyan-700" /> Follow discovered links</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={crawlSameOrigin} onChange={(event) => setCrawlSameOrigin(event.target.checked)} className="size-4 accent-cyan-700" /> Keep discovered links on seed sites</label></div>
              <Button disabled={crawling} type="submit" className="h-10 gap-2 rounded-xl bg-cyan-700 text-xs hover:bg-cyan-800">{crawling ? <Loader2 className="size-4 animate-spin" /> : <Globe2 className="size-4" />} {crawling ? "Crawling…" : "Start crawl"}</Button>            </div>
            <p className="text-[0.68rem] leading-5 text-slate-500">The Auction.com preset starts from the public catalog only. Each pass is capped at 12 pages and does not bypass login, CAPTCHA, paywalls, or access controls. Review the captured evidence before qualifying any record.</p>
          </form>
          {crawlResult && <div className="mt-5 space-y-3">
<div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><Badge className="border-0 bg-teal-100/80 text-teal-800">{crawlResult.pages.length} captured</Badge><Badge className="border-0 bg-cyan-100/80 text-cyan-800">{crawlResult.staged?.length ?? 0} staged</Badge><Badge className={crawlResult.failed.length ? "border-0 bg-amber-100/80 text-amber-800" : "border-0 bg-slate-100/80 text-slate-600"}>{crawlResult.failed.length} crawl failed</Badge><Badge className="border-0 bg-white/75 text-slate-600">via {crawlResult.provider ?? "camofox"}</Badge><span>{crawlResult.discoveredLinks.length} links discovered · {crawlResult.queuedButNotVisited.length} left in bound</span></div>{crawlResult.pages.length === 0 && crawlResult.failed.length > 0 ? <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-xs leading-5 text-amber-900"><strong>No listings were captured.</strong> Both public crawlers returned no readable pages. Check the failed entries below and confirm the source permits automated access; there is no listing data for the app to convert into deals.</div> : null}{crawlResult.pages.map((page) => { const stagedPage = crawlResult.staged?.find((item) => item.url === (page.finalUrl || page.url)); const qualification = stagedPage?.qualification; return <details key={page.url} className="rounded-2xl border border-white/80 bg-white/45 p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 truncate text-xs font-semibold text-slate-700">{page.finalUrl}</span><span className="text-[0.68rem] text-slate-400">{qualification?.status === "CANDIDATE_CREATED" ? "Sourced candidate" : qualification?.status === "REJECTED" ? "Evidence staged · missing required fields" : "Evidence captured"} · {page.discoveredLinks.length} links</span></div></summary><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{page.snapshot.slice(0, 1400) || "No readable snapshot returned."}{page.truncated ? "\n\n[Snapshot truncated for safety]" : ""}</p>{qualification?.reason ? <p className="mt-3 rounded-xl bg-amber-50/80 p-3 text-[0.68rem] leading-4 text-amber-800">Not converted to a sourced candidate yet: {qualification.reason}</p> : null}</details>; })}{crawlResult.failed.map((failure) => <div key={failure.url} className="rounded-2xl border border-rose-100/80 bg-rose-50/45 p-3 text-xs"><p className="font-semibold text-rose-800">{failure.url}</p><p className="mt-1 text-rose-700">{failure.error}</p></div>)}{crawlResult.stagingFailed?.map((failure) => <div key={`stage-${failure.url}`} className="rounded-2xl border border-amber-100/80 bg-amber-50/45 p-3 text-xs"><p className="font-semibold text-amber-800">Evidence not saved: {failure.url}</p><p className="mt-1 text-amber-700">{failure.error}</p></div>)}</div>}
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

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100/80 text-violet-700"><Bot className="size-5" /></div><div><p className="eyebrow">External AI connection</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Deal Pipeline MCP server</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Use these details in Odysseus or another MCP-compatible agent. This website uses a remote HTTP server, so do not use the filesystem stdio example or expose MongoDB credentials.</p></div></div>
            <Badge className="border-0 bg-teal-100/80 text-teal-800">Owner setup</Badge>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/50 p-4"><p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Server name</p><div className="mt-2 flex items-center justify-between gap-2"><code className="text-sm font-semibold text-slate-800">Deal Pipeline MCP</code><button type="button" onClick={() => void copyMcpValue("name", "Deal Pipeline MCP")} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-violet-700" aria-label="Copy server name">{copiedMcpField === "name" ? <Check className="size-3.5 text-teal-600" /> : <Copy className="size-3.5" />}</button></div></div>
            <div className="rounded-2xl border border-white/80 bg-white/50 p-4"><p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Transport</p><div className="mt-2 flex items-center justify-between gap-2"><code className="text-sm font-semibold text-slate-800">Streamable HTTP</code><button type="button" onClick={() => void copyMcpValue("transport", "Streamable HTTP")} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-violet-700" aria-label="Copy transport">{copiedMcpField === "transport" ? <Check className="size-3.5 text-teal-600" /> : <Copy className="size-3.5" />}</button></div></div>
            <div className="rounded-2xl border border-white/80 bg-white/50 p-4 sm:col-span-2 lg:col-span-1"><p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Remote endpoint</p><div className="mt-2 flex items-center justify-between gap-2"><code className="min-w-0 truncate text-xs font-semibold text-sky-700">{mcpEndpoint}</code><button type="button" onClick={() => void copyMcpValue("endpoint", mcpEndpoint)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-violet-700" aria-label="Copy MCP endpoint">{copiedMcpField === "endpoint" ? <Check className="size-3.5 text-teal-600" /> : <Copy className="size-3.5" />}</button></div></div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-sky-100/80 bg-sky-50/45 p-4"><p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">Authorization header</p><div className="mt-2 flex items-center justify-between gap-2"><code className="min-w-0 truncate text-xs text-slate-700">Bearer &lt;MCP_TOOL_SERVER_SECRET&gt;</code><button type="button" onClick={() => void copyMcpValue("authorization", "Bearer <MCP_TOOL_SERVER_SECRET>")} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-violet-700" aria-label="Copy authorization template">{copiedMcpField === "authorization" ? <Check className="size-3.5 text-teal-600" /> : <Copy className="size-3.5" />}</button></div><p className="mt-2 text-[0.68rem] leading-5 text-slate-500">Create the actual secret in Convex Environment Variables under <code>MCP_TOOL_SERVER_SECRET</code>. The value is intentionally never shown in this website.</p></div>
            <div className="rounded-2xl border border-amber-100/80 bg-amber-50/45 p-4"><p className="text-[0.68rem] font-semibold uppercase tracking-wide text-amber-800">stdio fields from the integration form</p><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-600"><p><strong>Command:</strong> Not applicable for this remote server</p><p><strong>Args:</strong> Not applicable</p><p><strong>Env:</strong> Do not put the secret in browser or agent environment fields; use the Authorization header above.</p></div><p className="mt-2 text-[0.68rem] leading-5 text-amber-800">The <code>@modelcontextprotocol/server-filesystem</code> example is a different local tool and must not be used for this deal pipeline.</p></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/45 p-4"><p className="text-xs leading-5 text-slate-500">Available tools: <code>queue_source</code>, <code>scrape_source</code>, <code>list_pipeline</code>, <code>list_staged_sources</code>, <code>list_buyer_buy_boxes</code>, <code>list_match_board</code>, <code>estimate_deal</code>, and <code>consultant_court</code>. Queueing and reads use the website pipeline; approval, buyer contact data, exports, and direct MongoDB access remain blocked.</p><button type="button" onClick={() => void copyMcpValue("config", JSON.stringify({ name: "Deal Pipeline MCP", transport: "Streamable HTTP", url: mcpEndpoint, headers: { Authorization: "Bearer <MCP_TOOL_SERVER_SECRET>" } }, null, 2))} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-white/90 bg-white/70 px-3 text-xs font-semibold text-slate-700 transition-colors hover:text-violet-700"><Copy className="size-3.5" />{copiedMcpField === "config" ? "Copied config" : "Copy config"}</button></div>
        </section>

        <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100/80 text-violet-700"><Bot className="size-5" /></div><div className="min-w-0 flex-1"><p className="eyebrow">AI connector handoff</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Controlled tool manifest</h2><p className="mt-1 text-xs leading-5 text-slate-500">The court uses bounded source evidence only. It does not expose Mongo credentials, approve leads, or bypass owner checks.</p></div><Badge className="border-0 bg-violet-100/80 text-violet-800">{loading ? "Loading" : access.aiEnabled ? "Enabled" : "Owner only"}</Badge></div><pre className="mt-4 max-h-72 overflow-auto rounded-2xl border border-white/80 bg-white/55 p-4 text-[0.7rem] leading-5 text-slate-600">{manifest ? JSON.stringify(manifest, null, 2) : "Manifest unavailable until tool access loads."}</pre><div className="mt-4 flex items-start gap-2 text-xs text-slate-500"><Check className="mt-0.5 size-3.5 shrink-0 text-teal-600" /><p>The court requires exact evidence quotes from the staged source, flags missing information, and keeps the owner as final decision-maker. The estimator only calculates from explicit numbers and reports when appraisal data is missing.</p></div></section>
        <p className="pb-5 pt-5 text-center text-xs text-slate-500">MongoDB is the source of truth for staged sources and saved underwriting. These actions are owner-only and refresh on demand.</p>
      </div>
    </main>
  );
}
