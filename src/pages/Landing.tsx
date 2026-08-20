import { Link, useLocation, useNavigate } from "react-router";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { SiteFooter, CONTACT_EMAIL, SUPPORT_ADDRESS } from "@/components/SiteFooter";
import { cn } from "@/lib/utils";

/**
 * Stripe Price IDs for the monthly subscription plans.
 * ⚠️ REPLACE these with the real Price IDs from your Stripe dashboard
 * (Products → your product → the monthly recurring price → API ID). Until then
 * the Subscribe buttons will report that checkout isn't configured.
 */
const PRICE_IDS: Record<string, string> = {
  starter: "price_replace_with_your_starter_price_id",
  pro: "price_replace_with_your_pro_price_id",
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

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen((value) => !value)}
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
      {open && <p className="pb-5 text-[15px] leading-relaxed text-slate-400">{a}</p>}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const createCheckout = useAction(api.stripe.createCheckoutSession);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  // Smooth-scroll to the section named by the URL hash (e.g. /#pricing, or a
  // return from the auth flow), and jump to the top when there's no hash.
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
      // Sign in first, then return them to the pricing section.
      navigate("/auth?returnTo=/#pricing");
      return;
    }
    setCheckingOut(planKey);
    try {
      const origin = window.location.origin;
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
      <header className="sticky top-0 z-40 border-b border-white/5 bg-navy-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo size="md" tone="light" />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-slate-400 transition-colors hover:text-emerald-400">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="hidden text-sm text-slate-400 transition-colors hover:text-emerald-400 sm:block">
              Sign in
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-navy-950 shadow-[0_4px_16px_rgb(16_185_129_/_0.35)] transition-all hover:bg-emerald-300 hover:shadow-[0_6px_22px_rgb(16_185_129_/_0.45)]"
            >
              Subscribe <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(16_185_129/0.14),transparent_60%)]" />
          <div className="pointer-events-none absolute -top-24 right-0 size-[34rem] rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
                <Sparkles className="size-4" />
                Distressed property leads, sourced &amp; verified
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Distressed property leads,
                <span className="block bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
                  verified before you buy.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
                Deal Forge gives subscribers a steady stream of source-verified distressed property
                leads — sheriff sales, tax sales, and foreclosures — each backed by public-record
                evidence. No fabricated data. No guessing.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="#pricing"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-7 py-3.5 text-base font-semibold text-navy-950 shadow-[0_8px_28px_rgb(16_185_129_/_0.35)] transition-all hover:bg-emerald-300 hover:shadow-[0_10px_36px_rgb(16_185_129_/_0.45)] sm:w-auto"
                >
                  Subscribe now <ArrowRight className="size-5" />
                </a>
                <Link
                  to="/demo"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-base font-semibold text-slate-200 backdrop-blur transition-colors hover:border-emerald-400/40 hover:text-emerald-300 sm:w-auto"
                >
                  <Play className="size-4" /> Watch demo
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="size-4 text-emerald-400" /> Secure Stripe checkout
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCcw className="size-4 text-emerald-400" /> Cancel anytime
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-400" /> No fabricated data
                </span>
              </div>
            </div>

            {/* Lead preview card */}
            <div className="mx-auto mt-16 max-w-3xl">
              <div className="rounded-2xl border border-white/10 bg-navy-900/70 p-6 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.6)] backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                      <Building2 className="size-6" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Verified lead · 4 days ago</div>
                      <div className="text-sm text-slate-400">Detroit, MI · Wayne County</div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <BadgeCheck className="size-3.5" /> VERIFIED
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Distress score", value: "86 / 100" },
                    { label: "Source", value: "Sheriff sale" },
                    { label: "Evidence", value: "Public record ✓" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/10 bg-navy-950/60 p-4">
                      <div className="text-xs font-medium text-slate-500">{item.label}</div>
                      <div className="mt-1 text-base font-semibold text-slate-100">{item.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-navy-950/60 px-4 py-3 text-sm">
                  <span className="text-slate-400">Est. spread (ARV − repairs − purchase)</span>
                  <span className="font-semibold text-emerald-400">$32,400</span>
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-slate-500">
                Illustrative lead summary — every real lead ships with its source URL, reference, and date.
              </p>
            </div>
          </div>
        </section>

        {/* Sources */}
        <section className="border-y border-white/5 bg-navy-900/40">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-slate-500">Leads sourced from public records &amp; trusted marketplaces</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {sources.map((source) => (
                <span key={source} className="text-sm font-semibold text-slate-500">
                  {source}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">How it works</span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                From subscription to closed deal in three steps
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                A simple, honest pipeline — no spreadsheets, no guesswork.
              </p>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.title} className="relative rounded-2xl border border-white/10 bg-navy-900/60 p-7">
                  <div className="absolute -top-3 left-7 rounded-full bg-emerald-400 px-3 py-0.5 text-xs font-bold text-navy-950">
                    Step {index + 1}
                  </div>
                  <div className="mt-4 flex size-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                    <step.icon className="size-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-100">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-white/5 bg-navy-900/40 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Features</span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Everything you need to trust the deal
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                Built for wholesalers who demand proof before they commit capital.
              </p>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-white/10 bg-navy-900/60 p-6 transition-all hover:-translate-y-0.5 hover:border-emerald-400/30 hover:shadow-[0_12px_36px_-12px_rgb(16_185_129_/_0.25)]"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-100">{feature.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Pricing</span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Simple monthly plans, cancel anytime
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                Billed securely through Stripe. No contracts, no hidden fees.
              </p>
            </div>
            <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.key}
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-navy-900/60 p-7",
                    plan.popular
                      ? "border-emerald-400/70 shadow-[0_20px_60px_-20px_rgb(16_185_129_/_0.35)]"
                      : "border-white/10",
                  )}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 px-4 py-1 text-xs font-bold text-navy-950">
                      MOST POPULAR
                    </span>
                  )}
                  <h3 className="text-lg font-semibold text-slate-100">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{plan.desc}</p>
                  <div className="mt-5 flex items-baseline gap-1">
                    {plan.price === null ? (
                      <span className="text-4xl font-bold text-slate-100">Custom</span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold text-slate-100">${plan.price}</span>
                        <span className="text-sm text-slate-400">/ month</span>
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
                      "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all",
                      plan.popular
                        ? "bg-emerald-400 text-navy-950 hover:bg-emerald-300 hover:shadow-[0_8px_24px_rgb(16_185_129_/_0.35)]"
                        : "border border-white/15 bg-white/5 text-slate-200 hover:border-emerald-400/40 hover:text-emerald-300",
                      checkingOut !== null && "cursor-wait opacity-60",
                    )}
                  >
                    {checkingOut === plan.key ? "Opening checkout…" : plan.cta}
                    {checkingOut !== plan.key && <ArrowRight className="size-4" />}
                  </button>
                  <ul className="mt-7 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-slate-400">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-slate-400">
              Questions about which plan fits?{" "}
              <a href="#contact" className="font-medium text-emerald-400 hover:text-emerald-300">
                Contact us
              </a>
              .
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-white/5 bg-navy-900/40 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">FAQ</span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">Frequently asked questions</h2>
            </div>
            <div className="mt-10 divide-y divide-white/10 border-t border-white/10">
              {faqs.map((faq) => (
                <FAQItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 py-20 lg:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Contact</span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">We're here to help</h2>
              <p className="mt-4 text-lg text-slate-400">
                Questions about a plan, a lead, or your subscription? Reach out any time.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex items-start gap-4 rounded-2xl border border-white/10 bg-navy-900/60 p-6 transition-colors hover:border-emerald-400/30 hover:shadow-[0_12px_36px_-12px_rgb(16_185_129_/_0.25)]"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                  <Mail className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Email us</div>
                  <div className="mt-1 text-sm text-slate-400">{CONTACT_EMAIL}</div>
                  <div className="mt-1 text-sm text-slate-500">We reply within 2 business days.</div>
                </div>
              </a>
              <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-navy-900/60 p-6">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                  <MapPin className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Business address status</div>
                  <div className="mt-1 text-sm text-slate-400">{SUPPORT_ADDRESS}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="pb-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 px-8 py-14 text-center shadow-[0_24px_80px_-24px_rgb(16_185_129_/_0.5)]">
              <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/15 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-16 size-64 rounded-full bg-navy-950/20 blur-2xl" />
              <div className="relative">
                <h2 className="text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl">
                  Stop guessing. Start closing.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-lg text-navy-900/80">
                  Join wholesalers who verify every lead before they spend a dollar on outreach.
                </p>
                <a
                  href="#pricing"
                  className="mt-8 inline-flex items-center gap-2 rounded-xl bg-navy-950 px-8 py-3.5 text-base font-semibold text-emerald-300 shadow-sm transition-all hover:bg-navy-900 hover:shadow-lg"
                >
                  Subscribe now <ArrowRight className="size-5" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
