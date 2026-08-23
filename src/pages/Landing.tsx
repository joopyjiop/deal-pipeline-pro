import { Link, useLocation, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileCheck2,
  Handshake,
  Lock,
  Mail,
  MapPin,
  Play,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Award,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { SiteFooter, CONTACT_EMAIL, SUPPORT_ADDRESS } from "@/components/SiteFooter";
import { cn } from "@/lib/utils";

const PRICE_IDS: Record<string, string> = {
  starter: "price_1U6fOLBDysO4CeCRT6k0Rdc2",
  pro: "price_1U6fOMBDysO4CeCRXLGhPl7s",
};

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

const sources = [
  "Foreclosure.com",
  "Auction.com",
  "County sheriff sales",
  "Assessor & recorder records",
  "ATTOM",
];

const stats = [
  { value: "500+", label: "Verified leads sourced", icon: Building2 },
  { value: "98%", label: "Source-verified accuracy", icon: BadgeCheck },
  { value: "48hr", label: "New leads weekly", icon: Zap },
  { value: "0", label: "Fabricated data points", icon: ShieldCheck },
];

const steps = [
  {
    icon: CreditCard,
    title: "Subscribe",
    desc: "Pick a monthly plan and check out securely through Stripe. No contracts — cancel anytime.",
  },
  {
    icon: Search,
    title: "Get verified leads",
    desc: "Fresh distressed-property leads land in your dashboard, each backed by source evidence — never fabricated.",
  },
  {
    icon: Handshake,
    title: "Match buyers & close",
    desc: "Run the numbers, match leads to your buyers, and move deals to close with confidence.",
  },
];

const features = [
  {
    icon: BadgeCheck,
    title: "Verified leads",
    desc: "Every lead is drawn from public records with source URL, reference, and date attached. No invented data, ever.",
  },
  {
    icon: FileCheck2,
    title: "Evidence chains",
    desc: "Sheriff sales, tax sales, and foreclosures with the public-record trail you need to trust the deal.",
  },
  {
    icon: Target,
    title: "Buyer matching",
    desc: "Match verified leads to your approved buyers with confidence scores, so deals move fast.",
  },
  {
    icon: Building2,
    title: "Underwriting tools",
    desc: "ARV, repairs, and offer estimates to size a deal before you ever pick up the phone.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance built in",
    desc: "Designed for lawful outreach. No fabricated contacts, no TCPA landmines.",
  },
  {
    icon: RefreshCcw,
    title: "Fresh every week",
    desc: "New sourced leads on a regular cadence so your pipeline never goes stale.",
  },
];

const plans = [
  {
    key: "starter",
    name: "Starter",
    price: 99,
    desc: "For solo wholesalers getting started",
    features: [
      "100 verified leads / month",
      "Lead evidence & source details",
      "Basic underwriting tools",
      "Email support",
    ],
    cta: "Subscribe to Starter",
    popular: false,
  },
  {
    key: "pro",
    name: "Pro",
    price: 299,
    desc: "For active wholesalers building a pipeline",
    features: [
      "500 verified leads / month",
      "Buyer match engine",
      "Advanced underwriting & comps",
      "Priority support",
      "API & automation access",
    ],
    cta: "Subscribe to Pro",
    popular: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: null,
    desc: "For teams and operators at scale",
    features: [
      "Unlimited leads",
      "Dedicated account manager",
      "Custom integrations",
      "White-label options",
    ],
    cta: "Contact sales",
    popular: false,
  },
];

const faqs = [
  {
    q: "What kind of leads do subscribers get?",
    a: "Distressed property leads sourced from sheriff sales, tax sales, foreclosures, and assessor/recorder records. Each lead carries source evidence — the URL, reference, and date it came from — so you can verify it yourself.",
  },
  {
    q: "How is the data verified?",
    a: "Leads are drawn from public records and trusted marketplaces, then run through our verification pipeline. We never fabricate names, addresses, phones, or pricing. Anything we can't verify is flagged as missing — never guessed.",
  },
  {
    q: "How does billing work?",
    a: "Subscriptions are monthly and billed securely through Stripe. You can cancel anytime and keep access through the end of the billing period you've paid for. See the Cancellation Policy in the footer.",
  },
  {
    q: "Can I try it before subscribing?",
    a: "Create an account and sign in to explore the workspace. When you're ready, choose a plan — checkout is handled securely by Stripe.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-medium text-slate-100">{q}</span>
        {open ? (
          <ChevronUp className="size-5 shrink-0 text-emerald-400" />
        ) : (
          <ChevronDown className="size-5 shrink-0 text-slate-500" />
        )}
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <p className="pb-5 text-[15px] leading-relaxed text-slate-400">{a}</p>
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const createCheckout = useAction(api.stripe.createCheckoutSession);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        const id = window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
        return () => window.clearTimeout(id);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash]);

  const handleSubscribe = async (planKey: string) => {
    const priceId = PRICE_IDS[planKey];
    if (!priceId || priceId.startsWith("price_replace")) {
      toast.error("Subscription checkout isn't configured yet — add your Stripe Price IDs.");
      return;
    }
    if (isAuthLoading) {
      toast.info("Checking your session…");
      return;
    }
    if (!isAuthenticated) {
      navigate("/auth?returnTo=/dashboard");
      return;
    }
    setCheckingOut(planKey);
    const origin = window.location.origin;
    // Primary path: DealForge API worker (Stripe Checkout, no auth required)
    try {
      const res = await fetch("https://dealforge-api.jacobvierra8.workers.dev/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product_key: planKey }),
      });
      if (!res.ok) throw new Error(`checkout api ${res.status}`);
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error("no checkout url");
      window.location.href = data.url;
      return;
    } catch {
      // Fallback: Convex server-side session (requires sign-in + Convex Stripe key)
    }
    try {
      const { url } = await createCheckout({
        priceId,
        successUrl: `${origin}/dashboard`,
        cancelUrl: `${origin}/#pricing`,
      });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout. Please try again.");
    } finally {
      setCheckingOut(null);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 font-sans text-slate-100 antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-navy-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo size="md" tone="light" />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-slate-400 transition-colors hover:text-emerald-400">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link
              to={isAuthenticated ? "/dashboard" : "/auth"}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/45 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-200 transition-all hover:border-emerald-300 hover:bg-emerald-400/20 hover:text-emerald-100"
            >
              {isAuthenticated ? "Dashboard" : "Log in"}
            </Link>
            <a
              href="#pricing"
              aria-label="Subscribe"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 text-sm font-semibold text-navy-950 shadow-[0_4px_16px_rgb(16_185_129/_0.35)] transition-all hover:bg-emerald-300 hover:shadow-[0_6px_22px_rgb(16_185_129/_0.45)] sm:px-4"
            >
              <span className="hidden sm:inline">Subscribe</span>
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* ═══════════ HERO ═══════════ */}
        <section className="relative overflow-hidden">
          {/* Animated gradient mesh background */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-emerald-500/12 blur-[120px]" />
            <div className="absolute -right-1/4 top-1/3 h-[500px] w-[500px] rounded-full bg-teal-400/10 blur-[100px]" />
            <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-cyan-400/8 blur-[80px]" />
          </div>
          {/* Grid pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="mx-auto max-w-4xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 text-sm font-medium text-emerald-300 backdrop-blur-sm"
              >
                <Sparkles className="size-4" />
                Distressed property leads, sourced &amp; verified
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
                className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]"
              >
                Distressed property leads,
                <span className="mt-1 block bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                  verified before you buy.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
                className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-slate-400"
              >
                Deal Forge gives subscribers a steady stream of source-verified distressed property
                leads — sheriff sales, tax sales, and foreclosures — each backed by public-record
                evidence. No fabricated data. No guessing.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
                className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <a
                  href="#pricing"
                  className="group inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-400 px-8 py-4 text-base font-semibold text-navy-950 shadow-[0_8px_32px_rgb(16_185_129/_0.4)] transition-all hover:bg-emerald-300 hover:shadow-[0_12px_44px_rgb(16_185_129/_0.5)] sm:w-auto"
                >
                  Subscribe now
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
                </a>
                <Link
                  to="/demo"
                  className="group inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-base font-semibold text-slate-200 backdrop-blur transition-all hover:border-emerald-400/40 hover:bg-white/[0.08] hover:text-emerald-300 sm:w-auto"
                >
                  <Play className="size-4 transition-transform group-hover:scale-110" />
                  Watch demo
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.5 }}
                className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="size-3.5 text-emerald-500/70" /> Secure Stripe checkout
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCcw className="size-3.5 text-emerald-500/70" /> Cancel anytime
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-emerald-500/70" /> No fabricated data
                </span>
              </motion.div>
            </div>

            {/* Lead preview card — glass morphism */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
              className="mx-auto mt-16 max-w-3xl"
            >
              <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-[0_24px_80px_-20px_rgb(0_0_0/0.7)] backdrop-blur-xl sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/20">
                      <Building2 className="size-6" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Verified lead · 4 days ago</div>
                      <div className="text-sm text-slate-400">Detroit, MI · Wayne County</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-1 text-xs font-semibold text-emerald-300">
                    <BadgeCheck className="size-3.5" /> VERIFIED
                  </span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Distress score", value: "86 / 100" },
                    { label: "Source", value: "Sheriff sale" },
                    { label: "Evidence", value: "Public record ✓" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 ring-1 ring-inset ring-white/[0.04]">
                      <div className="text-xs font-medium text-slate-500">{item.label}</div>
                      <div className="mt-1.5 text-base font-semibold text-slate-100">{item.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-3.5 text-sm ring-1 ring-inset ring-white/[0.04]">
                  <span className="text-slate-400">Est. spread (ARV − repairs − purchase)</span>
                  <span className="font-bold text-emerald-400">$32,400</span>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-slate-600">
                Illustrative lead summary — every real lead ships with its source URL, reference, and date.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ═══════════ STATS ═══════════ */}
        <section className="relative border-y border-white/5 bg-white/[0.01]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={stagger}
              className="grid grid-cols-2 gap-6 md:grid-cols-4"
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  custom={i}
                  variants={fadeUp}
                  className="group text-center"
                >
                  <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 transition-colors group-hover:bg-emerald-400/15">
                    <stat.icon className="size-5" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">{stat.value}</div>
                  <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ═══════════ SOURCES ═══════════ */}
        <section className="border-b border-white/5 bg-navy-900/40">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-slate-500">Leads sourced from public records &amp; trusted marketplaces</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {sources.map((source) => (
                <span key={source} className="text-sm font-semibold text-slate-500/80 transition-colors hover:text-slate-400">
                  {source}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════ HOW IT WORKS ═══════════ */}
        <section id="how-it-works" className="scroll-mt-20 py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.span custom={0} variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                How it works
              </motion.span>
              <motion.h2 custom={1} variants={fadeUp} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                From subscription to closed deal in three steps
              </motion.h2>
              <motion.p custom={2} variants={fadeUp} className="mt-4 text-lg text-slate-400">
                A simple, honest pipeline — no spreadsheets, no guesswork.
              </motion.p>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={stagger}
              className="mt-14 grid gap-6 md:grid-cols-3"
            >
              {steps.map((step, index) => (
                <motion.div
                  key={step.title}
                  custom={index}
                  variants={fadeUp}
                  className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8 transition-all hover:border-emerald-400/20 hover:bg-white/[0.04]"
                >
                  {/* Subtle glow on hover */}
                  <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-emerald-400/0 transition-all duration-500 group-hover:bg-emerald-400/5" />
                  <div className="absolute -top-3 left-8 rounded-full bg-emerald-400 px-3.5 py-1 text-xs font-bold text-navy-950 shadow-[0_2px_12px_rgb(16_185_129/_0.4)]">
                    Step {index + 1}
                  </div>
                  <div className="relative mt-4 flex size-13 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/15 transition-colors group-hover:bg-emerald-400/15">
                    <step.icon className="size-6" />
                  </div>
                  <h3 className="relative mt-5 text-lg font-semibold text-slate-100">{step.title}</h3>
                  <p className="relative mt-2.5 text-[15px] leading-relaxed text-slate-400">{step.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ═══════════ FEATURES ═══════════ */}
        <section id="features" className="scroll-mt-20 border-t border-white/5 bg-white/[0.01] py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.span custom={0} variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                Features
              </motion.span>
              <motion.h2 custom={1} variants={fadeUp} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Everything you need to trust the deal
              </motion.h2>
              <motion.p custom={2} variants={fadeUp} className="mt-4 text-lg text-slate-400">
                Built for wholesalers who demand proof before they commit capital.
              </motion.p>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={stagger}
              className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3"
            >
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  custom={i}
                  variants={fadeUp}
                  className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/25 hover:bg-white/[0.04] hover:shadow-[0_16px_48px_-12px_rgb(16_185_129/_0.2)]"
                >
                  <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-emerald-400/0 transition-all duration-500 group-hover:bg-emerald-400/5" />
                  <div className="relative flex size-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/15 transition-all group-hover:bg-emerald-400/15 group-hover:ring-emerald-400/25">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="relative mt-5 text-lg font-semibold text-slate-100">{feature.title}</h3>
                  <p className="relative mt-2.5 text-[15px] leading-relaxed text-slate-400">{feature.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ═══════════ PRICING ═══════════ */}
        <section id="pricing" className="scroll-mt-20 py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.span custom={0} variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                Pricing
              </motion.span>
              <motion.h2 custom={1} variants={fadeUp} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Simple monthly plans, cancel anytime
              </motion.h2>
              <motion.p custom={2} variants={fadeUp} className="mt-4 text-lg text-slate-400">
                Billed securely through Stripe. No contracts, no hidden fees.
              </motion.p>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={stagger}
              className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3"
            >
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.key}
                  custom={i}
                  variants={fadeUp}
                  className={cn(
                    "relative flex flex-col rounded-3xl border bg-white/[0.02] p-8 transition-all duration-300",
                    plan.popular
                      ? "border-emerald-400/50 shadow-[0_24px_80px_-20px_rgb(16_185_129/_0.3)] hover:shadow-[0_32px_100px_-20px_rgb(16_185_129/_0.4)]"
                      : "border-white/[0.08] hover:border-emerald-400/20",
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-emerald-400 px-5 py-1.5 text-xs font-bold text-navy-950 shadow-[0_4px_16px_rgb(16_185_129/_0.4)]">
                        MOST POPULAR
                      </span>
                    </div>
                  )}
                  <h3 className="text-lg font-semibold text-slate-100">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{plan.desc}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    {plan.price === null ? (
                      <span className="text-4xl font-bold text-slate-100">Custom</span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold tracking-tight text-slate-100">${plan.price}</span>
                        <span className="text-sm text-slate-500">/ month</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      plan.price === null
                        ? navigate("/#contact")
                        : handleSubscribe(plan.key)
                    }
                    disabled={checkingOut !== null}
                    className={cn(
                      "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all",
                      plan.popular
                        ? "bg-emerald-400 text-navy-950 shadow-[0_4px_16px_rgb(16_185_129/_0.3)] hover:bg-emerald-300 hover:shadow-[0_8px_28px_rgb(16_185_129/_0.4)]"
                        : "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-emerald-400/30 hover:bg-white/[0.08] hover:text-emerald-300",
                      checkingOut !== null && "cursor-wait opacity-60",
                    )}
                  >
                    {checkingOut === plan.key ? "Opening checkout…" : plan.cta}
                    {checkingOut !== plan.key && <ArrowRight className="size-4" />}
                  </button>
                  <ul className="mt-8 space-y-3.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-slate-400">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400/80" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>
            <p className="mt-8 text-center text-sm text-slate-400">
              Questions about which plan fits?{" "}
              <a href="#contact" className="font-medium text-emerald-400 hover:text-emerald-300">
                Contact us
              </a>
              .
            </p>
          </div>
        </section>

        {/* ═══════════ FAQ ═══════════ */}
        <section id="faq" className="scroll-mt-20 border-t border-white/5 bg-white/[0.01] py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={stagger}
            >
              <motion.div custom={0} variants={fadeUp} className="text-center">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">FAQ</span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight">Frequently asked questions</h2>
              </motion.div>
              <motion.div custom={1} variants={fadeUp} className="mt-10 divide-y divide-white/10 border-t border-white/10">
                {faqs.map((faq) => (
                  <FAQItem key={faq.q} q={faq.q} a={faq.a} />
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════ CONTACT ═══════════ */}
        <section id="contact" className="scroll-mt-20 py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger}
              className="mx-auto max-w-2xl text-center"
            >
              <motion.span custom={0} variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
                Contact
              </motion.span>
              <motion.h2 custom={1} variants={fadeUp} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                We're here to help
              </motion.h2>
              <motion.p custom={2} variants={fadeUp} className="mt-4 text-lg text-slate-400">
                Questions about a plan, a lead, or your subscription? Reach out any time.
              </motion.p>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={stagger}
              className="mt-12 grid gap-5 sm:grid-cols-2"
            >
              <motion.a
                custom={0}
                variants={fadeUp}
                href={`mailto:${CONTACT_EMAIL}`}
                className="group flex items-start gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-7 transition-all duration-300 hover:border-emerald-400/25 hover:bg-white/[0.04] hover:shadow-[0_16px_48px_-12px_rgb(16_185_129/_0.2)]"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/15 transition-colors group-hover:bg-emerald-400/15">
                  <Mail className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Email us</div>
                  <div className="mt-1 text-sm text-slate-400">{CONTACT_EMAIL}</div>
                  <div className="mt-1 text-sm text-slate-500">We reply within 2 business days.</div>
                </div>
              </motion.a>
              <motion.div
                custom={1}
                variants={fadeUp}
                className="flex items-start gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-7"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/15">
                  <MapPin className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Business address status</div>
                  <div className="mt-1 text-sm text-slate-400">{SUPPORT_ADDRESS}</div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ═══════════ FINAL CTA ═══════════ */}
        <section className="pb-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
              className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 px-8 py-16 text-center shadow-[0_24px_80px_-24px_rgb(16_185_129/_0.55)] sm:px-12"
            >
              {/* Decorative orbs */}
              <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-white/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-20 size-72 rounded-full bg-navy-950/15 blur-3xl" />
              <div className="pointer-events-none absolute right-1/4 top-1/2 size-40 -translate-y-1/2 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <h2 className="text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
                  Stop guessing. Start closing.
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-lg text-navy-900/70">
                  Join wholesalers who verify every lead before they spend a dollar on outreach.
                </p>
                <a
                  href="#pricing"
                  className="group mt-9 inline-flex items-center gap-2.5 rounded-2xl bg-navy-950 px-9 py-4 text-base font-semibold text-emerald-300 shadow-lg transition-all hover:bg-navy-900 hover:shadow-xl"
                >
                  Subscribe now
                  <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
