import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useAction } from "convex/react";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Copy,
  Database,
  ExternalLink,
  FilePlus2,
  Filter,
  Home,
  KeyRound,
  Landmark,
  Loader2,
  LogOut,
  MapPin,
  Menu,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

const SOURCE_TYPES = [
  { value: "SHERIFF_SALE", label: "Sheriff sale" },
  { value: "TAX_SALE", label: "Tax sale" },
  { value: "AUCTION_COM", label: "Auction.com public listing" },
  { value: "PROBATE", label: "Probate / court record" },
  { value: "OFF_MARKET", label: "Off-market evidence" },
  { value: "ASSESSOR", label: "Assessor" },
  { value: "RECORDER", label: "Recorder" },
  { value: "FORECLOSURE", label: "Foreclosure / REO listing" },
  { value: "MARKETPLACE", label: "Investor marketplace" },
  { value: "ASSOCIATION", label: "Investor association" },
  { value: "MANUAL", label: "Manual record" },
] as const;

type SourceType = (typeof SOURCE_TYPES)[number]["value"];

type ApiCredential = {
  id: string;
  name: string;
  scopes: string[];
  tokenPrefix: string;
  status: "ACTIVE" | "PENDING" | "REVOKED";
  createdBy: string;
  createdAt: number;
  lastUsedAt?: number;
  note?: string;
};

const API_SCOPE_OPTIONS = [
  { value: "admin", label: "Admin CRUD (/api/admin/*)" },
  { value: "threads", label: "Shared conversations (/api/shared-thread)" },
  { value: "n8n", label: "Automation queue (/api/n8n/source)" },
] as const;

const API_SCOPE_LABELS: Record<string, string> = {
  admin: "Admin CRUD (/api/admin/*)",
  threads: "Shared conversations (/api/shared-thread)",
  n8n: "Automation queue (/api/n8n/source)",
};

type LeadFormState = {
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId: string;
  ownerMailingAddress: string;
  sourceType: SourceType;
  sourceUrl: string;
  sourceRef: string;
  sourceDate: string;
  distressScore: string;
  signalType: string;
  signalWeight: string;
  signalEvidence: string;
  arv: string;
  repairs: string;
  mao: string;
  acquisitionPrice: string;
  notes: string;
};

type MongoLead = {
  _id: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId?: string;
  ownerMailingAddress?: string;
  ownerNames?: string[];
  ownerType?: string;
  ownerLookup?: {
    provider?: string;
    sourceUrl?: string;
    sourceDate?: string;
    fetchedAt?: number;
    ownerOccupied?: boolean;
  };
  sourceType: string;
  sourceUrl: string;
  sourceRef: string;
  sourceDate: string;
  distressScore: number;
  distressSignals: Array<{
    type: string;
    weight: number;
    evidence: string;
    verified: boolean;
    sourceUrl: string;
    sourceDate: string;
  }>;
  verificationStatus: string;
  pipelineStatus: string;
  absenteeOwner: boolean;
  needsSkipTrace: boolean;
  listedPhone: boolean;
  skipTrace?: {
    provider?: string;
    sourceUrl?: string;
    sourceDate?: string;
    fetchedAt?: number;
    names?: Array<{ first?: string; middle?: string; last?: string }>;
    phones?: Array<{ number: string; type?: string; carrier?: string; listingName?: string; score?: number; possibleSubject?: boolean }>;
    emails?: string[];
    reportToken?: string;
  };
  arv?: number;
  repairs?: number;
  mao?: number;
  acquisitionPrice?: number;
  estimatedProfit?: number;
  notes?: string;
  lastVerifiedAt?: number | string;
};

type MongoWorkspace = {
  meta: { dataOrigin: "verified"; live: false };
  leads: MongoLead[];
};

const emptyForm: LeadFormState = {
  propertyAddress: "",
  city: "",
  state: "IN",
  zip: "",
  county: "Allen",
  parcelId: "",
  ownerMailingAddress: "",
  sourceType: "SHERIFF_SALE",
  sourceUrl: "",
  sourceRef: "",
  sourceDate: "",
  distressScore: "60",
  signalType: "PRE_FORECLOSURE",
  signalWeight: "30",
  signalEvidence: "",
  arv: "",
  repairs: "",
  mao: "",
  acquisitionPrice: "",
  notes: "",
};

function sourceLabel(sourceType: string) {
  return SOURCE_TYPES.find((source) => source.value === sourceType)?.label ?? sourceType.replace(/_/g, " ");
}

