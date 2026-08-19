import { Link } from "react-router";

/** Brand gradient used by the forge mark (emerald → teal). */
function ForgeGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#0d9488" />
      </linearGradient>
    </defs>
  );
}

/**
 * The forge mark: a struck anvil with a spark rising from the face — the
 * "Deal Forge" idea of turning raw public records into a finished deal.
 */
export function ForgeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <ForgeGradient id="df-forge" />
      {/* Spark rising off the anvil face */}
      <path
        d="M15.6 2.4l.85 1.85 1.85.85-1.85.85-.85 1.85-.85-1.85-1.85-.85 1.85-.85z"
        fill="url(#df-forge)"
      />
      {/* Anvil face */}
      <path
        d="M3.5 5.5h13a1.6 1.6 0 0 1 0 3.2h-13a1.6 1.6 0 0 1 0-3.2z"
        fill="url(#df-forge)"
      />
      {/* Anvil body */}
      <path
        d="M6.6 8.7h8.3l-1.5 6.3a1.2 1.2 0 0 1-1.2.9H9.3a1.2 1.2 0 0 1-1.2-.9z"
        fill="url(#df-forge)"
      />
      {/* Anvil base */}
      <path
        d="M5 15.9h12v2.4H5z"
        fill="url(#df-forge)"
        opacity="0.9"
      />
    </svg>
  );
}

type Tone = "auto" | "light";

export function Logo({
  className = "",
  size = "md",
  tone = "auto",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: Tone;
}) {
  const sizes = {
    sm: { box: "size-7", icon: "size-4", text: "text-sm" },
    md: { box: "size-9", icon: "size-5", text: "text-base" },
    lg: { box: "size-11", icon: "size-6", text: "text-lg" },
  };
  const s = sizes[size];
  const wordmark = tone === "light" ? "text-slate-100" : "text-slate-900 dark:text-slate-100";
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`} aria-label="Deal Forge home">
      <span
        className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-navy-800 to-navy-950 shadow-[0_4px_16px_rgb(16_185_129_/_0.28)] ring-1 ring-emerald-400/40 ${s.box}`}
      >
        <ForgeMark className={s.icon} />
      </span>
      <span className={`font-bold tracking-tight ${wordmark} ${s.text}`}>
        Deal<span className="text-emerald-400">Forge</span>
      </span>
    </Link>
  );
}

export function LogoMark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "size-5", md: "size-7", lg: "size-9" };
  return <ForgeMark className={`${sizes[size]} ${className}`} />;
}
