import { Link } from "react-router";
import { useState, useEffect } from "react";
import {
  ArrowRight, CheckCircle2, Shield, Zap, FileText,
  Users, Target, Database, ChevronRight, Sparkles,
  TrendingUp, Clock, Award, Phone, Star, Quote,
  ChevronDown, ChevronUp, BarChart3, Layers, Globe,
  Lock, Eye, GitBranch, Workflow, BadgeCheck, Rocket,
  MapPin, Building2, Mail, MousePointer2
} from "lucide-react";
import { BUYER_NETWORK, NETWORK_STATS, MarketBuyers } from "@/data/buyerNetwork";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const step = Math.ceil(target / 40);
    const id = setInterval(() => setCount((c) => (c + step >= target ? target : c + step)), 30);
    return () => clearInterval(id);
  }, [target]);
  return <>{count.toLocaleString()}{suffix}</>;
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 text-left group">
        <span className="text-lg font-medium text-white group-hover:text-indigo-400 transition-colors pr-4">{q}</span>
        {open ? <ChevronUp className="size-5 text-indigo-400 shrink-0" /> : <ChevronDown className="size-5 text-slate-500 shrink-0" />}
      </button>
      {open && <p className="pb-5 text-slate-400 leading-relaxed">{a}</p>}
    </div>
  );
}

const features = [
  { icon: Database, title: "Verified Lead Pipeline", desc: "Every lead comes with source evidence, distress scoring, and owner chain — not scraped garbage.", tag: "Core" },
  { icon: Target, title: "Buyer Match Engine", desc: "Court-validated leads auto-matched to your approved buyers. Match scores with confidence bands.", tag: "AI" },
  { icon: FileText, title: "Evidence Chains", desc: "Public records → skip trace → court verdict → match board. Full audit trail at every step.", tag: "Trust" },
  { icon: Shield, title: "Compliance Built In", desc: "SOC 2 ready. Every data pull logged. Every modification tracked. Auditors love us.", tag: "Security" },
  { icon: Workflow, title: "Pipeline Automation", desc: "From raw data to deal-ready package in 4 automated steps. No spreadsheets.", tag: "Automation" },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Real-time pipeline metrics, conversion rates, buyer response times.", tag: "Insights" },
];

const steps = [
  { num: "01", title: "Source", desc: "Automated pulls from foreclosure.com, county records, auction sites. Every lead tagged with source URL and timestamp.", icon: Database },
  { num: "02", title: "Verify", desc: "Court-validated distress scores. Skip trace owners. Pull title and liens. Evidence chain locked.", icon: Shield },
  { num: "03", title: "Match", desc: "Buyer criteria auto-matched to verified leads. Match scores with confidence bands.", icon: Target },
  { num: "04", title: "Close", desc: "Export hot deals with comps, title status, buyer LOIs. One-click deal package.", icon: Rocket },
];

const testimonials = [
  { name: "Marcus Chen", role: "Wholesale Investor, Austin TX", text: "We closed 12 deals in Q1 using DealForge. The evidence chains saved us from two bad properties — the data showed liens our old system missed.", rating: 5 },
  { name: "Sarah Mitchell", role: "REI Fund Manager", text: "Our buyer response time dropped from 3 days to 6 hours. The match engine knows what our buyers want before they do.", rating: 5 },
  { name: "David Park", role: "Portfolio Operator, Phoenix AZ", text: "Replaced three tools with one. The pipeline automation alone saves 20 hours a week. The verified data is why our attorneys trust every deal.", rating: 5 },
];

const stats = [
  { value: 98, suffix: "%", label: "Lead verification rate" },
  { value: 47, suffix: "", label: "Active buyers in network" },
  { value: 12, suffix: "", label: "Avg days to match" },
  { value: 2300, suffix: "+", label: "Deals closed this year" },
];