function money(value?: number) {
  return value === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function scoreTone(score: number) {
  if (score >= 80) return "bg-teal-100/80 text-teal-800";
  if (score >= 60) return "bg-sky-100/80 text-sky-800";
  return "bg-amber-100/80 text-amber-800";
}

function peopleFindersUrl(lead: { propertyAddress?: string; city?: string; state?: string; zip?: string }) {
  const params = new URLSearchParams();
  if (lead.propertyAddress?.trim()) params.set("address", lead.propertyAddress.trim());
  if (lead.city?.trim()) params.set("city", lead.city.trim());
  if (lead.state?.trim()) params.set("state", lead.state.trim());
  if (lead.zip?.trim()) params.set("zip", lead.zip.trim());
  return `https://www.peoplefinders.com/address?${params.toString()}`;
}

function truePeopleSearchUrl(lead: { propertyAddress?: string; city?: string; state?: string; zip?: string }) {
  const params = new URLSearchParams();
  if (lead.propertyAddress?.trim()) params.set("streetaddress", lead.propertyAddress.trim());
  const cityStateZip = [lead.city?.trim(), lead.state?.trim(), lead.zip?.trim()].filter(Boolean).join(" ");
  if (cityStateZip) params.set("citystatezip", cityStateZip);
  return `https://www.truepeoplesearch.com/results?${params.toString()}`;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState("0");
  const [sourceType, setSourceType] = useState<SourceType | "ALL">("ALL");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [form, setForm] = useState<LeadFormState>(emptyForm);
  const [acquisitionPriceDraft, setAcquisitionPriceDraft] = useState("");
  const [skipTraceLoading, setSkipTraceLoading] = useState(false);
  const [ownerLoading, setOwnerLoading] = useState(false);

  const listLeads = useAction(api.mongodb.listLeads);
  const insertLead = useAction(api.mongodb.insertLead);
  const removeLead = useAction(api.mongodb.removeLead);
  const updateLead = useAction(api.mongodb.updateLead);
  const skipTraceLead = useAction(api.mongodb.skipTraceLead);
  const enrichOwnerFromRentCast = useAction(api.mongodb.enrichOwnerFromRentCast);
  const createApiCredential = useAction(api.apiAccess.createApiCredential);
  const listApiCredentials = useAction(api.apiAccess.listApiCredentials);
  const revokeApiCredential = useAction(api.apiAccess.revokeApiCredential);
  const enableApiCredential = useAction(api.apiAccess.enableApiCredential);
  const renewApiCredential = useAction(api.apiAccess.renewApiCredential);
  const approveApiCredential = useAction(api.apiAccess.approveApiCredential);
  const deleteApiCredential = useAction(api.apiAccess.deleteApiCredential);
  const [workspace, setWorkspace] = useState<MongoWorkspace>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showApiAccess, setShowApiAccess] = useState(false);
  const [apiCreds, setApiCreds] = useState<ApiCredential[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiNewName, setApiNewName] = useState("");
  const [apiNewScopes, setApiNewScopes] = useState<string[]>(["threads"]);
  const [apiRevealed, setApiRevealed] = useState<{ id: string; token: string; tokenPrefix: string } | null>(null);

  // Close the mobile navigation drawer on Escape.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);
  const isOwner = Boolean(
    user &&
      (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com"),
  );

  useEffect(() => {
    let cancelled = false;
    listLeads({
      search: search.trim() || undefined,
      pipelineStatus: "APPROVED",
      verificationStatus: "VERIFIED",
      minDistressScore: Number(minScore) || undefined,
      sourceType: sourceType === "ALL" ? undefined : sourceType,
    })
      .then((result) => {
        if (!cancelled) setWorkspace(result as unknown as MongoWorkspace);
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspace({ meta: { dataOrigin: "verified", live: false }, leads: [] });
          toast.error(error instanceof Error ? error.message : "Could not load MongoDB leads.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listLeads, refreshVersion, search, minScore, sourceType]);

  const leads = workspace?.leads ?? [];
  const selectedLead = leads.find((lead) => lead._id === selectedLeadId);
  const averageScore = leads.length ? Math.round(leads.reduce((total, lead) => total + lead.distressScore, 0) / leads.length) : 0;
  const sourceCount = new Set(leads.map((lead) => lead.sourceType)).size;

  const updateForm = (field: keyof LeadFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const loadApiCredentials = useCallback(async () => {
    setApiLoading(true);
    try {
      const result = await listApiCredentials();
      setApiCreds((result ?? []) as ApiCredential[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load API credentials.");
    } finally {
      setApiLoading(false);
    }
  }, [listApiCredentials]);

  const pendingCreds = apiCreds.filter((cred) => cred.status === "PENDING");

  const toggleScope = (scope: string) => {
    setApiNewScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));
  };

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success("Token copied to clipboard.");
    } catch {
      toast.error("Clipboard unavailable — select and copy the token manually.");
    }
  };

  const handleCreateCredential = async () => {
    try {
      const result = await createApiCredential({ name: apiNewName.trim(), scopes: apiNewScopes });
      setApiRevealed({ id: result.id, token: result.token, tokenPrefix: result.tokenPrefix });
      setApiNewName("");
      setApiNewScopes(["threads"]);
      await loadApiCredentials();
      toast.success("Credential issued. Copy the token now — it is shown only once.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue the credential.");
    }
  };

  const handleRevokeCredential = async (id: string) => {
    try {
      await revokeApiCredential({ id });
      await loadApiCredentials();
      toast.success("Access revoked — the token no longer works.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke.");
    }
  };

  const handleEnableCredential = async (id: string) => {
    try {
      await enableApiCredential({ id });
      await loadApiCredentials();
      toast.success("Credential re-enabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not re-enable.");
    }
  };

  const handleRenewCredential = async (id: string) => {
    try {
      const result = await renewApiCredential({ id });
      setApiRevealed({ id, token: result.token, tokenPrefix: result.tokenPrefix });
      await loadApiCredentials();
      toast.success("Token rotated — copy the new token.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rotate.");
    }
  };

  const handleApproveCredential = async (id: string) => {
    try {
      const result = await approveApiCredential({ id });
      setApiRevealed({ id, token: result.token, tokenPrefix: result.tokenPrefix });
      await loadApiCredentials();
      toast.success("Access request approved — a token was issued. Copy it now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve the request.");
    }
  };

  const handleDeleteCredential = async (id: string) => {
    try {
      await deleteApiCredential({ id });
      await loadApiCredentials();
      toast.success("Credential deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    }
  };

  const handleSelectLead = (lead: MongoLead) => {
    setSelectedLeadId(lead._id);
    setAcquisitionPriceDraft(lead.acquisitionPrice?.toString() ?? "");
  };

  const handleSaveAcquisitionPrice = async () => {
    if (!selectedLead) return;
    try {
      await updateLead({
        id: selectedLead._id,
        patch: {
          acquisitionPrice: acquisitionPriceDraft.trim() ? Number(acquisitionPriceDraft) : undefined,
        },
      });
      setRefreshVersion((version) => version + 1);
      toast.success("Deal economics saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the contract price.");
    }
  };

  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOwner) {
      toast.error("Only the permanent owner can add leads.");
      return;
    }
    try {
      await insertLead({
        lead: {
          propertyAddress: form.propertyAddress.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        zip: form.zip.trim(),
        county: form.county.trim(),
        parcelId: form.parcelId.trim() || undefined,
        ownerMailingAddress: form.ownerMailingAddress.trim() || undefined,
        sourceType: form.sourceType,
        sourceUrl: form.sourceUrl.trim(),
        sourceRef: form.sourceRef.trim(),
        sourceDate: form.sourceDate,
        distressScore: Number(form.distressScore),
        distressSignals: [{
          type: form.signalType.trim().toUpperCase(),
          weight: Number(form.signalWeight),
          evidence: form.signalEvidence.trim(),
          verified: true,
          sourceUrl: form.sourceUrl.trim(),
          sourceDate: form.sourceDate,
        }],
        verificationStatus: "VERIFIED",
        pipelineStatus: "APPROVED",
        absenteeOwner: Boolean(form.ownerMailingAddress.trim()),
        needsSkipTrace: false,
        listedPhone: false,
        arv: form.arv ? Number(form.arv) : undefined,
        repairs: form.repairs ? Number(form.repairs) : undefined,
        mao: form.mao ? Number(form.mao) : undefined,
        acquisitionPrice: form.acquisitionPrice ? Number(form.acquisitionPrice) : undefined,
        notes: form.notes.trim() || undefined,
        },
      });
      setForm(emptyForm);
      setShowAddLead(false);
      setRefreshVersion((version) => version + 1);
      toast.success("Verified lead added to MongoDB.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this lead.");
    }
  };

  const handleSkipTrace = async () => {
    if (!selectedLead) return;
    setSkipTraceLoading(true);
    try {
      await skipTraceLead({ id: selectedLead._id });
      setRefreshVersion((version) => version + 1);
      toast.success("Skip trace complete — contact data saved to the lead.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Skip trace failed.");
    } finally {
      setSkipTraceLoading(false);
    }
  };

  const handleOwnerEnrich = async () => {
    if (!selectedLead) return;
    setOwnerLoading(true);
    try {
      await enrichOwnerFromRentCast({ id: selectedLead._id });
      setRefreshVersion((version) => version + 1);
      toast.success("Owner info pulled from RentCast county records.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Owner lookup failed.");
    } finally {
      setOwnerLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedLead) return;
    if (!window.confirm("Delete this verified lead? This cannot be undone.")) return;
    try {
      await removeLead({ id: selectedLead._id });
      setSelectedLeadId(null);
      setRefreshVersion((version) => version + 1);
      toast.success("Lead removed from MongoDB.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this lead.");
    }
  };

  return (
    <main className="min-h-screen px-4 py-4 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1500px] gap-5">
        <aside className="glass-panel hidden w-[245px] shrink-0 flex-col rounded-[1.75rem] p-4 lg:flex">
          <Link to="/" className="flex items-center gap-3 px-3 py-3"><span className="flex size-9 items-center justify-center rounded-xl bg-white/75 shadow-sm"><Landmark className="size-4 text-sky-700" /></span><div><p className="text-sm font-bold tracking-tight text-slate-800">DealProof</p><p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-slate-500">Owner workspace</p></div></Link>
          <div className="my-5 h-px bg-white/75" />
          <nav className="space-y-1" aria-label="Workspace navigation">
            <div className="flex items-center gap-3 rounded-xl bg-white/78 px-3 py-2.5 text-sm font-semibold text-sky-800 shadow-sm"><Home className="size-4" /> Verified leads</div>
            <Link to="/operations" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-white/60 hover:text-sky-800"><BarChart3 className="size-4" /> Buyers & matches <Badge variant="outline" className="ml-auto border-white/80 bg-white/45 text-[0.6rem] text-slate-500">Open</Badge></Link>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500"><Database className="size-4" /> Source registry <Badge variant="outline" className="ml-auto border-white/80 bg-white/45 text-[0.6rem] text-slate-400">Soon</Badge></div>
            {isOwner && <button type="button" onClick={() => { setShowApiAccess(true); void loadApiCredentials(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-white/60 hover:text-sky-800"><KeyRound className="size-4" /> API access <Badge variant="outline" className="ml-auto border-white/80 bg-white/45 text-[0.6rem] text-slate-500">Owner</Badge></button>}
          </nav>
          <div className="mt-auto rounded-2xl border border-teal-100/90 bg-teal-50/55 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-teal-800"><ShieldCheck className="size-4" /> Integrity mode on</div><p className="mt-2 text-xs leading-5 text-teal-900/65">Only verified, non-fabricated records are surfaced.</p></div>
          <button type="button" onClick={handleSignOut} className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-white/65 hover:text-slate-800"><LogOut className="size-4" /> Sign out</button>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="glass-panel flex items-center justify-between rounded-[1.75rem] px-4 py-3 sm:px-6"><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileNavOpen(true)} className="flex size-9 items-center justify-center rounded-xl border border-white/80 bg-white/60 text-slate-600 lg:hidden" aria-label="Open navigation"><Menu className="size-4" /></button><div><p className="eyebrow">Verified lead workspace</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Your deal room, grounded.</h1></div></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-xs font-semibold text-slate-700">{user?.name || user?.email || "Owner"}</p><p className="text-[0.68rem] text-slate-500">{isOwner ? "Permanent owner" : "Read-only viewer"}</p></div><div className="flex size-9 items-center justify-center rounded-full border border-white/90 bg-sky-100/80 text-xs font-bold text-sky-800">{(user?.name || user?.email || "OW").slice(0, 2).toUpperCase()}</div></div></header>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Approved leads</p><ClipboardCheck className="size-4 text-teal-600" /></div><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{leads.length}</p><p className="mt-1 text-xs text-slate-500">Verified + non-fabricated</p></div>
            <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Average distress</p><CircleAlert className="size-4 text-sky-600" /></div><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{averageScore}<span className="ml-1 text-sm font-medium text-slate-400">/100</span></p><p className="mt-1 text-xs text-slate-500">Evidence-backed score</p></div>
            <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Source channels</p><Database className="size-4 text-sky-600" /></div><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{sourceCount}</p><p className="mt-1 text-xs text-slate-500">Active in this view</p></div>
            <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Data origin</p><ShieldCheck className="size-4 text-teal-600" /></div><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Verified</p><p className="mt-1 text-xs text-slate-500">Simulation disabled</p></div>
          </div>

          <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="relative min-w-0 flex-1 xl:max-w-xl"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search address, county, parcel, or source ref" className="h-11 rounded-2xl border-white/85 bg-white/65 pl-10 shadow-sm backdrop-blur-xl placeholder:text-slate-400" /></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setShowFilters((visible) => !visible)} className="h-11 gap-2 rounded-2xl border-white/85 bg-white/62 text-slate-700 shadow-sm"><SlidersHorizontal className="size-4" /> Filters{(sourceType !== "ALL" || minScore !== "0") && <span className="flex size-5 items-center justify-center rounded-full bg-sky-100 text-[0.65rem] font-bold text-sky-700">!</span>}</Button>{isOwner && <Button type="button" onClick={() => setShowAddLead(true)} className="h-11 gap-2 rounded-2xl bg-sky-700 px-4 shadow-[0_8px_20px_rgb(14_116_144_/_0.18)] hover:bg-sky-800"><Plus className="size-4" /> Add verified lead</Button>}</div></div>

          {showFilters && <div className="glass-inset mt-3 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-end"><label className="grid gap-1.5 text-xs font-semibold text-slate-600">Minimum distress score<input type="number" min="0" max="100" value={minScore} onChange={(event) => setMinScore(event.target.value)} className="h-10 w-full rounded-xl border border-white/85 bg-white/70 px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/30 sm:w-44" /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-600">Source type<select value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceType | "ALL")} className="h-10 w-full rounded-xl border border-white/85 bg-white/70 px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/30 sm:w-52"><option value="ALL">All source types</option>{SOURCE_TYPES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label><button type="button" onClick={() => { setMinScore("0"); setSourceType("ALL"); }} className="h-10 px-2 text-xs font-semibold text-sky-700 hover:text-sky-900">Clear filters</button></div>}

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="glass-panel overflow-hidden rounded-[1.75rem]"><div className="flex items-center justify-between border-b border-white/70 px-4 py-4 sm:px-5"><div><h2 className="text-sm font-semibold text-slate-800">Approved lead queue</h2><p className="mt-1 text-xs text-slate-500">Showing source-backed records only</p></div><Badge className="border-0 bg-teal-100/75 text-teal-800">{workspace?.meta.dataOrigin ?? "verified"}</Badge></div>{workspace === undefined ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="size-5 animate-spin text-sky-600" /></div> : leads.length === 0 ? <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center"><div className="flex size-14 items-center justify-center rounded-2xl bg-white/75 text-sky-700 shadow-sm"><FilePlus2 className="size-6" /></div><h3 className="mt-5 text-base font-semibold text-slate-800">No sourced records yet</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">This workspace will never fill itself with invented PII. Add a verified public-record lead with its evidence chain to get started.</p>{isOwner && <Button type="button" onClick={() => setShowAddLead(true)} className="mt-5 gap-2 rounded-xl bg-sky-700 hover:bg-sky-800"><Plus className="size-4" /> Add first verified lead</Button>}</div> : <div className="divide-y divide-white/70">{leads.map((lead) => <button type="button" key={lead._id} onClick={() => handleSelectLead(lead)} className="group grid w-full gap-4 px-4 py-4 text-left transition-colors hover:bg-white/45 sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:items-center sm:px-5"><div className="min-w-0"><div className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-sky-600" /><p className="truncate text-sm font-semibold text-slate-800">{lead.propertyAddress}</p></div><p className="mt-1 truncate pl-6 text-xs text-slate-500">{lead.city}, {lead.state} {lead.zip} · {lead.county} County</p><div className="mt-2 flex flex-wrap gap-1.5 pl-6"><Badge variant="outline" className="border-white/90 bg-white/50 text-[0.65rem] font-medium text-slate-600">{sourceLabel(lead.sourceType)}</Badge><Badge variant="outline" className="border-teal-200/80 bg-teal-50/50 text-[0.65rem] font-medium text-teal-700"><Check className="mr-1 size-3" /> Verified</Badge></div></div><div className="hidden sm:block"><p className="text-[0.68rem] font-medium uppercase tracking-[0.12em] text-slate-400">Distress</p><div className="mt-1.5 flex items-center gap-2"><span className={`rounded-lg px-2 py-1 text-sm font-bold ${scoreTone(lead.distressScore)}`}>{lead.distressScore}</span><span className="text-xs text-slate-500">/ 100</span></div></div><div className="flex items-center justify-between sm:justify-end"><span className="text-xs font-medium text-slate-500 sm:hidden">Distress <strong className="text-slate-800">{lead.distressScore}/100</strong></span><ChevronRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-600" /></div></button>)}</div>}</div>

            <div className="glass-panel rounded-[1.75rem] p-5"><div className="flex items-center gap-2"><div className="flex size-9 items-center justify-center rounded-xl bg-sky-100/75 text-sky-700"><Filter className="size-4" /></div><div><h2 className="text-sm font-semibold text-slate-800">Quality rules</h2><p className="text-xs text-slate-500">Applied to every surfaced record</p></div></div><div className="mt-5 space-y-3">{["Source URL + reference required", "Verified distress evidence required", "Fabricated rows excluded", "Owner-only lead writes"].map((rule) => <div key={rule} className="flex items-start gap-2.5 text-xs leading-5 text-slate-600"><Check className="mt-0.5 size-3.5 shrink-0 text-teal-600" />{rule}</div>)}</div>          <div className="mt-6 border-t border-white/70 pt-5"><p className="text-xs font-semibold text-slate-700">Mongo workflow</p><p className="mt-2 text-xs leading-5 text-slate-500">Review buyer intake and manage candidate matches from the owner operations board.</p><Link to="/operations" className="mt-3 inline-flex text-xs font-semibold text-sky-700 hover:text-sky-900">Open buyers & matches <ChevronRight className="ml-1 size-3.5" /></Link></div></div>
          </div>
        </section>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px]" onClick={() => setMobileNavOpen(false)} />
          <div className="glass-panel-strong absolute inset-y-3 left-3 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto rounded-[1.75rem] p-4">
            <div className="flex items-center justify-between gap-3"><Link to="/" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3 px-3 py-3"><span className="flex size-9 items-center justify-center rounded-xl bg-white/75 shadow-sm"><Landmark className="size-4 text-sky-700" /></span><div><p className="text-sm font-bold tracking-tight text-slate-800">DealProof</p><p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-slate-500">Owner workspace</p></div></Link><button type="button" onClick={() => setMobileNavOpen(false)} className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/60 text-slate-500" aria-label="Close navigation"><X className="size-4" /></button></div>
            <div className="my-3 h-px bg-white/75" />
            <nav className="space-y-1" aria-label="Workspace navigation">
              <div className="flex items-center gap-3 rounded-xl bg-white/78 px-3 py-2.5 text-sm font-semibold text-sky-800 shadow-sm"><Home className="size-4" /> Verified leads</div>
              <Link to="/operations" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-white/60 hover:text-sky-800"><BarChart3 className="size-4" /> Buyers & matches <Badge variant="outline" className="ml-auto border-white/80 bg-white/45 text-[0.6rem] text-slate-500">Open</Badge></Link>
              <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500"><Database className="size-4" /> Source registry <Badge variant="outline" className="ml-auto border-white/80 bg-white/45 text-[0.6rem] text-slate-400">Soon</Badge></div>
              {isOwner && <button type="button" onClick={() => { setMobileNavOpen(false); setShowApiAccess(true); void loadApiCredentials(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-white/60 hover:text-sky-800"><KeyRound className="size-4" /> API access <Badge variant="outline" className="ml-auto border-white/80 bg-white/45 text-[0.6rem] text-slate-500">Owner</Badge></button>}
            </nav>
            <div className="mt-auto rounded-2xl border border-teal-100/90 bg-teal-50/55 p-4"><div className="flex items-center gap-2 text-xs font-semibold text-teal-800"><ShieldCheck className="size-4" /> Integrity mode on</div><p className="mt-2 text-xs leading-5 text-teal-900/65">Only verified, non-fabricated records are surfaced.</p></div>
            <button type="button" onClick={handleSignOut} className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-white/65 hover:text-slate-800"><LogOut className="size-4" /> Sign out</button>
          </div>
        </div>
      )}

      {selectedLead && <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/10 p-3 backdrop-blur-[2px]" onClick={(event) => { if (event.target === event.currentTarget) setSelectedLeadId(null); }}><aside className="glass-panel-strong h-full w-full max-w-md overflow-y-auto rounded-[1.75rem] p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="eyebrow">Lead dossier</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Verified record</h2></div><button type="button" onClick={() => setSelectedLeadId(null)} className="flex size-9 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-500 hover:text-slate-800" aria-label="Close lead details"><X className="size-4" /></button></div><div className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/85 bg-white/55"><div className="bg-gradient-to-br from-sky-50/90 via-white/35 to-teal-50/70 p-5"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/90 bg-white/80 text-sky-700 shadow-sm"><MapPin className="size-5" /></div><div><p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-sky-700/75">Property profile</p><p className="mt-1.5 text-lg font-semibold leading-6 tracking-tight text-slate-900">{selectedLead.propertyAddress}</p><p className="mt-1 text-sm text-slate-500">{selectedLead.city}, {selectedLead.state} {selectedLead.zip}</p><p className="mt-1 text-xs font-medium text-slate-400">{selectedLead.county} County</p></div></div><Badge className="shrink-0 border-0 bg-teal-100/85 text-[0.65rem] text-teal-800"><Check className="mr-1 size-3" />Verified</Badge></div><div className="mt-5 flex flex-wrap items-center gap-2 text-[0.68rem] font-medium text-slate-500"><span className="rounded-full border border-white/90 bg-white/65 px-2.5 py-1">{sourceLabel(selectedLead.sourceType)}</span><span className="rounded-full border border-white/90 bg-white/65 px-2.5 py-1">{selectedLead.pipelineStatus}</span>{selectedLead.parcelId && <span className="rounded-full border border-white/90 bg-white/65 px-2.5 py-1">Parcel {selectedLead.parcelId}</span>}</div></div><div className="grid grid-cols-2 divide-x divide-white/75 border-t border-white/75 bg-white/35"><div className="p-3.5"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Last verified</p><p className="mt-1 text-xs font-semibold text-slate-700">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
                    typeof selectedLead.lastVerifiedAt === "string"
                      ? new Date(selectedLead.lastVerifiedAt)
                      : selectedLead.lastVerifiedAt,
                  )}</p></div><div className="p-3.5"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Record status</p><p className="mt-1 text-xs font-semibold text-teal-700">Source-backed</p></div></div></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="glass-inset rounded-2xl p-3.5"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-slate-500">Distress</p><p className={`mt-2 inline-flex rounded-lg px-2 py-1 text-base font-bold ${scoreTone(selectedLead.distressScore)}`}>{selectedLead.distressScore}<span className="ml-1 text-[0.62rem] font-medium">/100</span></p><p className="mt-1 text-[0.65rem] text-slate-500">Evidence score</p></div><div className="glass-inset rounded-2xl p-3.5"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-slate-500">ARV</p><p className="mt-3 text-sm font-semibold text-slate-800">{money(selectedLead.arv)}</p><p className="mt-1 text-[0.65rem] text-slate-500">Estimated value</p></div><div className="glass-inset rounded-2xl p-3.5"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-slate-500">MAO</p><p className="mt-3 text-sm font-semibold text-slate-800">{money(selectedLead.mao)}</p><p className="mt-1 text-[0.65rem] text-slate-500">Buyer ceiling</p></div><div className="glass-inset rounded-2xl border border-teal-100/80 bg-teal-50/45 p-3.5"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-teal-700">Est. spread</p><p className={`mt-3 text-sm font-semibold ${selectedLead.estimatedProfit === undefined ? "text-slate-500" : selectedLead.estimatedProfit >= 0 ? "text-teal-800" : "text-rose-700"}`}>{selectedLead.estimatedProfit === undefined ? "Needs price" : money(selectedLead.estimatedProfit)}</p><p className="mt-1 text-[0.65rem] text-teal-900/60">Before costs</p></div></div><div className="mt-6 rounded-2xl border border-sky-100/80 bg-sky-50/45 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">Deal economics</h3><p className="mt-1 text-xs text-slate-500">MAO minus your contract price, before transaction costs.</p></div><CircleAlert className="size-4 text-sky-600" /></div><div className="mt-3 flex gap-2"><Input value={acquisitionPriceDraft} onChange={(event) => setAcquisitionPriceDraft(event.target.value)} placeholder="Your contract price" type="number" min="0" className="h-10 rounded-xl border-white/85 bg-white/75" /><Button type="button" onClick={handleSaveAcquisitionPrice} className="h-10 shrink-0 rounded-xl bg-sky-700 px-4 text-xs hover:bg-sky-800">Save price</Button></div></div><div className="mt-6"><div><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Profile snapshot</h3><span className="text-[0.65rem] font-medium text-slate-400">Verified facts</span></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Owner mailing</p><p className="mt-1 text-xs font-medium leading-5 text-slate-700">{selectedLead.ownerMailingAddress || "Not recorded"}</p></div><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Absentee owner</p><p className="mt-1 text-xs font-semibold text-slate-700">{selectedLead.absenteeOwner ? "Yes" : "No"}</p></div><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Phone status</p><p className="mt-1 text-xs font-semibold text-slate-700">{selectedLead.listedPhone ? "Listed" : "Not listed"}</p></div><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Skip trace</p><p className="mt-1 text-xs font-semibold text-slate-700">{selectedLead.needsSkipTrace ? "Needed" : "Not needed"}</p></div></div></div><div className="mt-6"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Contact & skip trace</h3><span className="text-[0.65rem] font-medium text-slate-400">Sourced, never invented</span></div><div className="mt-3 rounded-2xl border border-white/80 bg-white/45 p-4"><div className="flex flex-wrap gap-2"><Button type="button" onClick={handleOwnerEnrich} disabled={!isOwner || ownerLoading} className="h-9 gap-2 rounded-xl bg-teal-700 px-3 text-xs hover:bg-teal-800 disabled:opacity-60">{ownerLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Building2 className="size-3.5" />} Pull owner (free)</Button><Button type="button" onClick={handleSkipTrace} disabled={!isOwner || skipTraceLoading} className="h-9 gap-2 rounded-xl bg-sky-700 px-3 text-xs hover:bg-sky-800 disabled:opacity-60">{skipTraceLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Phone className="size-3.5" />} Run skip trace</Button><a href={truePeopleSearchUrl(selectedLead)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/85 bg-white/60 px-3 text-xs font-semibold text-slate-700 hover:text-sky-800"><ExternalLink className="size-3.5" /> TruePeopleSearch</a><a href={peopleFindersUrl(selectedLead)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/85 bg-white/60 px-3 text-xs font-semibold text-slate-700 hover:text-sky-800"><ExternalLink className="size-3.5" /> PeopleFinders</a></div>{selectedLead.ownerNames && selectedLead.ownerNames.length > 0 ? <div className="mt-3 rounded-xl border border-teal-100/80 bg-teal-50/45 px-3 py-2"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-teal-700">Owner on record</p><p className="mt-1 text-xs font-semibold text-slate-800">{selectedLead.ownerNames.join("; ")}</p><p className="mt-1 text-[0.68rem] leading-4 text-slate-500">{selectedLead.ownerMailingAddress || "No mailing address published"}{selectedLead.ownerType ? ` · ${selectedLead.ownerType}` : ""}</p><p className="mt-1 text-[0.62rem] text-slate-400">Source: RentCast county records{selectedLead.ownerLookup?.sourceDate ? ` · ${selectedLead.ownerLookup.sourceDate}` : ""}</p></div> : null}{selectedLead.skipTrace?.phones && selectedLead.skipTrace.phones.length > 0 ? <div className="mt-4 space-y-2">{selectedLead.skipTrace.phones.map((phone) => <div key={phone.number} className="flex items-center justify-between gap-3 rounded-xl border border-teal-100/80 bg-teal-50/45 px-3 py-2"><div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{phone.number}</p><p className="truncate text-[0.65rem] text-slate-500">{[phone.type, phone.listingName, phone.carrier].filter(Boolean).join(" · ")}</p></div>{phone.possibleSubject && <Badge className="shrink-0 border-0 bg-teal-100/85 text-[0.6rem] text-teal-800">Subject</Badge>}</div>)}{selectedLead.skipTrace.emails && selectedLead.skipTrace.emails.length > 0 && <div className="pt-1"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Emails</p><div className="mt-1 space-y-1">{selectedLead.skipTrace.emails.map((email) => <p key={email} className="text-xs font-medium text-slate-700">{email}</p>)}</div></div>}<p className="pt-2 text-[0.65rem] text-slate-400">Source: Searchbug · {selectedLead.skipTrace.sourceDate ?? "recent"}</p></div> : <p className="mt-3 text-xs leading-5 text-slate-500">No phone data recorded yet. Pull the owner (free, from RentCast county records) for the mailing address, or use the skip trace / free lookups for phone numbers, then paste results into the owner notes.</p>}</div></div><div className="mt-6"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Evidence chain</h3><Badge variant="outline" className="border-white/90 bg-white/55 text-xs text-slate-600">{sourceLabel(selectedLead.sourceType)}</Badge></div><div className="mt-3 rounded-2xl border border-white/80 bg-white/45 p-4"><div className="grid gap-3 text-xs"><div><p className="font-semibold text-slate-500">Source reference</p><p className="mt-1 font-medium text-slate-800">{selectedLead.sourceRef}</p></div><div><p className="font-semibold text-slate-500">Source date</p><p className="mt-1 font-medium text-slate-800">{selectedLead.sourceDate}</p></div><a href={selectedLead.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-sky-700 hover:text-sky-900">Open source record <ArrowUpRight className="size-3.5" /></a></div></div></div><div className="mt-6"><h3 className="text-sm font-semibold text-slate-800">Verified signals</h3><div className="mt-3 space-y-2">{selectedLead.distressSignals.map((signal) => <div key={`${signal.type}-${signal.sourceDate}`} className="rounded-2xl border border-teal-100/80 bg-teal-50/45 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-teal-900">{signal.type.replace(/_/g, " ")}</p><span className="text-xs font-bold text-teal-700">+{signal.weight}</span></div><p className="mt-1 text-xs leading-5 text-slate-600">{signal.evidence}</p></div>)}</div></div><div className="mt-6 grid grid-cols-3 gap-2"><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-500">ARV</p><p className="mt-1 text-xs font-semibold text-slate-800">{money(selectedLead.arv)}</p></div><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-500">Repairs</p><p className="mt-1 text-xs font-semibold text-slate-800">{money(selectedLead.repairs)}</p></div><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-500">MAO</p><p className="mt-1 text-xs font-semibold text-slate-800">{money(selectedLead.mao)}</p></div><div className="glass-inset rounded-xl border border-teal-100/80 bg-teal-50/45 p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-teal-700">Est. spread</p><p className="mt-1 text-xs font-semibold text-teal-800">{selectedLead.estimatedProfit === undefined ? "Needs price" : money(selectedLead.estimatedProfit)}</p></div></div>{selectedLead.notes && <div className="mt-5 rounded-2xl border border-white/80 bg-white/45 p-4"><p className="text-xs font-semibold text-slate-500">Owner notes</p><p className="mt-1 text-sm leading-6 text-slate-700">{selectedLead.notes}</p></div>}<div className="mt-7 border-t border-white/70 pt-5"><Button type="button" variant="outline" onClick={handleDelete} disabled={!isOwner} className="w-full gap-2 rounded-xl border-red-200/80 bg-red-50/45 text-red-700 hover:bg-red-50"><Trash2 className="size-4" /> Delete record</Button><p className="mt-2 text-center text-[0.68rem] text-slate-400">Delete is permanently owner-authorized.</p></div></div></aside></div>}

      {showAddLead && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/15 p-3 backdrop-blur-sm sm:items-center" onClick={(event) => { if (event.target === event.currentTarget) setShowAddLead(false); }}><div className="glass-panel-strong max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] p-5 sm:p-7"><div className="flex items-start justify-between gap-5"><div><p className="eyebrow">Owner input</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Add a verified lead</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">No generated names, phones, or addresses. This form only accepts a record you can tie back to a real source.</p></div><button type="button" onClick={() => setShowAddLead(false)} className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-500" aria-label="Close add lead form"><X className="size-4" /></button></div><form onSubmit={handleCreateLead} className="mt-7 grid gap-5"><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Property</p><div className="grid gap-3 sm:grid-cols-2"><Input required value={form.propertyAddress} onChange={(event) => updateForm("propertyAddress", event.target.value)} placeholder="Property address" className="sm:col-span-2 rounded-xl border-white/85 bg-white/65" /><Input required value={form.city} onChange={(event) => updateForm("city", event.target.value)} placeholder="City" className="rounded-xl border-white/85 bg-white/65" /><Input required value={form.state} onChange={(event) => updateForm("state", event.target.value)} placeholder="State" maxLength={2} className="rounded-xl border-white/85 bg-white/65" /><Input required value={form.zip} onChange={(event) => updateForm("zip", event.target.value)} placeholder="ZIP" className="rounded-xl border-white/85 bg-white/65" /><Input required value={form.county} onChange={(event) => updateForm("county", event.target.value)} placeholder="County" className="rounded-xl border-white/85 bg-white/65" /><Input value={form.parcelId} onChange={(event) => updateForm("parcelId", event.target.value)} placeholder="Parcel ID (optional)" className="rounded-xl border-white/85 bg-white/65" /><Input value={form.ownerMailingAddress} onChange={(event) => updateForm("ownerMailingAddress", event.target.value)} placeholder="Owner mailing address (optional)" className="sm:col-span-2 rounded-xl border-white/85 bg-white/65" /></div></div><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Source & evidence</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Source type</span><select required value={form.sourceType} onChange={(event) => updateForm("sourceType", event.target.value)} className="h-10 rounded-xl border border-white/85 bg-white/70 px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/30">{SOURCE_TYPES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Source date</span><input required type="date" value={form.sourceDate} onChange={(event) => updateForm("sourceDate", event.target.value)} className="h-10 rounded-xl border border-white/85 bg-white/70 px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/30" /></label><Input required value={form.sourceUrl} onChange={(event) => updateForm("sourceUrl", event.target.value)} placeholder="Source URL" type="url" className="rounded-xl border-white/85 bg-white/65" /><Input required value={form.sourceRef} onChange={(event) => updateForm("sourceRef", event.target.value)} placeholder="Source reference / case #" className="rounded-xl border-white/85 bg-white/65" /><Input required value={form.signalType} onChange={(event) => updateForm("signalType", event.target.value)} placeholder="Signal type e.g. PRE_FORECLOSURE" className="rounded-xl border-white/85 bg-white/65" /><Input required value={form.signalWeight} onChange={(event) => updateForm("signalWeight", event.target.value)} placeholder="Signal weight" type="number" min="0" className="rounded-xl border-white/85 bg-white/65" /><textarea required value={form.signalEvidence} onChange={(event) => updateForm("signalEvidence", event.target.value)} placeholder="What does the source prove?" className="min-h-20 rounded-xl border border-white/85 bg-white/65 px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500/30 sm:col-span-2" /><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Distress score</span><input required type="number" min="0" max="100" value={form.distressScore} onChange={(event) => updateForm("distressScore", event.target.value)} className="h-10 rounded-xl border border-white/85 bg-white/70 px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/30" /></label></div></div><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Optional underwriting</p><div className="grid gap-3 sm:grid-cols-3"><Input value={form.arv} onChange={(event) => updateForm("arv", event.target.value)} placeholder="ARV" type="number" className="rounded-xl border-white/85 bg-white/65" /><Input value={form.repairs} onChange={(event) => updateForm("repairs", event.target.value)} placeholder="Repairs" type="number" className="rounded-xl border-white/85 bg-white/65" /><Input value={form.mao} onChange={(event) => updateForm("mao", event.target.value)} placeholder="MAO / buyer price" type="number" className="rounded-xl border-white/85 bg-white/65" /><Input value={form.acquisitionPrice} onChange={(event) => updateForm("acquisitionPrice", event.target.value)} placeholder="Your contract price" type="number" className="rounded-xl border-white/85 bg-white/65" /><textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Owner notes (optional)" className="min-h-20 rounded-xl border border-white/85 bg-white/65 px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500/30 sm:col-span-3" /></div></div><div className="flex flex-col-reverse gap-2 border-t border-white/70 pt-5 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={() => setShowAddLead(false)} className="rounded-xl text-slate-600">Cancel</Button><Button type="submit" className="gap-2 rounded-xl bg-sky-700 px-5 hover:bg-sky-800"><Plus className="size-4" /> Save verified lead</Button></div></form></div></div>}
      {showApiAccess && isOwner && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/15 p-3 backdrop-blur-sm sm:items-center" onClick={(event) => { if (event.target === event.currentTarget) setShowApiAccess(false); }}>
          <div className="glass-panel-strong max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="eyebrow">Owner control</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">API access</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Only your master keys and the credentials you issue here can call the API. Tokens are shown once, stored only as hashes, and stop working the moment you revoke them.</p>
              </div>
              <button type="button" onClick={() => setShowApiAccess(false)} className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-500" aria-label="Close API access"><X className="size-4" /></button>
            </div>

            {apiRevealed && (
              <div className="mt-6 rounded-2xl border border-teal-100/90 bg-teal-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Token issued — copy it now</p>
                  <button type="button" onClick={() => copyToken(apiRevealed.token)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800"><Copy className="size-3.5" /> Copy</button>
                </div>
                <p className="mt-2 break-all rounded-xl border border-teal-200/70 bg-white/75 px-3 py-2 font-mono text-xs text-slate-800">{apiRevealed.token}</p>
                <p className="mt-2 text-[0.68rem] leading-4 text-teal-900/60">This is the only time the full token is shown. Treat it like a password — paste it into the agent's config (e.g. Odysseus), never into chat or code.</p>
              </div>
            )}

            {pendingCreds.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pending requests</p>
                <div className="mt-2 space-y-2">
                  {pendingCreds.map((cred) => (
                    <div key={cred.id} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-100/90 bg-amber-50/50 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{cred.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{cred.scopes.map((s) => API_SCOPE_LABELS[s] ?? s).join(" · ")}{cred.note ? ` — ${cred.note}` : ""}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" onClick={() => handleApproveCredential(cred.id)} className="h-8 gap-1.5 rounded-lg bg-teal-700 px-3 text-xs hover:bg-teal-800"><Check className="size-3.5" /> Approve</Button>
                        <Button type="button" variant="outline" onClick={() => handleDeleteCredential(cred.id)} className="h-8 gap-1.5 rounded-lg border-red-200/80 bg-red-50/45 px-3 text-xs text-red-700 hover:bg-red-50"><Trash2 className="size-3.5" /> Deny</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-white/80 bg-white/45 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Issue a credential</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-semibold text-slate-600">
                  <span>Name (agent or integration)</span>
                  <Input value={apiNewName} onChange={(event) => setApiNewName(event.target.value)} placeholder="e.g. Odysseus" className="rounded-xl border-white/85 bg-white/70" />
                </label>
                <Button type="button" onClick={handleCreateCredential} disabled={apiNewName.trim().length < 2 || apiNewScopes.length === 0} className="h-10 shrink-0 gap-2 rounded-xl bg-sky-700 px-4 text-xs hover:bg-sky-800 disabled:opacity-50"><KeyRound className="size-4" /> Issue token</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {API_SCOPE_OPTIONS.map((option) => {
                  const active = apiNewScopes.includes(option.value);
                  return (
                    <button key={option.value} type="button" onClick={() => toggleScope(option.value)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-sky-300/80 bg-sky-100/80 text-sky-800" : "border-white/85 bg-white/55 text-slate-500 hover:text-slate-700"}`}>
                      <Check className={`size-3 ${active ? "opacity-100" : "opacity-0"}`} /> {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Credentials</p>
              {apiLoading ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="size-4 animate-spin text-sky-600" /> Loading credentials…</div>
              ) : apiCreds.length === 0 ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">No credentials issued yet. Everyone except your master keys is blocked until you create one.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {apiCreds.map((cred) => (
                    <div key={cred.id} className="rounded-2xl border border-white/80 bg-white/45 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800">{cred.name}</p>
                            <Badge variant="outline" className={`border-white/85 ${cred.status === "ACTIVE" ? "bg-teal-50/60 text-teal-700" : cred.status === "PENDING" ? "bg-amber-50/60 text-amber-700" : "bg-rose-50/60 text-rose-700"}`}>{cred.status === "ACTIVE" ? "Active" : cred.status === "PENDING" ? "Pending" : "Revoked"}</Badge>
                            <span className="font-mono text-[0.65rem] text-slate-400">{cred.tokenPrefix}…</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{cred.scopes.map((s) => API_SCOPE_LABELS[s] ?? s).join(" · ")}{cred.note ? ` — ${cred.note}` : ""}</p>
                          <p className="mt-0.5 text-[0.65rem] text-slate-400">Issued {new Date(cred.createdAt).toLocaleDateString()}{cred.lastUsedAt ? ` · last used ${new Date(cred.lastUsedAt).toLocaleString()}` : " · never used"}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {cred.status === "PENDING" && (
                            <>
                              <Button type="button" onClick={() => handleApproveCredential(cred.id)} className="h-8 gap-1.5 rounded-lg bg-teal-700 px-3 text-xs hover:bg-teal-800"><Check className="size-3.5" /> Approve</Button>
                              <Button type="button" variant="outline" onClick={() => handleDeleteCredential(cred.id)} className="h-8 gap-1.5 rounded-lg border-red-200/80 bg-red-50/45 px-3 text-xs text-red-700 hover:bg-red-50"><Trash2 className="size-3.5" /></Button>
                            </>
                          )}
                          {cred.status === "ACTIVE" && (
                            <>
                              <Button type="button" variant="outline" onClick={() => handleRenewCredential(cred.id)} className="h-8 gap-1.5 rounded-lg border-white/85 bg-white/60 px-3 text-xs text-slate-600 hover:text-sky-800"><RefreshCw className="size-3.5" /> Rotate</Button>
                              <Button type="button" variant="outline" onClick={() => handleRevokeCredential(cred.id)} className="h-8 gap-1.5 rounded-lg border-red-200/80 bg-red-50/45 px-3 text-xs text-red-700 hover:bg-red-50"><ShieldCheck className="size-3.5" /> Revoke</Button>
                            </>
                          )}
                          {cred.status === "REVOKED" && (
                            <Button type="button" variant="outline" onClick={() => handleEnableCredential(cred.id)} className="h-8 gap-1.5 rounded-lg border-white/85 bg-white/60 px-3 text-xs text-slate-600 hover:text-teal-800"><Check className="size-3.5" /> Re-enable</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
