import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  FileText,
  Fingerprint,
  Link2,
  LockKeyhole,
  MapPin,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import { Logo } from "@/components/Logo";

const trustChips = [
  { icon: BadgeCheck, label: "0 fabricated records" },
  { icon: LockKeyhole, label: "Owner-gated writes" },
  { icon: ShieldCheck, label: "Evidence on every lead" },
];

const stats = [
  {
    icon: ShieldCheck,
    title: "Verified-only",
    detail: "Only approved, non-fabricated records reach your workspace.",
  },
  {
    icon: LockKeyhole,
    title: "Owner-gated",
    detail: "Every write runs through a server-side owner gate.",
  },
  {
    icon: Link2,
    title: "Evidence chain",
    detail: "Source URL, reference, and date travel with every lead.",
  },
  {
    icon: Fingerprint,
    title: "Review before action",
    detail: "Evidence is required before a lead can move forward.",
  },
];

const shifts = [
  {
    problem: "Wasted dials on invented numbers",
    fix: "Every lead ties back to a public source you can open.",
  },
  {
    problem: "Compliance risk from fake PII",
    fix: "Fabricated rows are tombstoned — never exported or dialed.",
  },
  {
    problem: "No paper trail to defend a deal",
    fix: "Source URL, reference, and date stay on every record.",
  },
];

const steps = [
  {
    icon: ScanSearch,
    step: "01",
    title: "Capture a real source",
    description:
      "Start with a public auction, county, assessor, or recorder page. DealForge keeps the URL, reference, and date attached from the start.",
  },
  {
    icon: BadgeCheck,
    step: "02",
    title: "Review the evidence",
    description:
      "Reject gaps, flag contradictions, and approve only the records you can stand behind. Evidence is the gate — not a suggestion.",
  },
  {
    icon: Users,
    step: "03",
    title: "Match a verified buyer",
    description:
      "Turn an approved lead into one clear buyer conversation with a written fit summary, reviewed by you before it goes anywhere.",
  },
];

const features = [
  {
    icon: FileText,
    title: "The evidence chain is the product",
    description:
      "A lead isn't a lead without its source. DealForge carries the URL, reference, and date on every record so you always know what you're acting on.",
  },
  {
    icon: LockKeyhole,
    title: "You stay in control",
    description:
      "Lead entry, imports, approvals, and exports are owner-only and enforced server-side. The app can't invent its way past your judgment.",
  },
  {
    icon: Users,
    title: "Buyers meet verified leads",
    description:
      "Public buyer intake lands in a pending queue. Only approved buyers are matched against approved, evidence-backed leads.",
  },
];

const dossier = [
  { icon: Link2, label: "Source URL", value: "HTTPS record attached" },
  { icon: FileText, label: "Source reference", value: "Case / parcel citation" },
  { icon: CalendarCheck, label: "Source date", value: "Recorded, not guessed" },
];

