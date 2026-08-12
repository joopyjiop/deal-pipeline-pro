import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Database,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router";
import logo from "@/assets/logo.svg";

const principles = [
  {
    icon: FileCheck2,
    title: "Source-first records",
    description: "Every surfaced lead carries a source URL, reference, date, and review trail.",
  },
  {
    icon: ShieldCheck,
    title: "Evidence before action",
    description: "Verified distress signals are required before a record can reach your workspace.",
  },
  {
    icon: LockKeyhole,
    title: "Owner-controlled inputs",
    description: "Lead writes stay behind a server-side owner gate—not a client-side disguise.",
  },
];

const firstWin = [
  { icon: FileCheck2, title: "Capture one source", description: "Start with one public auction, county, assessor, or recorder page." },
  { icon: BadgeCheck, title: "Review one record", description: "Keep the evidence, reject gaps, and approve only what you can stand behind." },
  { icon: ArrowRight, title: "Match one buyer", description: "Turn a verified lead into one clear, owner-reviewed buyer conversation." },
];

export default function Landing() {
  return (
    <main className="min-h-screen overflow-hidden px-5 py-5 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <nav className="flex items-center justify-between py-3" aria-label="Main navigation">
          <Link to="/" className="flex items-center gap-3" aria-label="Groundwork home">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-white/90 bg-white/70 shadow-[0_8px_24px_rgb(80_120_160_/_0.14)] backdrop-blur-xl">
              <img src={logo} alt="" className="size-6 rounded-lg" />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-800">Groundwork</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#principles" className="transition-colors hover:text-sky-700">Why it works</a>
            <a href="#workflow" className="transition-colors hover:text-sky-700">Workflow</a>
            <Link to="/buyers" className="transition-colors hover:text-sky-700">I’m a buyer</Link>
            <Link to="/auth" className="rounded-full border border-white/90 bg-white/55 px-4 py-2 text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white/85">Sign in</Link>
          </div>
          <div className="flex items-center gap-2 md:hidden"><Link to="/buyers" className="rounded-full border border-white/90 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">I’m a buyer</Link><Link to="/auth" className="rounded-full border border-sky-500/25 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgb(14_116_144_/_0.2)] transition-all hover:-translate-y-0.5 hover:bg-sky-700">Open workspace</Link></div>
        </nav>

        <section className="relative grid items-center gap-12 pb-20 pt-20 lg:grid-cols-[1.03fr_0.97fr] lg:gap-16 lg:pb-28 lg:pt-28">
          <div className="pointer-events-none absolute -left-32 top-16 size-72 rounded-full bg-sky-200/30 blur-3xl" />
          <div className="relative z-10">
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/90 bg-white/60 px-3.5 py-2 text-xs font-semibold text-sky-800 shadow-sm backdrop-blur-xl">
              <Sparkles className="size-3.5 text-teal-600" />
              A cleaner wholesale pipeline
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6 }} className="max-w-3xl text-5xl font-semibold leading-[1.03] tracking-[-0.055em] text-slate-900 sm:text-6xl lg:text-7xl">
              Real deals start with a <span className="text-sky-700">paper trail.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.6 }} className="mt-7 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">
              Groundwork is a source-first workspace for verified wholesale leads—built to replace invented details with records you can actually review, trust, and act on.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.6 }} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link to="/auth" className="group inline-flex items-center justify-center gap-2 rounded-full bg-sky-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgb(14_116_144_/_0.22)] transition-all hover:-translate-y-0.5 hover:bg-sky-800">
                Open the owner workspace
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#principles" className="inline-flex items-center justify-center rounded-full border border-white/90 bg-white/52 px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/80">
                See the standard
              </a>
            </motion.div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5"><BadgeCheck className="size-4 text-teal-600" /> Verified-only surface</span>
              <span className="inline-flex items-center gap-1.5"><Fingerprint className="size-4 text-sky-600" /> Owner-gated writes</span>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }} className="relative">
            <div className="absolute -right-6 -top-8 size-28 rounded-full bg-teal-200/45 blur-2xl" />
            <div className="glass-panel-strong relative rounded-[2rem] p-4 sm:p-5">
              <div className="rounded-[1.5rem] border border-white/90 bg-white/55 p-5 backdrop-blur-xl sm:p-6">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="eyebrow">Lead integrity monitor</p>
                    <p className="mt-2 text-xl font-semibold tracking-tight text-slate-800">What can you trust today?</p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-teal-100/75 text-teal-700"><ShieldCheck className="size-5" /></div>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <div className="glass-inset rounded-2xl p-4"><p className="text-xs font-medium text-slate-500">Surface policy</p><p className="mt-2 text-sm font-semibold text-slate-800">Approved + verified</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/80"><div className="h-full w-full rounded-full bg-teal-500" /></div></div>
                  <div className="glass-inset rounded-2xl p-4"><p className="text-xs font-medium text-slate-500">Fabricated rows</p><p className="mt-2 text-sm font-semibold text-slate-800">Never surfaced</p><div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-teal-700"><BadgeCheck className="size-3.5" /> Hard separation</div></div>
                </div>
                <div className="mt-4 rounded-2xl border border-sky-100/90 bg-sky-50/60 p-4">
                  <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-white/80 text-sky-700 shadow-sm"><Database className="size-4" /></div><div><p className="text-sm font-semibold text-slate-800">Evidence chain intact</p><p className="mt-0.5 text-xs leading-5 text-slate-500">Source, date, distress signal, review status</p></div></div>
                </div>
              </div>
              <div className="pointer-events-none absolute -bottom-5 -left-7 rounded-2xl border border-white/90 bg-white/72 px-4 py-3 shadow-[0_12px_30px_rgb(84_125_161_/_0.16)] backdrop-blur-xl"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">V1 principle</p><p className="mt-1 text-sm font-semibold text-slate-800">No source. No surface.</p></div>
            </div>
          </motion.div>
        </section>

        <section id="principles" className="scroll-mt-10 border-t border-white/70 py-20 lg:py-24">
          <div className="max-w-2xl"><p className="eyebrow">The standard</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">A deal room that respects the difference between data and fiction.</h2><p className="mt-4 text-base leading-7 text-slate-600">The first version does one job well: keep verified leads organized, reviewable, and ready for the next real step.</p></div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">{principles.map((principle, index) => { const Icon = principle.icon; return <motion.div key={principle.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: index * 0.08, duration: 0.5 }} className="glass-panel rounded-3xl p-6 transition-transform hover:-translate-y-1"><div className="flex size-11 items-center justify-center rounded-2xl bg-white/75 text-sky-700 shadow-sm"><Icon className="size-5" /></div><h3 className="mt-5 text-base font-semibold text-slate-800">{principle.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{principle.description}</p></motion.div>; })}</div>
        </section>

        <section id="workflow" className="scroll-mt-10 pb-12 lg:pb-16">
          <div className="mb-10 max-w-2xl"><p className="eyebrow">The first win</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">One source. One reviewed lead. One buyer match.</h2><p className="mt-4 text-base leading-7 text-slate-600">The product starts small on purpose. Prove the evidence loop with real operators before adding more automation or broader crawling.</p></div>
          <div className="mb-12 grid gap-4 md:grid-cols-3">{firstWin.map((step, index) => { const Icon = step.icon; return <motion.div key={step.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ delay: index * 0.08, duration: 0.45 }} className="glass-panel rounded-3xl p-5"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-white/75 text-sky-700"><Icon className="size-4" /></span><span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">0{index + 1}</span></div><h3 className="mt-5 text-base font-semibold text-slate-800">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p></motion.div>; })}</div>
          <div className="glass-panel-strong flex flex-col gap-6 rounded-[2rem] p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="eyebrow">Built for one wholesaler</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900">Start with the records you can stand behind.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Connect your owner workspace, capture verified public-record leads, and keep the pipeline honest from day one.</p></div>
            <Link to="/auth" className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-slate-800 px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-slate-900">Get started <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link>
          </div>
          <p className="pb-5 pt-8 text-center text-xs text-slate-500">Not legal advice. Always confirm local solicitation, licensing, and consumer-protection requirements before contacting anyone.</p>
        </section>
      </div>
    </main>
  );
}