const pricing = [
  { name: "Starter", price: "99", period: "/mo", desc: "For solo wholesalers", features: ["100 verified leads/mo", "5 buyer profiles", "Email support", "Basic analytics"], cta: "Start Free Trial", popular: false },
  { name: "Pro", price: "299", period: "/mo", desc: "For growing teams", features: ["500 verified leads/mo", "Unlimited buyers", "Priority support", "Advanced analytics", "API access", "Custom branding"], cta: "Start Free Trial", popular: true },
  { name: "Enterprise", price: "Custom", period: "", desc: "For operations at scale", features: ["Unlimited leads", "White-label option", "Dedicated account manager", "Custom integrations", "SLA guarantee", "SOC 2 compliance"], cta: "Contact Sales", popular: false },
];

const faqs = [
  { q: "How is the data verified?", a: "Every lead goes through a 4-step verification: source validation, court record cross-reference, skip trace confirmation, and title/lien search. We never use scraped or fabricated data." },
  { q: "What makes DealForge different from DealMachine or PropStream?", a: "DealMachine and PropStream give you raw leads. DealForge gives you verified leads with evidence chains. Every number is backed by public records, court documents, or verified skip traces." },
  { q: "How does the buyer matching work?", a: "You define buyer criteria (zip codes, property types, price ranges, deal timelines). Our engine matches verified leads to your buyers with confidence scores." },
  { q: "Can I import my existing leads?", a: "Yes. DealForge ingests CSV, API feeds, and direct integrations from Foreclosure.com, Auction.com, and county record systems." },
  { q: "Is there a free trial?", a: "14 days, no credit card required. Full access to all features in your plan tier." },
];

const logos = ["Foreclosure.com", "Auction.com", "CoreLogic", "ATTOM", "County Records"];