export default function Landing() {
  return (
    <main className="min-h-screen overflow-hidden px-5 py-5 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <nav className="flex items-center justify-between py-3" aria-label="Main navigation">
          <Link to="/" className="flex items-center gap-3" aria-label="DealForge home"><Logo size="md" /></Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#why" className="transition-colors hover:text-emerald-700">Why it matters</a>
            <a href="#how" className="transition-colors hover:text-emerald-700">How it works</a>
            <Link to="/buyers" className="transition-colors hover:text-emerald-700">I'm a buyer</Link>
            <Link to="/auth" className="rounded-lg border border-navy-900/10 bg-white px-4 py-2 text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:text-navy-900 hover:shadow-md">Sign in</Link>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <Link to="/buyers" className="rounded-lg border border-navy-900/10 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">I'm a buyer</Link>
            <Link to="/auth" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_22px_rgb(23_32_63_/_0.28)] transition-all hover:-translate-y-0.5 hover:bg-navy-800">Open workspace</Link>
          </div>
        </nav>

        <section className="relative grid items-center gap-12 pb-16 pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pb-24 lg:pt-24">
          <div className="pointer-events-none absolute -left-32 top-16 size-72 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-900/15 bg-emerald-50/80 px-3.5 py-2 text-xs font-semibold text-emerald-800"
            >
              <Sparkles className="size-3.5 text-emerald-600" />
              Wholesale deals, forged fast
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.6 }}
              className="max-w-2xl text-5xl font-bold leading-[1.03] tracking-[-0.04em] text-slate-900 sm:text-6xl lg:text-[4.25rem]"
            >
              Stop chasing leads you <span className="text-emerald-700">can't trust.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.6 }}
              className="mt-7 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl"
            >
              DealForge turns public records into verified leads with a real evidence trail — so every call, offer, and match starts from something you can stand behind.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.6 }}
              className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <Link
                to="/auth"
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-navy-900 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgb(23_32_63_/_0.28)] transition-all hover:-translate-y-0.5 hover:bg-navy-800"
              >
                Open the owner workspace
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center justify-center rounded-lg border border-navy-900/10 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-50/60"
              >
                See how it works
              </a>
            </motion.div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
              {trustChips.map((chip) => {
                const Icon = chip.icon;
                return (
                  <span key={chip.label} className="inline-flex items-center gap-1.5">
                    <Icon className="size-4 text-emerald-600" />
                    {chip.label}
                  </span>
                );
              })}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="relative"
          >
            <div className="absolute -right-8 -top-10 size-36 rounded-full bg-emerald-300/30 blur-3xl" />
            <div className="absolute -bottom-10 -left-8 size-36 rounded-full bg-navy-300/30 blur-3xl" />

            <div className="glass-panel-strong relative overflow-hidden rounded-[2rem]">
              <div className="flex items-center justify-between bg-navy-900 px-6 py-4 text-white">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                    <ShieldCheck className="size-4 text-emerald-300" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Deal dossier</p>
                    <p className="text-[0.68rem] text-navy-200">Verified lead record</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.68rem] font-semibold text-emerald-300">
                  <BadgeCheck className="size-3.5" />
                  Verified
                </span>
              </div>

              <div className="p-6">
                <div className="flex items-center justify-between rounded-xl border border-navy-900/10 bg-white p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <MapPin className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">County record · parcel #</p>
                      <p className="text-xs text-slate-500">Source: sheriff sale · assessor</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-semibold text-emerald-700">Ready</span>
                </div>

                <div className="mt-4 grid gap-2.5">
                  {dossier.map((row) => {
                    const Icon = row.icon;
                    return (
                      <div key={row.label} className="flex items-center gap-3 rounded-xl border border-navy-900/[0.07] bg-white/70 px-3.5 py-3">
                        <span className="flex size-8 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                          <Icon className="size-4" />
                        </span>
                        <div className="flex-1">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">{row.label}</p>
                          <p className="text-sm font-medium text-slate-800">{row.value}</p>
                        </div>
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl border border-emerald-900/15 bg-emerald-50/70 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Distress signal</p>
                    <BadgeCheck className="size-4 text-emerald-700" />
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-slate-900">Pre-foreclosure — verified against the source</p>
                  <p className="mt-0.5 text-xs text-slate-500">Quoted evidence, not a guess.</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-navy-900/10 bg-white/70 px-6 py-3.5">
                <p className="text-xs text-slate-500">Owner-reviewed · ready to match a buyer</p>
                <span className="text-xs font-semibold text-emerald-700">No source, no surface.</span>
              </div>
            </div>

            <div className="absolute -left-4 top-20 hidden rounded-xl border border-navy-900/10 bg-white px-3.5 py-2.5 shadow-[0_12px_30px_rgb(23_32_63_/_0.12)] sm:block">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <BadgeCheck className="size-3.5 text-emerald-600" />
                0 fabricated records
              </p>
            </div>
            <div className="absolute -right-3 bottom-24 hidden rounded-xl border border-navy-900/10 bg-white px-3.5 py-2.5 shadow-[0_12px_30px_rgb(23_32_63_/_0.12)] sm:block">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                Evidence chain intact
              </p>
            </div>
          </motion.div>
        </section>

        <section className="border-t border-navy-900/10 py-14 lg:py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: index * 0.06, duration: 0.45 }}
                  className="rounded-2xl border border-navy-900/10 bg-white p-5"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-slate-900">{stat.title}</p>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">{stat.detail}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section id="why" className="scroll-mt-10 border-t border-navy-900/10 py-20 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <p className="eyebrow">Why it matters</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Most lead lists are fiction with a logo.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Invented names, fake phone numbers, and distress scores nobody can trace. That waste is expensive — and dialing made-up numbers is a real compliance risk. DealForge replaces the guesswork with a paper trail.
              </p>
              <Link
                to="/auth"
                className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
              >
                See it for yourself
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="space-y-3">
              {shifts.map((shift, index) => (
                <motion.div
                  key={shift.problem}
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ delay: index * 0.07, duration: 0.45 }}
                  className="rounded-2xl border border-navy-900/10 bg-white p-5"
                >
                  <p className="text-sm font-medium text-slate-500 line-through decoration-slate-300">
                    {shift.problem}
                  </p>
                  <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-slate-900">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {shift.fix}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-10 border-t border-navy-900/10 py-20 lg:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              From public record to verified match.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              No magic, no fabrication. Just a disciplined loop you control end to end.
            </p>
          </div>
          <div className="relative mt-12 grid gap-6 md:grid-cols-3">
            <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent md:block" />
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ delay: index * 0.08, duration: 0.5 }}
                  className="relative"
                >
                  <div className="relative z-10 flex size-12 items-center justify-center rounded-2xl border border-navy-900/10 bg-navy-900 text-emerald-300 shadow-[0_10px_26px_rgb(23_32_63_/_0.24)]">
                    <Icon className="size-5" />
                  </div>
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Step {step.step}</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section className="border-t border-navy-900/10 py-20 lg:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">What you get</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Built for wholesalers who demand proof.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: index * 0.08, duration: 0.5 }}
                  className="rounded-2xl border border-navy-900/10 bg-white p-6 transition-transform hover:-translate-y-1"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section className="pb-12 lg:pb-16">
          <div className="relative overflow-hidden rounded-[2rem] bg-navy-900 p-8 text-white sm:p-12 lg:p-14">
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-indigo-300">Built for wholesalers who demand proof</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                  Start with the records you can stand behind.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-navy-100/80">
                  Capture verified public-record leads, keep the pipeline honest from day one, and match them to buyers you actually approve.
                </p>
              </div>
              <Link
                to="/auth"
                className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-navy-900 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-emerald-50"
              >
                Get started
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
          <p className="pb-5 pt-8 text-center text-xs text-slate-500">
            Not legal advice. Always confirm local solicitation, licensing, and consumer-protection requirements before contacting anyone.
          </p>
        </section>
      </div>
    </main>
  );
}
