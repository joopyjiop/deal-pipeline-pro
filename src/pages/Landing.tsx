import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  FileCheck2,
  Fingerprint,
  LayoutList,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import logo from "@/assets/logo.svg";

const principles = [
  {
    icon: ScanSearch,
    title: "Source-first records",
    description:
      "Every surfaced lead carries a source URL, reference, date, and review trail before it can move forward.",
  },
  {
    icon: ShieldCheck,
    title: "Evidence before action",
    description:
      "Verified distress signals are required before a record reaches your workspace or a buyer.",
  },
  {
    icon: LockKeyhole,
    title: "Owner-controlled writes",
    description:
      "Lead entry, imports, approvals, and exports stay behind a server-side owner gate—not a client-side disguise.",
  },
];

const steps = [
  {
    icon: FileCheck2,
    step: "01",
    title: "Capture one source",
    description:
      "Start with a public auction, county, assessor, or recorder page and keep the evidence chain intact.",
  },
  {
    icon: BadgeCheck,
    step: "02",
    title: "Review one record",
    description:
      "Reject gaps, flag mismatches, and approve only what you can stand behind.",
  },
  {
    icon: Users,
    step: "03",
    title: "Match one buyer",
    description:
      "Turn a verified lead into one clear, owner-reviewed buyer conversation.",
  },
];

const boardColumns = [
  {
    title: "Sources",
    dot: "bg-emerald-500",
    cards: [
      { label: "Sheriff sale", meta: "sourceUrl + date", tag: "Evidence" },
      { label: "Assessor record", meta: "parcel · ref", tag: "Evidence" },
    ],
  },
  {
    title: "Review",
    dot: "bg-emerald-600",
    cards: [
      { label: "Distress signal", meta: "verified vs source", tag: "Owner review" },
    ],
  },
  {
    title: "Match",
    dot: "bg-emerald-700",
    cards: [
      { label: "Buyer buy box", meta: "fit summary", tag: "Approved" },
    ],
  },
];