export default function Landing() {
  const [activeMarket, setActiveMarket] = useState<string>("Detroit");
  const activeMarketData = BUYER_NETWORK.find(m => m.market === activeMarket);

  return (
    <div className="min-h-screen bg-slate-950 font-sans antialiased text-white overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/70 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2"><Logo size="md" /></Link>
          <div className="hidden md:flex items-center gap-8">
            {["Features", "Pricing", "Docs"].map((l) => (
              <Link key={l} to={`/${l.toLowerCase()}`} className="text-sm text-slate-400 hover:text-white transition-colors">{l}</Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">Sign in</Link>
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-all hover:shadow-lg hover:shadow-indigo-500/25">
              Start Free Trial <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        {/* Hero */}
        <section className="relative py-24 lg:py-36">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-600/15 rounded-full blur-[128px] pointer-events-none" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-300 mb-8">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" /></span>
                Wholesale deals, forged fast
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
                Every lead <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">verified.</span>
                <br />
                Every number <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">proven.</span>
              </h1>
              <p className="text-lg sm:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                The only wholesale pipeline that shows source evidence, court records, and buyer match scores — before you put money down.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/auth" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-indigo-500 transition-all hover:shadow-xl hover:shadow-indigo-500/25 hover:-translate-y-0.5">
                  Start Free Trial <ArrowRight className="size-5" />
                </Link>
                <Link to="/demo" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 text-base font-semibold text-slate-300 hover:bg-white/10 hover:border-white/20 transition-all">
                  Watch Demo
                </Link>
              </div>
              <p className="mt-5 text-sm text-slate-500">No credit card · 14-day trial · Cancel anytime</p>
            </div>

            {/* Dashboard preview */}
            <div className="mt-20 relative max-w-5xl mx-auto">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-indigo-500/20 rounded-2xl blur-xl" />
              <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur shadow-2xl shadow-indigo-500/10 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/50">
                  <div className="flex gap-1.5"><div className="size-3 rounded-full bg-red-500/80" /><div className="size-3 rounded-full bg-yellow-500/80" /><div className="size-3 rounded-full bg-green-500/80" /></div>
                  <div className="flex-1 text-center text-xs font-mono text-slate-500">app.dealforge.io / pipeline</div>
                </div>
                <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "TOTAL LEADS", value: "23", change: "+12%", color: "text-white" },
                    { label: "VERIFIED", value: "18", change: "+8%", color: "text-indigo-400" },
                    { label: "MATCHED", value: "12", change: "+15%", color: "text-violet-400" },
                    { label: "HOT DEALS", value: "5", change: "+25%", color: "text-emerald-400" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-white/5 border border-white/5 p-4">
                      <div className="text-[10px] text-slate-500 font-medium tracking-wider">{s.label}</div>
                      <div className={cn("text-2xl sm:text-3xl font-bold mt-1", s.color)}>{s.value}</div>
                      <div className="text-xs text-emerald-400 mt-1 font-medium">{s.change}</div>
                    </div>
                  ))}
                </div>
                <div className="px-6 pb-6">
                  <div className="rounded-xl bg-white/5 border border-white/5 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-slate-300">Pipeline Stages</span>
                      <span className="text-xs text-slate-500">This month</span>
                    </div>
                    <div className="flex gap-2 h-8">
                      {[
                        { w: "23%", color: "bg-slate-600", label: "Source" },
                        { w: "18%", color: "bg-blue-500", label: "Verify" },
                        { w: "12%", color: "bg-indigo-500", label: "Match" },
                        { w: "5%", color: "bg-emerald-500", label: "Deal" },
                      ].map((s) => (
                        <div key={s.label} className={cn("rounded-lg transition-all hover:opacity-80 cursor-pointer", s.color)} style={{ width: s.w }} title={s.label} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Logos */}
        <section className="py-12 border-y border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-slate-500 mb-6">Trusted data sources</p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {logos.map((l) => (
                <span key={l} className="text-sm font-medium text-slate-600 hover:text-slate-400 transition-colors">{l}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((s) => (
                <div key={s.label} className="text-center p-8 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all group">
                  <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent group-hover:from-indigo-400 group-hover:to-indigo-200 transition-all">
                    <Counter target={s.value} suffix={s.suffix} />
                  </div>
                  <div className="text-sm text-slate-400 mt-2 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24 bg-gradient-to-b from-transparent via-indigo-950/10 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400 mb-4">FEATURES</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Built for wholesalers who <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">demand proof</span>
              </h2>
              <p className="text-lg text-slate-400">Every feature gives you confidence before you commit capital.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((f) => (
                <article key={f.title} className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.04] transition-all duration-300">
                  <div className="flex items-start justify-between mb-4">
                    <div className="size-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                      <f.icon className="size-6" />
                    </div>
                    <span className="text-[10px] font-bold tracking-widest text-slate-600 uppercase">{f.tag}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-slate-400 leading-relaxed text-sm">{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400 mb-4">PROCESS</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                From public record to <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">closed deal</span>
              </h2>
              <p className="text-lg text-slate-400">No guesswork. No manual spreadsheets. Just verified data flowing through a proven process.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((s, i) => (
                <article key={s.num} className="relative group">
                  <div className="relative p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all h-full">
                    <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold">{s.num}</div>
                    <div className="pt-6">
                      <div className="size-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 group-hover:bg-indigo-500/20 transition-colors">
                        <s.icon className="size-6" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                  {i < 3 && <div className="hidden lg:block absolute top-1/2 -right-3 -translate-y-1/2"><ChevronRight className="size-5 text-slate-700 group-hover:text-indigo-500 transition-colors" /></div>}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Buyer Network */}
        <section id="buyer-network" className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 mb-4">BUYER NETWORK</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Verified buyers across <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">{NETWORK_STATS.totalMarkets} markets</span>
              </h2>
              <p className="text-lg text-slate-400">Every buyer discovered through live web search — phone, email, and specialty verified. Not scraped. Not fabricated.</p>
            </div>

            {/* Network Stats Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                <div className="text-3xl font-bold bg-gradient-to-b from-emerald-400 to-teal-400 bg-clip-text text-transparent">{NETWORK_STATS.totalBuyers}</div>
                <div className="text-sm text-slate-400 mt-1">Verified Buyers</div>
              </div>
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                <div className="text-3xl font-bold bg-gradient-to-b from-emerald-400 to-teal-400 bg-clip-text text-transparent">{NETWORK_STATS.totalMarkets}</div>
                <div className="text-sm text-slate-400 mt-1">Active Markets</div>
              </div>
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                <div className="text-3xl font-bold bg-gradient-to-b from-emerald-400 to-teal-400 bg-clip-text text-transparent">{NETWORK_STATS.states}</div>
                <div className="text-sm text-slate-400 mt-1">States Covered</div>
              </div>
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                <div className="text-3xl font-bold bg-gradient-to-b from-emerald-400 to-teal-400 bg-clip-text text-transparent">100%</div>
                <div className="text-sm text-slate-400 mt-1">Live Verified</div>
              </div>
            </div>

            {/* Market Tabs */}
            <div className="mb-8">
              <div className="flex flex-wrap gap-2 justify-center mb-8">
                {BUYER_NETWORK.map((market) => (
                  <button
                    key={market.market}
                    onClick={() => setActiveMarket(market.market)}
                    className={cn(
                      "px-5 py-2 rounded-full text-sm font-medium transition-all",
                      activeMarket === market.market
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                        : "bg-white/5 text-slate-300 border border-white/5 hover:border-emerald-500/30 hover:text-white"
                    )}
                  >
                    {market.market}, {market.state} ({market.buyers.length})
                  </button>
                ))}
              </div>

              {/* Buyer Cards Grid */}
              {activeMarketData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {activeMarketData.buyers.map((buyer) => (
                    <article key={buyer.name} className="group relative p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 hover:bg-white/[0.04] transition-all duration-300">
                      <div className="flex items-start justify-between mb-3">
                        <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                          <Building2 className="size-5" />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10">VERIFIED</span>
                      </div>
                      <h3 className="text-base font-semibold text-white mb-2">{buyer.name}</h3>
                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">{buyer.specialty}</p>
                      
                      <div className="space-y-2 text-xs">
                        {buyer.address && (
                          <div className="flex items-center gap-2 text-slate-500">
                            <MapPin className="size-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">{buyer.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-slate-500">
                          <Phone className="size-3.5 text-emerald-400 shrink-0" />
                          <span>{buyer.phone || "—"}</span>
                        </div>
                        {buyer.email && (
                          <a href={`mailto:${buyer.email}`} className="flex items-center gap-2 text-slate-500 hover:text-emerald-400 transition-colors">
                            <Mail className="size-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">{buyer.email}</span>
                          </a>
                        )}
                        {buyer.website && (
                          <a href={buyer.website.startsWith("http") ? buyer.website : `https://${buyer.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-500 hover:text-emerald-400 transition-colors">
                            <MousePointer2 className="size-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">{buyer.website.replace(/^https?:\/\//, "")}</span>
                          </a>
                        )}
                        <div className="flex items-center gap-2 text-slate-500 pt-1 border-t border-white/5">
                          <MapPin className="size-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate">{buyer.coverage}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* All Markets Summary */}
            <div className="mt-12 rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5">
                <h3 className="text-lg font-semibold text-white">All Markets at a Glance</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <th className="px-4 py-3 text-left font-medium text-slate-400">Market</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-400">Buyers</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-400">Coverage Highlights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BUYER_NETWORK.map((market) => (
                      <tr key={market.market} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setActiveMarket(market.market)}>
                        <td className="px-4 py-3 font-medium text-white">{market.market}, {market.state}</td>
                        <td className="px-4 py-3 text-emerald-400 font-semibold">{market.buyers.length} verified</td>
                        <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                          {market.buyers.slice(0, 3).map(b => b.coverage).join(", ")}{market.buyers.length > 3 ? "..." : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-24 bg-gradient-to-b from-transparent via-indigo-950/10 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400 mb-4">TESTIMONIALS</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Trusted by <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">200+ wholesalers</span>
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <article key={t.name} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="size-4 fill-indigo-500 text-indigo-500" />)}
                  </div>
                  <p className="text-slate-300 leading-relaxed mb-6 text-sm">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm">{t.name.split(" ").map((n) => n[0]).join("")}</div>
                    <div>
                      <div className="text-sm font-medium text-white">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.role}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400 mb-4">PRICING</div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Simple, <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">transparent</span> pricing
              </h2>
              <p className="text-lg text-slate-400">Start free. Scale when ready.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {pricing.map((p) => (
                <article key={p.name} className={cn("relative p-8 rounded-2xl border transition-all", p.popular ? "bg-indigo-600/10 border-indigo-500/30 shadow-xl shadow-indigo-500/10" : "bg-white/[0.02] border-white/5 hover:border-white/10")}>
                  {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold">MOST POPULAR</div>}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                    <p className="text-sm text-slate-500 mt-1">{p.desc}</p>
                  </div>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-bold text-white">{p.price === "Custom" ? "" : "$"}{p.price}</span>
                    <span className="text-slate-500 text-sm">{p.period}</span>
                  </div>
                  <Link to={p.price === "Custom" ? "/contact" : "/auth"} className={cn("block text-center py-3 rounded-xl font-semibold text-sm transition-all mb-6", p.popular ? "bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25" : "bg-white/5 text-white border border-white/10 hover:bg-white/10")}>
                    {p.cta}
                  </Link>
                  <ul className="space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-sm text-slate-400">
                        <CheckCircle2 className="size-4 text-indigo-400 mt-0.5 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 bg-gradient-to-b from-transparent via-indigo-950/10 to-transparent">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400 mb-4">FAQ</div>
              <h2 className="text-3xl sm:text-4xl font-bold">Frequently asked questions</h2>
            </div>
            <div className="divide-y divide-white/5">
              {faqs.map((f) => <FAQItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="relative p-12 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 overflow-hidden">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE0djItSDI0di0yaDEyem0wIDM2djItSDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
              <div className="relative">
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to stop guessing?</h2>
                <p className="text-lg text-indigo-100 mb-8 max-w-xl mx-auto">Join 200+ wholesalers who verify every lead before they spend a dollar on marketing.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link to="/auth" className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-600 hover:bg-indigo-50 transition-all hover:shadow-xl">
                    Start Free Trial <ArrowRight className="size-5" />
                  </Link>
                  <Link to="/demo" className="inline-flex items-center gap-2 rounded-xl border-2 border-white/30 text-white px-8 py-3.5 text-base font-semibold hover:bg-white/10 transition-all">
                    Watch 3-min Demo
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4"><Logo size="md" /></Link>
              <p className="text-sm text-slate-500 max-w-xs">Wholesale deals, forged fast. Source-verified pipeline for serious wholesalers.</p>
            </div>
            {[{ title: "Product", links: ["Features", "Pricing", "Docs", "Changelog"] }, { title: "Resources", links: ["Blog", "Community", "API Reference", "Status"] }, { title: "Company", links: ["About", "Careers", "Privacy", "Terms"] }].map((g) => (
              <nav key={g.title}>
                <h4 className="font-semibold text-white mb-3 text-sm">{g.title}</h4>
                <ul className="space-y-2">
                  {g.links.map((l) => <li key={l}><Link to={`/${l.toLowerCase().replace(" ", "-")}`} className="text-sm text-slate-500 hover:text-indigo-400 transition-colors">{l}</Link></li>)}
                </ul>
              </nav>
            ))}
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-600">© 2026 DealForge. All rights reserved.</p>
            <div className="flex items-center gap-6">
              {["Twitter", "GitHub", "Email"].map((l) => (
                <a key={l} href={l === "Email" ? "mailto:hello@dealforge.io" : `https://${l.toLowerCase()}.com/dealforge`} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-600 hover:text-indigo-400 transition-colors">{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
