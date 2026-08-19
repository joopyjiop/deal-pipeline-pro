import { Link, useLocation } from "react-router";
import { BarChart3, Bot, Home, MessageSquare, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hub navigation for the owner workspace. Every owner page renders this below
 * its header so the admin/tools section is one navigable area instead of a
 * back-link chain (dashboard → operations → toolkit → …).
 */
const OWNER_NAV_ITEMS = [
  { to: "/dashboard", label: "Deals", icon: Home },
  { to: "/operations", label: "Buyers & matches", icon: BarChart3 },
  { to: "/toolkit", label: "Toolkit", icon: Wrench },
  { to: "/local-agents", label: "Local agents", icon: Bot },
  { to: "/shared-conversation", label: "Odysseus", icon: MessageSquare },
] as const;

export function OwnerNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="glass-panel mt-3 flex items-center gap-1 overflow-x-auto rounded-2xl px-2 py-2"
      aria-label="Owner workspace navigation"
    >
      {OWNER_NAV_ITEMS.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors",
              active
                ? "bg-sky-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-white/70 hover:text-sky-800",
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
