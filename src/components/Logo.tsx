import { Link } from "react-router";

export function Logo({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: { box: "size-7", icon: "size-4", text: "text-sm" },
    md: { box: "size-9", icon: "size-5", text: "text-base" },
    lg: { box: "size-11", icon: "size-6", text: "text-lg" },
  };
  const s = sizes[size];
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`} aria-label="Deal Forge home">
      <span className={`flex items-center justify-center rounded-xl border border-indigo-900/10 bg-white shadow-sm ${s.box}`}>
        <svg viewBox="0 0 24 24" fill="none" className={`${s.icon} text-indigo-600`} aria-hidden="true">
          {/* Anvil shape + checkmark forming a "D" */}
          <path d="M6 4h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 8v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 12l3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={`font-bold tracking-tight text-slate-900 dark:text-slate-100 ${s.text}`}>Deal Forge</span>
    </Link>
  );
}

export function LogoMark({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-5", md: "size-7", lg: "size-9" };
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${sizes[size]} text-indigo-600 ${className}`} aria-hidden="true">
      <path d="M6 4h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 8v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
