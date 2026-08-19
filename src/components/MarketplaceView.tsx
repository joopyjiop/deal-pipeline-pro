import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { BuyerCard, MatchCard, SellerCard } from "@/convex/marketplaceCore";
import {
  BadgeCheck,
  Building2,
  Handshake,
  Loader2,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "sellers" | "buyers" | "matches";

const tabs: Array<{ key: Tab; label: string }> = [
  { key: "sellers", label: "Sellers" },
  { key: "buyers", label: "Buyers" },
  { key: "matches", label: "Matches" },
];

const money = (value: number | undefined) =>
  value === undefined ? "—" : `$${value.toLocaleString()}`;

function SellerRow({ seller }: { seller: SellerCard }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/45 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50/80 text-teal-700">
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{seller.propertyAddress}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {seller.city}, {seller.state} {seller.zip} · {seller.county} County
          </p>
          <p className="mt-1 truncate text-[0.65rem] text-slate-400">
            {seller.sourceType} · {seller.sourceRef}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Distress</p>
          <p className="mt-0.5 text-sm font-bold text-teal-700">{seller.distressScore}<span className="text-[0.6rem] font-medium text-slate-400">/100</span></p>
        </div>
        <div className="hidden text-right md:block">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">ARV</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">{money(seller.arv)}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-200/80 bg-teal-50/70 px-2.5 py-0.5 text-[0.62rem] font-bold text-teal-700">
          <BadgeCheck className="size-3" /> VERIFIED
        </span>
      </div>
    </div>
  );
}

function BuyerRow({ buyer }: { buyer: BuyerCard }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/45 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100/75 text-sky-700">
          <Users className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{buyer.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {buyer.targetAreas.length ? buyer.targetAreas.join(", ") : "Markets not listed"} · {buyer.exitType}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Budget</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">
            {money(buyer.budgetMin)} – {money(buyer.budgetMax)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-200/80 bg-teal-50/70 px-2.5 py-0.5 text-[0.62rem] font-bold text-teal-700">
          <ShieldCheck className="size-3" /> APPROVED
        </span>
      </div>
    </div>
  );
}

function MatchRow({ match }: { match: MatchCard }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/45 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-100/80 text-violet-700">
          <Handshake className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">
            {match.leadAddress ?? match.leadId}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {match.buyerName ?? match.buyerId} · {match.buyBoxSummary || match.status}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-400">Match</p>
          <p className="mt-0.5 text-sm font-bold text-sky-700">{match.matchScore}<span className="text-[0.6rem] font-medium text-slate-400">/100</span></p>
        </div>
        <span className="inline-flex items-center rounded-full border border-white/85 bg-white/60 px-2.5 py-0.5 text-[0.62rem] font-bold text-slate-600">
          {match.confidence}
        </span>
      </div>
    </div>
  );
}

/**
 * Read-only marketplace — the only surface non-owner signed-in users see.
 * Data is scrubbed server-side (src/convex/marketplace.ts): no contact PII,
 * no owner workspaces, no action buttons. Owner-only controls live elsewhere.
 */
export function MarketplaceView() {
  const overview = useAction(api.marketplace.marketplaceOverview);
  const [data, setData] = useState<{ sellers: SellerCard[]; buyers: BuyerCard[]; matches: MatchCard[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sellers");

  useEffect(() => {
    let cancelled = false;
    overview({})
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load the marketplace.");
      });
    return () => {
      cancelled = true;
    };
  }, [overview]);

  if (error) {
    return (
      <div className="glass-panel mt-5 rounded-[1.75rem] p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-50/70 text-rose-600"><ShieldCheck className="size-6" /></div>
        <h2 className="mt-4 text-base font-semibold text-slate-800">Marketplace unavailable</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-panel mt-5 flex min-h-72 items-center justify-center rounded-[1.75rem]">
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-5 animate-spin text-sky-600" /> Loading the marketplace…</div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] px-5 py-4">
        <div>
          <p className="eyebrow">Read-only buyer view</p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Marketplace — sellers, buyers &amp; matches</h2>
          <p className="mt-1 text-xs text-slate-500">Approved, source-verified records only. Contact details stay owner-only.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-white/85 bg-white/55 px-3 py-1.5 text-[0.65rem] font-medium text-slate-500">
          <MapPin className="size-3.5 text-teal-600" /> Public-record data · no fabricated rows
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === item.key
                ? "bg-sky-700 text-white shadow-sm"
                : "border border-white/85 bg-white/55 text-slate-600 hover:text-sky-800",
            )}
          >
            {item.label}
            <span className="ml-1.5 text-xs opacity-75">{data[item.key].length}</span>
          </button>
        ))}
      </div>

      <div className="glass-panel mt-4 space-y-2.5 rounded-[1.75rem] p-4">
        {data[tab].length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No {tab} available yet — approved records will appear here.
          </p>
        ) : (
          <>
            {tab === "sellers" && data.sellers.map((row) => <SellerRow key={row._id} seller={row} />)}
            {tab === "buyers" && data.buyers.map((row) => <BuyerRow key={row._id} buyer={row} />)}
            {tab === "matches" && data.matches.map((row) => <MatchRow key={row._id} match={row} />)}
          </>
        )}
      </div>
    </div>
  );
}
