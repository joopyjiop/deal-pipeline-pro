import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { Logo } from "@/components/Logo";
import { SiteFooter, CONTACT_EMAIL, SUPPORT_ADDRESS } from "@/components/SiteFooter";
import { Mail, MapPin, ShieldCheck } from "lucide-react";

const sections = [
  { id: "privacy", label: "Privacy Policy" },
  { id: "terms", label: "Terms of Service" },
  { id: "cancellation", label: "Cancellation Policy" },
] as const;

/**
 * Single combined legal page. All three policies live here, stacked
 * vertically. The footer (and this page's own nav) link to `#privacy`,
 * `#terms`, and `#cancellation` — same-page anchors that smooth-scroll to the
 * matching section without reloading or navigating away.
 */
export default function Legal() {
  const { hash } = useLocation();

  // When arriving with a hash (e.g. /legal#privacy), smooth-scroll to the
  // section instead of snapping instantly.
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        // Small delay lets the page paint first.
        const id = window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
        return () => window.clearTimeout(id);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [hash]);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo size="md" />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Legal sections">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="text-sm text-slate-500 transition-colors hover:text-indigo-600">
                {section.label}
              </a>
            ))}
            <Link to="/" className="text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700">
              ← Back to home
            </Link>
          </nav>
          <Link to="/" className="text-sm font-medium text-indigo-600 md:hidden">
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
            <ShieldCheck className="size-3.5" />
            Legal center
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Legal &amp; policies</h1>
          <p className="mt-3 text-slate-500">
            Everything about how Deal Forge handles your data, your subscription, and cancellation.
            Last updated: August 19, 2026.
          </p>
        </div>

        {/* ── Privacy Policy ─────────────────────────────────────────────── */}
        <section id="privacy" className="scroll-mt-24 border-t border-slate-200 py-12 first:border-t-0">
          <h2 className="text-2xl font-bold tracking-tight">Privacy Policy</h2>
          <p className="mt-2 text-sm text-slate-500">Effective August 19, 2026</p>

          <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-slate-600">
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Information we collect</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Account information.</strong> When you create an account or sign in, we collect
                  your name and email address.
                </li>
                <li>
                  <strong>Payment information.</strong> Subscription payments are processed by{" "}
                  <strong>Stripe</strong>, our payment processor. We do not see or store your full card
                  number. Stripe may share with us your billing status, the last four digits of your card,
                  and your billing email so we can manage your subscription and send receipts.
                </li>
                <li>
                  <strong>Usage information.</strong> We may collect information about how you use the
                  service — pages visited, features used, and device/browser details — to operate and
                  improve the product.
                </li>
                <li>
                  <strong>Lead activity.</strong> Data you save, match, or export within the platform is
                  stored to provide the service to you.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">How we use your information</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li>Provide, operate, and maintain your account and the Deal Forge service.</li>
                <li>Process your subscription, send receipts and billing notices, and manage renewals.</li>
                <li>Send service and account notifications (we do not send marketing you haven't opted into).</li>
                <li>Improve the product, prevent fraud and abuse, and comply with legal obligations.</li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">We never sell your data</h3>
              <p>
                Deal Forge <strong>never sells your personal information to third parties</strong>. We do
                not rent, trade, or license your data to anyone for advertising or any other purpose. We
                only share information with the service providers required to run the product (such as
                Stripe for payments and our hosting provider), and only to the extent needed to deliver
                the service to you.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Security &amp; retention</h3>
              <p>
                We use encryption in transit and industry-standard safeguards to protect your data. We
                retain your information for as long as your account is active and as needed to comply
                with legal obligations. You may request access to, correction of, or deletion of your
                personal data at any time by emailing {CONTACT_EMAIL}.
              </p>
            </div>
          </div>
        </section>

        {/* ── Terms of Service ───────────────────────────────────────────── */}
        <section id="terms" className="scroll-mt-24 border-t border-slate-200 py-12">
          <h2 className="text-2xl font-bold tracking-tight">Terms of Service</h2>
          <p className="mt-2 text-sm text-slate-500">Effective August 19, 2026</p>

          <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-slate-600">
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">The service</h3>
              <p>
                Deal Forge is a subscription service that provides access to source-verified distressed
                property leads and related wholesale real estate tools. Leads are drawn from public
                records and other permitted sources. We work to verify the data we publish, and every
                lead carries source evidence, but we do not guarantee that any particular property will
                close or that the information is error-free.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Subscriptions &amp; billing</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Subscriptions are billed monthly in advance through Stripe. By subscribing you
                  authorize Stripe to charge the payment method on file at the then-current rate.
                </li>
                <li>
                  Your subscription renews automatically each billing period until cancelled. You can
                  cancel at any time — see the Cancellation Policy below.
                </li>
                <li>
                  Prices are stated in U.S. dollars and may exclude applicable taxes. We may change
                  prices for future billing periods with reasonable notice; the price in effect at
                  renewal will be shown before you are charged.
                </li>
                <li>
                  Access to the service requires a valid account. If a payment fails, we may suspend
                  access until the balance is settled.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Acceptable use</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li>You may use leads for legitimate real estate investing and wholesaling purposes.</li>
                <li>
                  You may not resell, redistribute, or scrape the lead data or grant access to your
                  account to third parties.
                </li>
                <li>
                  You may not use the service for unlawful purposes, to harass or defraud anyone, or in
                  violation of the Telephone Consumer Protection Act (TCPA) or similar regulations.
                </li>
                <li>
                  You may not attempt to access, disrupt, or reverse-engineer the service or its
                  infrastructure.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">No professional advice</h3>
              <p>
                Deal Forge provides data and tools, not legal, tax, or financial advice. You are
                responsible for your own investment decisions and for complying with all applicable laws
                when contacting property owners or buyers.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">Limitation of liability</h3>
              <p>
                To the maximum extent permitted by law, Deal Forge's total liability arising out of your
                use of the service is limited to the amount you paid for your subscription in the twelve
                months preceding the claim. The service is provided "as is" without warranties of any
                kind. We may suspend or terminate accounts that violate these terms.
              </p>
            </div>
          </div>
        </section>

        {/* ── Cancellation Policy ────────────────────────────────────────── */}
        <section id="cancellation" className="scroll-mt-24 border-t border-slate-200 py-12">
          <h2 className="text-2xl font-bold tracking-tight">Cancellation Policy</h2>
          <p className="mt-2 text-sm text-slate-500">Effective August 19, 2026</p>

          <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-slate-600">
            <div>
              <h3 className="mb-2 font-semibold text-slate-900">You can cancel anytime</h3>
              <p>
                There are no long-term contracts. You can cancel your Deal Forge subscription at any
                time, for any reason, with no cancellation fee.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">How to cancel</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>In your account:</strong> go to your billing settings in the dashboard and
                  select "Cancel subscription." You'll be asked to confirm.
                </li>
                <li>
                  <strong>By email:</strong> email {CONTACT_EMAIL} with the subject line "Cancel my
                  subscription" and the email address on your account. We'll confirm the cancellation
                  within 2 business days.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">What happens after you cancel</h3>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Your access continues through the end of the current billing period you've already paid
                  for.
                </li>
                <li>
                  Your subscription will not renew and you will not be charged again.
                </li>
                <li>
                  We do not provide partial-month refunds. Because access remains available for the full
                  paid period, no prorated credit is issued.
                </li>
                <li>
                  After the paid period ends, your account returns to limited access. You can resubscribe
                  at any time.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── Contact ────────────────────────────────────────────────────── */}
        <section id="contact" className="scroll-mt-24 border-t border-slate-200 py-12">
          <h2 className="text-2xl font-bold tracking-tight">Contact us</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
            Questions about your subscription, your data, or anything else? We're happy to help.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
            >
              <Mail className="mt-0.5 size-5 shrink-0 text-indigo-600" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Email</div>
                <div className="mt-1 text-sm text-slate-500">{CONTACT_EMAIL}</div>
              </div>
            </a>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <MapPin className="mt-0.5 size-5 shrink-0 text-indigo-600" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Support address</div>
                <div className="mt-1 text-sm text-slate-500">{SUPPORT_ADDRESS}</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
