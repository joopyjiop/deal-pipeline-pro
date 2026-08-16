import { NavLink, useLocation } from "react-router";
import {
  LayoutDashboard,
  Users,
  Gavel,
  Wrench,
  MapPin,
  MessageSquare,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LogoMark } from "./Logo";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/buyers", label: "Buyers", icon: Users },
  { to: "/operations", label: "Operations", icon: Gavel },
  { to: "/toolkit", label: "Toolkit", icon: Wrench },
  { to: "/local-agents", label: "Local Agents", icon: MapPin },
  { to: "/shared-conversation", label: "Conversations", icon: MessageSquare },
] as const;

export function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isOwner = user && (user.role === "admin" || user.email?.trim().toLowerCase() === "jacobvierra8@gmail.com");

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-indigo-900/10 bg-sidebar transition-all duration-200 flex flex-col" role="navigation" aria-label="Main navigation">
      <div className="flex h-16 items-center justify-between px-4 border-b border-indigo-900/10">
        <LogoMark size="lg" />
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Primary">
        <ul className="space-y-0.5" role="list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                        : "text-slate-600 hover:bg-indigo-50/50 hover:text-indigo-700 dark:text-slate-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
                    )
                  }
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3 border-t border-indigo-900/10">
        {isOwner && (
          <NavLink
            to="/settings"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-indigo-50/50 hover:text-indigo-700 dark:text-slate-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300 transition-colors"
          >
            <Settings className="size-4 shrink-0" aria-hidden="true" />
            Settings
          </NavLink>
        )}
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-900/20 dark:hover:text-rose-400 transition-colors"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
