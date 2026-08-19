import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/**
 * Owner-only route guard. Wraps every surface that is part of the owner's
 * workspace (operations, toolkit, local agents, shared conversations) so that
 * anyone who is not the permanent owner is redirected to the read-only
 * dashboard marketplace — they never see owner controls, buttons, or data.
 */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  const isOwner = Boolean(
    user && (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com"),
  );
  if (!isOwner) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
