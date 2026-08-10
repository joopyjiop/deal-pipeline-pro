import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useAction } from "convex/react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Handshake,
  Landmark,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type Buyer = {
  _id: string;
  name: string;
  phone: string;
  email: string;
  budgetMin: number;
  budgetMax: number;
  targetAreas: string[];
  exitType: string;
  proofOfFundsStatus: string;
  intakeStatus: "PENDING" | "APPROVED" | "REJECTED";
  verificationStatus: string;
};

type Lead = {
  _id: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  mao?: number;
  distressScore: number;
  estimatedProfit?: number;
};

type Match = {
  _id: string;
  leadId: string;
  buyerId: string;
  matchScore: number;
  buyBoxSummary: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  status: "CANDIDATE" | "APPROVED" | "REJECTED" | "CONTACTED" | "CLOSED";
  rejectReason?: string;
};

type BuyerFilter = "ALL" | Buyer["intakeStatus"];
type MatchFilter = "ALL" | Match["status"];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function money(value: number) {
  return currency.format(value);
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function pretty(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function Operations() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isOwner = Boolean(
    user &&
      (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com"),
  );
  const listBuyers = useAction(api.mongodb.listBuyers);
  const updateBuyer = useAction(api.mongodb.updateBuyer);
  const listLeads = useAction(api.mongodb.listLeads);
  const listMatches = useAction(api.mongodb.listMatches);
  const insertMatch = useAction(api.mongodb.insertMatch);
  const updateMatch = useAction(api.mongodb.updateMatch);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [buyerFilter, setBuyerFilter] = useState<BuyerFilter>("PENDING");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("ALL");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [matchForm, setMatchForm] = useState({
    leadId: "",
    buyerId: "",
    matchScore: "75",
    confidence: "MEDIUM" as Match["confidence"],
    buyBoxSummary: "",
  });

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    Promise.all([
      listBuyers({}),
      listLeads({ pipelineStatus: "APPROVED", verificationStatus: "VERIFIED" }),
      listMatches({ status: matchFilter === "ALL" ? undefined : matchFilter }),
    ])
      .then(([buyerRows, leadResult, matchRows]) => {
        if (cancelled) return;
        setBuyers(buyerRows as Buyer[]);
        setLeads((leadResult as unknown as { leads: Lead[] }).leads);
        setMatches(matchRows as Match[]);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load the operations board.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyerFilter, isOwner, listBuyers, listLeads, listMatches, matchFilter, refreshVersion]);

  const approvedBuyers = useMemo(() => buyers.filter((buyer) => buyer.intakeStatus === "APPROVED"), [buyers]);
  const visibleBuyers = useMemo(
    () => buyerFilter === "ALL" ? buyers : buyers.filter((buyer) => buyer.intakeStatus === buyerFilter),
    [buyerFilter, buyers],
  );
  const pendingCount = buyers.filter((buyer) => buyer.intakeStatus === "PENDING").length;
  const buyerById = useMemo(() => new Map(buyers.map((buyer) => [buyer._id, buyer])), [buyers]);
  const leadById = useMemo(() => new Map(leads.map((lead) => [lead._id, lead])), [leads]);

  const refresh = () => {
    setLoading(true);
    setRefreshVersion((version) => version + 1);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleBuyerDecision = async (buyer: Buyer, decision: "APPROVED" | "REJECTED") => {
    try {
      await updateBuyer({
        id: buyer._id,
        patch: {
          intakeStatus: decision,
          verificationStatus: decision === "APPROVED" ? "VERIFIED" : "UNVERIFIED",
        },
      });
      toast.success(decision === "APPROVED" ? "Buyer approved for matching." : "Buyer rejected.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this buyer.");
    }
  };

  const handleCreateMatch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await insertMatch({
        match: {
          leadId: matchForm.leadId,
          buyerId: matchForm.buyerId,
          matchScore: Number(matchForm.matchScore),
          buyBoxSummary: matchForm.buyBoxSummary.trim(),
          confidence: matchForm.confidence,
          status: "CANDIDATE",
        },
      });
      setMatchForm({ leadId: "", buyerId: "", matchScore: "75", confidence: "MEDIUM", buyBoxSummary: "" });
      setShowMatchForm(false);
      toast.success("Candidate match saved to MongoDB.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create this match.");
    }
  };

  const handleMatchStatus = async (match: Match, status: Match["status"]) => {
    try {
      await updateMatch({ id: match._id, patch: { status, rejectReason: status === "REJECTED" ? "Rejected during owner review" : undefined } });
      toast.success(`Match marked ${pretty(status).toLowerCase()}.`);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this match.");
    }
  };

  if (!isOwner) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <div className="glass-panel-strong max-w-md rounded-[2rem] p-8">
          <ShieldCheck className="mx-auto size-10 text-sky-700" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Owner workspace only</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">The buyer registry and match board contain private pipeline data and are restricted to the permanent owner.</p>
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
            <Link to="/dashboard" className="flex size-9 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-600 transition-colors hover:text-sky-700" aria-label="Back to verified leads"><ArrowLeft className="size-4" /></Link>
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/75 text-sky-700 shadow-sm"><Landmark className="size-4" /></div>
            <div><p className="eyebrow">Mongo operations</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Buyers & matches</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={refresh} className="gap-2 rounded-xl border-white/85 bg-white/60 text-slate-700"><RefreshCw className="size-4" /> Refresh</Button>
            <button type="button" onClick={handleSignOut} className="flex size-10 items-center justify-center rounded-xl border border-white/85 bg-white/60 text-slate-500 hover:text-slate-800" aria-label="Sign out"><LogOut className="size-4" /></button>
          </div>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Buyer queue</p><Users className="size-4 text-sky-600" /></div><p className="mt-3 text-2xl font-semibold text-slate-900">{buyerFilter === "PENDING" ? pendingCount : visibleBuyers.length}</p><p className="mt-1 text-xs text-slate-500">{buyerFilter === "PENDING" ? "Awaiting owner review" : "Current filter"}</p></div>
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Approved buyers</p><UserRound className="size-4 text-teal-600" /></div><p className="mt-3 text-2xl font-semibold text-slate-900">{approvedBuyers.length}</p><p className="mt-1 text-xs text-slate-500">Eligible for candidate matches</p></div>
          <div className="glass-panel rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">Match board</p><Handshake className="size-4 text-sky-600" /></div><p className="mt-3 text-2xl font-semibold text-slate-900">{matches.length}</p><p className="mt-1 text-xs text-slate-500">Owner-reviewed relationships</p></div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="glass-panel overflow-hidden rounded-[1.75rem]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 px-4 py-4 sm:px-5"><div><p className="eyebrow">Buyer registry</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Review intake queue</h2><p className="mt-1 text-xs text-slate-500">Public submissions stay unverified until you approve them.</p></div><select value={buyerFilter} onChange={(event) => setBuyerFilter(event.target.value as BuyerFilter)} className="h-9 rounded-xl border border-white/85 bg-white/65 px-3 text-xs font-semibold text-slate-700 outline-none"><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All buyers</option></select></div>
            {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="size-5 animate-spin text-sky-600" /></div> : visibleBuyers.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><Users className="size-8 text-slate-300" /><p className="mt-4 text-sm font-semibold text-slate-700">No buyers in this queue</p><p className="mt-1 text-xs text-slate-500">New public submissions will appear here as pending.</p></div> : <div className="divide-y divide-white/70">{visibleBuyers.map((buyer) => <article key={buyer._id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100/75 text-xs font-bold text-sky-800">{initials(buyer.name)}</div><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-800">{buyer.name}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{buyer.email} · {buyer.phone}</p></div></div><Badge className={buyer.intakeStatus === "APPROVED" ? "border-0 bg-teal-100/80 text-teal-800" : buyer.intakeStatus === "REJECTED" ? "border-0 bg-rose-100/75 text-rose-800" : "border-0 bg-amber-100/80 text-amber-800"}>{pretty(buyer.intakeStatus)}</Badge></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3"><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Budget</p><p className="mt-1 font-semibold text-slate-700">{money(buyer.budgetMin)} – {money(buyer.budgetMax)}</p></div><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Areas</p><p className="mt-1 truncate font-semibold text-slate-700">{buyer.targetAreas.join(", ")}</p></div><div className="glass-inset rounded-xl p-3"><p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Exit / POF</p><p className="mt-1 font-semibold text-slate-700">{pretty(buyer.exitType)} · {pretty(buyer.proofOfFundsStatus)}</p></div></div>{buyer.intakeStatus === "PENDING" && <div className="mt-4 flex gap-2"><Button type="button" onClick={() => handleBuyerDecision(buyer, "APPROVED")} className="h-9 flex-1 gap-2 rounded-xl bg-teal-700 text-xs hover:bg-teal-800"><Check className="size-3.5" /> Approve & verify</Button><Button type="button" variant="outline" onClick={() => handleBuyerDecision(buyer, "REJECTED")} className="h-9 rounded-xl border-rose-200/80 bg-rose-50/45 px-3 text-xs text-rose-700 hover:bg-rose-50"><X className="size-3.5" /></Button></div>}</article>)}</div>}
          </section>

          <section className="glass-panel overflow-hidden rounded-[1.75rem]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 px-4 py-4 sm:px-5"><div><p className="eyebrow">Property matching</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Owner match board</h2><p className="mt-1 text-xs text-slate-500">Only approved leads and approved buyers can be matched.</p></div><div className="flex items-center gap-2"><select value={matchFilter} onChange={(event) => setMatchFilter(event.target.value as MatchFilter)} className="h-9 rounded-xl border border-white/85 bg-white/65 px-3 text-xs font-semibold text-slate-700 outline-none"><option value="ALL">All</option><option value="CANDIDATE">Candidates</option><option value="APPROVED">Approved</option><option value="CONTACTED">Contacted</option><option value="CLOSED">Closed</option><option value="REJECTED">Rejected</option></select><Button type="button" onClick={() => setShowMatchForm((visible) => !visible)} className="h-9 gap-1.5 rounded-xl bg-sky-700 px-3 text-xs hover:bg-sky-800"><Plus className="size-3.5" /> New match</Button></div></div>
            {showMatchForm && <form onSubmit={handleCreateMatch} className="border-b border-white/70 bg-sky-50/35 p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Verified lead</span><select required value={matchForm.leadId} onChange={(event) => setMatchForm((current) => ({ ...current, leadId: event.target.value }))} className="h-10 rounded-xl border border-white/85 bg-white/75 px-3 text-xs text-slate-700 outline-none"><option value="">Choose a lead</option>{leads.map((lead) => <option key={lead._id} value={lead._id}>{lead.propertyAddress} · {lead.city}</option>)}</select></label><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Approved buyer</span><select required value={matchForm.buyerId} onChange={(event) => setMatchForm((current) => ({ ...current, buyerId: event.target.value }))} className="h-10 rounded-xl border border-white/85 bg-white/75 px-3 text-xs text-slate-700 outline-none"><option value="">Choose a buyer</option>{approvedBuyers.map((buyer) => <option key={buyer._id} value={buyer._id}>{buyer.name} · {buyer.targetAreas.join(", ")}</option>)}</select></label><Input required type="number" min="0" max="100" value={matchForm.matchScore} onChange={(event) => setMatchForm((current) => ({ ...current, matchScore: event.target.value }))} placeholder="Match score" className="rounded-xl border-white/85 bg-white/70 text-xs" /><label className="grid gap-1.5 text-xs font-semibold text-slate-600"><span>Confidence</span><select value={matchForm.confidence} onChange={(event) => setMatchForm((current) => ({ ...current, confidence: event.target.value as Match["confidence"] }))} className="h-10 rounded-xl border border-white/85 bg-white/75 px-3 text-xs text-slate-700 outline-none"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High (requires verified POF)</option></select></label><Input required value={matchForm.buyBoxSummary} onChange={(event) => setMatchForm((current) => ({ ...current, buyBoxSummary: event.target.value }))} placeholder="Why this buyer fits this property" className="rounded-xl border-white/85 bg-white/70 text-xs sm:col-span-2" /></div><div className="mt-3 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowMatchForm(false)} className="h-9 rounded-xl text-xs">Cancel</Button><Button type="submit" className="h-9 rounded-xl bg-sky-700 text-xs hover:bg-sky-800">Save candidate</Button></div></form>}
            {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="size-5 animate-spin text-sky-600" /></div> : matches.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><CircleAlert className="size-8 text-slate-300" /><p className="mt-4 text-sm font-semibold text-slate-700">No matches in this view</p><p className="mt-1 text-xs text-slate-500">Approve a buyer, then create a candidate pairing here.</p></div> : <div className="divide-y divide-white/70">{matches.map((match) => { const lead = leadById.get(match.leadId); const buyer = buyerById.get(match.buyerId); return <article key={match._id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{lead?.propertyAddress ?? `Lead ${match.leadId.slice(-6)}`}</p><p className="mt-1 truncate text-xs text-slate-500">{buyer?.name ?? `Buyer ${match.buyerId.slice(-6)}`} · {match.buyBoxSummary}</p><p className="mt-1 text-xs font-semibold text-teal-700">Est. gross spread: {lead?.estimatedProfit === undefined ? "Needs contract price" : money(lead.estimatedProfit)}</p></div><span className="rounded-lg bg-sky-100/80 px-2 py-1 text-sm font-bold text-sky-800">{match.matchScore}</span></div><div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-white/90 bg-white/55 text-[0.65rem] text-slate-600">{pretty(match.confidence)} confidence</Badge><Badge variant="outline" className="border-white/90 bg-white/55 text-[0.65rem] text-slate-600">{pretty(match.status)}</Badge></div>{(match.status === "CANDIDATE" || match.status === "APPROVED") && <div className="mt-4 flex gap-2"><Button type="button" onClick={() => handleMatchStatus(match, match.status === "CANDIDATE" ? "APPROVED" : "CONTACTED")} className="h-8 flex-1 gap-1.5 rounded-lg bg-teal-700 text-xs hover:bg-teal-800"><Check className="size-3.5" /> {match.status === "CANDIDATE" ? "Approve" : "Mark contacted"}</Button><Button type="button" variant="outline" onClick={() => handleMatchStatus(match, "REJECTED")} className="h-8 rounded-lg border-rose-200/80 bg-rose-50/45 px-3 text-xs text-rose-700"><X className="size-3.5" /> Reject</Button></div>}</article>; })}</div>}
          </section>
        </div>
        <p className="pb-5 pt-5 text-center text-xs text-slate-500">MongoDB is the source of truth for this board. Changes refresh after writes; direct Atlas edits do not push live updates.</p>
      </div>
    </main>
  );
}