export default function Landing() {
  return (
    <main className="min-h-screen overflow-hidden px-5 py-5 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <nav className="flex items-center justify-between py-3" aria-label="Main navigation">
          <Link to="/" className="flex items-center gap-3" aria-label="Deal Pipeline Pro home">
            <span className="flex size-10 items-center justify-center rounded-xl border border-emerald-900/10 bg-white shadow-[0_1px_2px_rgb(16_60_40_/_0.06),0_8px_24px_rgb(16_60_40_/_0.08)]">
              <img src={logo} alt="" className="size-6 rounded-lg" />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">Deal Pipeline Pro</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#principles" className="transition-colors hover:text-emerald-700">Why it works</a>
            <a href="#workflow" className="transition-colors hover:text-emerald-700">Workflow</a>
            <Link to="/buyers" className="transition-colors hover:text-emerald-700">I'm a buyer</Link>
            <Link to="/auth" className="rounded-lg border border-emerald-900/10 bg-white px-4 py-2 text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:text-emerald-800 hover:shadow-md">Sign in</Link>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <Link to="/buyers" className="rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">I'm a buyer</Link>
            <Link to="/auth" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgb(6_95_70_/_0.24)] transition-all hover:-translate-y-0.5 hover:bg-emerald-800">Open workspace</Link>
          </div>
        </nav>

        <section className="relative grid items-center gap-12 pb-20 pt-16 lg:grid-cols-[1.03fr_0.97fr] lg:gap-16 lg:pb-28 lg:pt-24">
          <div className="pointer-events-none absolute -left-32 top-16 size-72 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-sm"
            >
              <Sparkles className="size-3.5 text-emerald-600" />
              A cleaner wholesale pipeline
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.6 }}
              className="max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.05em] text-slate-900 sm:text-6xl lg:text-7xl"
            >
              Real deals start with a <span className="text-emerald-700">paper trail.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.6 }}
              className="mt-7 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl"
            >
              Deal Pipeline Pro is a source-first workspace for verified wholesale leads—built to replace invented details with records you can review, trust, and act on.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.6 }}
              className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <Link
                to="/auth"
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgb(6_95_70_/_0.24)] transition-all hover:-translate-y-0.5 hover:bg-emerald-800"
              >
                Open the owner workspace
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#principles"
                className="inline-flex items-center justify-center rounded-lg border border-emerald-900/10 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-50/60"
              >
                See the standard
              </a>
            </motion.div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5"><BadgeCheck className="size-4 text-emerald-600" /> Verified-only surface</span>
              <span className="inline-flex items-center gap-1.5"><Fingerprint className="size-4 text-emerald-600" /> Owner-gated writes</span>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="relative"
          >
            <div className="absolute -right-6 -top-8 size-28 rounded-full bg-emerald-200/50 blur-2xl" />
            <div className="glass-panel-strong relative rounded-[1.75rem] p-3 sm:p-4">
              <div className="rounded-[1.35rem] border border-emerald-900/[0.06] bg-white/70 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="eyebrow">Live pipeline</p>
                    <p className="mt-1.5 text-lg font-semibold tracking-tight text-slate-900">Source → review → match</p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-xl border border-emerald-900/10 bg-emerald-50 text-emerald-700">
                    <LayoutList className="size-5" />
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-2.5">
                  {boardColumns.map((column) => (
                    <div key={column.title} className="rounded-xl border border-emerald-900/[0.07] bg-white/80 p-2.5">
                      <div className="flex items-center gap-1.5 px-0.5">
                        <span className={`size-1.5 rounded-full ${column.dot}`} />
                        <p className="text-[0.68rem] font-semibold text-slate-600">{column.title}</p>
                      </div>
                      <div className="mt-2.5 space-y-2">
                        {column.cards.map((card) => (
                          <div key={card.label} className="rounded-lg border border-emerald-900/[0.07] bg-white p-2.5 shadow-sm">
                            <p className="text-xs font-semibold text-slate-800">{card.label}</p>
                            <p className="mt-0.5 text-[0.65rem] leading-4 text-slate-500">{card.meta}</p>
                            <span className="mt-1.5 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-700">
                              {card.tag}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-900/[0.06] bg-emerald-50/70 px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
                      <BadgeCheck className="size-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Evidence chain intact</p>
                      <p className="text-[0.68rem] text-slate-500">No source, no surface.</p>
                    </div>
                  </div>
                  <ShieldCheck className="size-5 text-emerald-600" />
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section id="principles" className="scroll-mt-10 border-t border-emerald-900/10 py-20 lg:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">The standard</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              A deal room that respects the difference between data and fiction.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              The first version does one job well: keep verified leads organized, reviewable, and ready for the next real step.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {principles.map((principle, index) => {
              const Icon = principle.icon;
              return (
                <motion.div
                  key={principle.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: index * 0.08, duration: 0.5 }}
                  className="glass-panel rounded-2xl p-6 transition-transform hover:-translate-y-1"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900">{principle.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{principle.description}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section id="workflow" className="scroll-mt-10 pb-12 lg:pb-16">
          <div className="mb-10 max-w-2xl">
            <p className="eyebrow">The first win</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              One source. One reviewed lead. One buyer match.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              The product starts small on purpose. Prove the evidence loop with real operators before adding more automation or broader crawling.
            </p>
          </div>
          <div className="mb-12 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ delay: index * 0.08, duration: 0.45 }}
                  className="glass-panel rounded-2xl p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">{step.step}</span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                </motion.div>
              );
            })}
          </div>
          <div className="glass-panel-strong flex flex-col gap-6 rounded-[1.75rem] bg-emerald-900 p-7 text-white sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-200">Built for one wholesaler</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
                Start with the records you can stand behind.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-100/90">
                Connect your owner workspace, capture verified public-record leads, and keep the pipeline honest from day one.
              </p>
            </div>
            <Link
              to="/auth"
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 py-3.5 text-sm font-semibold text-emerald-900 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-emerald-50"
            >
              Get started
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <p className="pb-5 pt-8 text-center text-xs text-slate-500">
            Not legal advice. Always confirm local solicitation, licensing, and consumer-protection requirements before contacting anyone.
          </p>
        </section>
      </div>
    </main>
  );
}
