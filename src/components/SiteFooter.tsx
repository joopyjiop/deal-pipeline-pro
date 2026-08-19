import { Link, useLocation } from "react-router";
import { Logo } from "@/components/Logo";
import { Mail, MapPin } from "lucide-react";

/** Public business contact for the Deal Forge marketing site. */
export const CONTACT_EMAIL = "support@dealforge.homes";
export const SUPPORT_ADDRESS = "Deal Forge LLC · 100 Congress Ave, Suite 1100 · Austin, TX 78701";

/**
 * Standard professional site footer shared by the landing page and the legal
 * page. The legal links are anchors: on `/legal` they smooth-scroll to the
 * matching section on the same page (no reload, no navigation); from anywhere
 * else they navigate to `/legal#<section>` once and the page scrolls to it.
 */
export function SiteFooter() {
  const { pathname } = useLocation();
  const onLegal = pathname === "/legal";

  // Legal anchors scroll in place on the legal page; elsewhere they route to
  // the legal page first.
  const legalHref = (section: string) => (onLegal ? `#${section}` : `/legal#${section}`);
  // Product/company anchors live on the landing page.
  const sectionHref = (section: string) => `/#${section}`;

  const productLinks = [
    { label: "How it works", href: sectionHref("how-it-works") },
    { label: "Features", href: sectionHref("features") },
    { label: "Pricing", href: sectionHref("pricing") },
    { label: "FAQ", href: sectionHref("faq") },
  ];

  const companyLinks = [
    { label: "Contact", href: onLegal ? "#contact" : sectionHref("contact") },
    { label: "Become a buyer", href: "/buyers" },
    { label: "Sign in", href: "/auth" },
  ];

  const legalLinks = [
    { label: "Privacy Policy", href: legalHref("privacy") },
    { label: "Terms of Service", href: legalHref("terms") },
    { label: "Cancellation Policy", href: legalHref("cancellation") },
  ];

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-2">
              <Logo size="md" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
              Source-verified distressed property leads for wholesale real
              estate investors. Every lead carries real evidence — never
              fabricated data.
            </p>
            <div className="mt-5 flex items-start gap-2 text-sm text-slate-500">
              <MapPin className="mt-0.5 size-4 shrink-0 text-indigo-600" />
              <span>100 Congress Ave, Suite 1100, Austin, TX 78701</span>
            </div>
          </div>

          <nav aria-label="Product">
            <h4 className="text-sm font-semibold text-slate-900">Product</h4>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-slate-500 transition-colors hover:text-indigo-600">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h4 className="text-sm font-semibold text-slate-900">Company</h4>
            <ul className="mt-4 space-y-2.5">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-slate-500 transition-colors hover:text-indigo-600">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h4 className="text-sm font-semibold text-slate-900">Legal</h4>
            <ul className="mt-4 space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-slate-500 transition-colors hover:text-indigo-600">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-5 flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-600"
            >
              <Mail className="size-4 text-indigo-600" />
              {CONTACT_EMAIL}
            </a>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 md:flex-row">
          <p className="text-sm text-slate-500">© 2026 Deal Forge. All rights reserved.</p>
          <div className="flex items-center gap-5 text-sm text-slate-500">
            <span className="hidden sm:inline">Secure checkout via Stripe</span>
            <Link to={legalHref("privacy")} className="transition-colors hover:text-indigo-600">Privacy</Link>
            <Link to={legalHref("terms")} className="transition-colors hover:text-indigo-600">Terms</Link>
            <Link to={legalHref("cancellation")} className="transition-colors hover:text-indigo-600">Cancellation</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
