import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import { Logo, LogoMark } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Handshake,
  Pause,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

const SCENE_MS = 6000;

type Scene = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  screen: ReactNode;
};

/** Browser-style chrome around each mock screen so scenes read as product UI. */
function BrowserChrome({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-navy-900/70 shadow-[0_24px_70px_-24px_rgb(0_0_0/0.7)] backdrop-blur">
      <div className="flex items-center gap-2 border-b border-white/10 bg-navy-950/70 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-red-400/80" />
          <span className="size-2.5 rounded-full bg-amber-400/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-navy-950/90 px-3 py-1 text-[11px] font-mono text-slate-400 ring-1 ring-white/10">
          <ShieldCheck className="size-3 text-emerald-400" />
          {url}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ScreenWelcome() {
  const steps = [
    { icon: Search, label: "Source", note: "Sheriff & tax sales, foreclosures" },
    { icon: BadgeCheck, label: "Verify", note: "Evidence on every lead" },
    { icon: Target, label: "Match", note: "Buyers with confidence scores" },
    { icon: Handshake, label: "Close", note: "Run the numbers and move deals" },
  ];
  return (
    <div className="px-2 py-6 text-center">
      <div className="flex items-center justify-center gap-3">
        <LogoMark size="lg" />
        <span className="text-2xl font-bold tracking-tight text-slate-100">Deal Forge</span>
      </div>
      <p className="mt-3 text-sm text-slate-400">Wholesale deals, forged from real public records</p>
      <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
        {steps.map((step, index) => (
          <motion.div
            key={step.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + index * 0.35 }}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-navy-950/50 px-4 py-3 text-left"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
              <step.icon className="size-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200">{step.label}</div>
              <div className="text-xs text-slate-500">{step.note}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ScreenLeads() {
  const rows = [
    { source: "Sheriff sale", market: "Wayne County, MI", score: 86, spread: "$32.4k", tag: "VERIFIED", tone: "bg-emerald-400/10 text-emerald-300" },
    { source: "Tax sale", market: "Bexar County, TX", score: 81, spread: "$28.1k", tag: "VERIFIED", tone: "bg-emerald-400/10 text-emerald-300" },
    { source: "Foreclosure", market: "Marion County, IN", score: 74, spread: "$19.8k", tag: "PARTIAL", tone: "bg-amber-400/10 text-amber-300" },
    { source: "Assessor", market: "Fulton County, GA", score: 68, spread: "$14.2k", tag: "REVIEW", tone: "bg-white/10 text-slate-300" },
  ];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Verified leads</div>
          <div className="text-xs text-slate-400">New sourced leads this week</div>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">4 new</span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.source + row.market} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-100">{row.source}</div>
                <div className="truncate text-xs text-slate-400">{row.market}</div>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="w-20 rounded-full bg-white/10">
                <div className="h-1.5 rounded-full bg-emerald-400" style={{ width: `${row.score}%` }} />
              </div>
              <span className="text-xs font-semibold text-slate-300">{row.score}</span>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${row.tone}`}>{row.tag}</span>
            <span className="hidden text-sm font-semibold text-emerald-400 md:block">{row.spread}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenDetail() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Lead #1042 · Bexar County, TX</div>
          <div className="text-xs text-slate-400">Sheriff sale · distress score 86/100</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
          <BadgeCheck className="size-3" /> VERIFIED
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Evidence chain</div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-white/10 bg-navy-950/60 px-3 py-1.5 font-mono text-[11px] text-slate-300">bexar.org/sheriff-sales</span>
          <span className="rounded-lg border border-white/10 bg-navy-950/60 px-3 py-1.5 font-mono text-[11px] text-slate-300">Ref: 2026-CF-00123</span>
          <span className="rounded-lg border border-white/10 bg-navy-950/60 px-3 py-1.5 font-mono text-[11px] text-slate-300">2026-08-01</span>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-navy-950/60 px-4 py-3 text-sm text-slate-300">
          <span className="font-semibold text-slate-100">Signal:</span> Pre-foreclosure — listed in the official sale schedule.
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Underwriting</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "ARV", value: "$180k" },
            { label: "Repairs", value: "$35k" },
            { label: "Est. spread", value: "$32k" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 p-3 text-center">
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="mt-0.5 text-sm font-bold text-slate-100">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScreenMatch() {
  const cards = [
    { buyer: "Cash buyer · FLIP", fit: "High fit", score: 92, tone: "bg-emerald-400/10 text-emerald-300" },
    { buyer: "Buyer fund · BUY & HOLD", fit: "Medium fit", score: 78, tone: "bg-amber-400/10 text-amber-300" },
    { buyer: "Contract buyer · ASSIGN", fit: "High fit", score: 88, tone: "bg-emerald-400/10 text-emerald-300" },
  ];
  return (
    <div>
      <div className="mb-4">
        <div className="text-sm font-semibold text-slate-100">Match board</div>
        <div className="text-xs text-slate-400">Verified lead auto-matched to your approved buyers</div>
      </div>
      <div className="space-y-2">
        {cards.map((card) => (
          <div key={card.buyer} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
                <Target className="size-4" />
              </div>
              <span className="text-sm font-medium text-slate-100">{card.buyer}</span>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${card.tone}`}>{card.fit}</span>
            <span className="text-sm font-bold text-slate-100">{card.score}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-300">
        <FileCheck2 className="size-4 shrink-0" />
        Confidence is scored from the lead's verified evidence and the buyer's approved criteria.
      </div>
    </div>
  );
}

function ScreenSubscribe() {
  return (
    <div className="px-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-navy-950/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Starter</div>
          <div className="mt-1 text-2xl font-bold text-slate-100">
            $99<span className="text-sm font-medium text-slate-400">/mo</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-400">
            <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> 100 verified leads / month</li>
            <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> Lead evidence &amp; source details</li>
          </ul>
        </div>
        <div className="rounded-xl border border-emerald-400/70 bg-navy-950/40 p-4 shadow-[0_10px_30px_-12px_rgb(16_185_129/0.4)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Pro</span>
            <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[9px] font-bold text-navy-950">MOST POPULAR</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-100">
            $299<span className="text-sm font-medium text-slate-400">/mo</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-400">
            <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> 500 verified leads / month</li>
            <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald-400" /> Buyer match engine</li>
          </ul>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-navy-950/60 px-4 py-3 text-xs text-slate-400">
        <CreditCard className="size-4 text-emerald-400" />
        Checkout in seconds via secure Stripe billing — cancel anytime.
      </div>
    </div>
  );
}

const scenes: Scene[] = [
  {
    id: "welcome",
    eyebrow: "Deal Forge in 90 seconds",
    title: "Wholesale deals, forged from real public records",
    body: "Deal Forge turns sheriff sales, tax sales, and foreclosures into a verified lead pipeline — no fabricated data, no guessing.",
    screen: <ScreenWelcome />,
  },
  {
    id: "leads",
    eyebrow: "Step 1 — Source",
    title: "Fresh, verified leads land every week",
    body: "Subscribers get a steady stream of distressed property leads, each tagged with its source and verification status.",
    screen: <ScreenLeads />,
  },
  {
    id: "detail",
    eyebrow: "Step 2 — Verify",
    title: "Every claim has an evidence chain",
    body: "Open any lead to see its source URL, reference, date, distress signals, and the full underwriting picture.",
    screen: <ScreenDetail />,
  },
  {
    id: "match",
    eyebrow: "Step 3 — Match",
    title: "Match leads to your buyers with confidence",
    body: "Verified leads are auto-matched to your approved buyers with confidence scores, so deals move fast.",
    screen: <ScreenMatch />,
  },
  {
    id: "subscribe",
    eyebrow: "Step 4 — Subscribe",
    title: "Pick a plan and start closing",
    body: "Monthly plans billed securely through Stripe. No contracts — cancel anytime and keep access through the paid period.",
    screen: <ScreenSubscribe />,
  },
];

export default function Demo() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const isLast = index === scenes.length - 1;
  const scene = scenes[index];

  const next = () => {
    setIndex((current) => Math.min(current + 1, scenes.length - 1));
    setPlaying(true);
  };
  const prev = () => {
    setIndex((current) => Math.max(current - 1, 0));
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing || isLast) return;
    const id = window.setInterval(() => {
      setIndex((current) => {
        if (current >= scenes.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, SCENE_MS);
    return () => window.clearInterval(id);
  }, [playing, isLast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div className="min-h-screen bg-navy-950 font-sans text-slate-100 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-navy-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/">
            <Logo size="md" tone="light" />
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="text-sm text-slate-400 transition-colors hover:text-emerald-400">
              Sign in
            </Link>
            <Link
              to="/#pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-navy-950 transition-colors hover:bg-emerald-300"
            >
              Subscribe <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
            <Sparkles className="size-4" />
            Interactive demo
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">See Deal Forge in action</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            A quick tour of the pipeline — from sourced public records to verified leads, buyer matching, and checkout.
            Use the arrows or your keyboard.
          </p>
        </div>

        {/* Progress */}
        <div className="mx-auto mt-10 max-w-3xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pause demo" : "Play demo"}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-navy-950 transition-colors hover:bg-emerald-300"
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                key={`${index}-${playing}`}
                className="h-full bg-emerald-400"
                initial={{ width: "0%" }}
                animate={{ width: playing ? "100%" : "0%" }}
                transition={{ duration: SCENE_MS / 1000, ease: "linear" }}
              />
            </div>
            <span className="shrink-0 text-sm tabular-nums text-slate-400">
              {index + 1} / {scenes.length}
            </span>
          </div>
        </div>

        {/* Scene */}
        <div className="mx-auto mt-8 max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={scene.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {scene.screen}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 rounded-2xl border border-white/10 bg-navy-900/50 p-6 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">{scene.eyebrow}</div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">{scene.title}</h2>
            <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-slate-400">{scene.body}</p>
          </div>

          {/* Dots */}
          <div className="mt-6 flex items-center justify-center gap-2">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                onClick={() => {
                  setIndex(i);
                  setPlaying(true);
                }}
                aria-label={`Go to scene ${i + 1}: ${s.title}`}
                className={`h-2.5 rounded-full transition-all ${i === index ? "w-7 bg-emerald-400" : "w-2.5 bg-white/20 hover:bg-white/30"}`}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={prev}
              disabled={index === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            {isLast ? (
              <Link
                to="/#pricing"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-2.5 text-sm font-semibold text-navy-950 transition-colors hover:bg-emerald-300"
              >
                Subscribe now <ArrowRight className="size-4" />
              </Link>
            ) : (
              <button
                onClick={next}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-2.5 text-sm font-semibold text-navy-950 transition-colors hover:bg-emerald-300"
              >
                Next <ArrowRight className="size-4" />
              </button>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            Illustrative demo screens — not real leads. The product shows source evidence for every lead.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
