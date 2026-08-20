import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Loader2, CreditCard } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";

/**
 * Route guard that requires an active Stripe subscription.
 * - Unauthenticated users are sent to /auth (like RequireAuth).
 * - Authenticated users without an active subscription are shown a
 *   paywall screen that routes them to the pricing section.
 * - The permanent owner bypasses the subscription check entirely.
 */
export function RequireSubscription({ children }: { children: ReactNode }) {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const subscription = useQuery(api.subscriptions.getSubscription);

  const isOwner = Boolean(
    user && (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com"),
  );

  // Still loading auth state
  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // Not authenticated — send to sign-in
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  // Owner bypasses the subscription gate
  if (isOwner) {
    return <>{children}</>;
  }

  // Subscription query still loading — show spinner
  if (subscription === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // No subscription — show the paywall
  if (!subscription || subscription.status !== "active") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy-950 px-5 text-center">
        <div className="max-w-md rounded-2xl border border-white/10 bg-navy-900/80 p-8">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
            <CreditCard className="size-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-slate-100">
            Active subscription required
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            You need an active subscription to access the lead dashboard.
            Choose a plan below to get started with verified distressed property leads.
          </p>
          <Link
            to="/#pricing"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-navy-950 shadow-[0_8px_28px_rgb(16_185_129/_0.35)] transition-all hover:bg-emerald-300 hover:shadow-[0_10px_36px_rgb(16_185_129/_0.45)]"
          >
            View plans &amp; subscribe
          </Link>
          <p className="mt-4 text-xs text-slate-500">
            Already subscribed?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.location.reload();
              }}
              className="text-emerald-400 hover:text-emerald-300"
            >
              Refresh
            </a>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
