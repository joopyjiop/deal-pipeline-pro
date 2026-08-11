/**
 * The Convex deployment the browser talks to.
 *
 * The Freebuff platform injects `VITE_CONVEX_URL` at build time, and it has
 * been pointing at the managed/retired deployment (`savory-terrier-340`),
 * whose env vars cannot be edited. The app now runs against the owner's own
 * deployment (`keen-aardvark-333`), so that injected value is intentionally
 * not used here.
 *
 * `VITE_CONVEX_URL_OVERRIDE` is a self-hosting escape hatch: when the
 * frontend is built outside Freebuff (e.g. Vercel/Netlify/GitHub Pages) and
 * needs a different deployment, set it in that build. Otherwise the owner's
 * deployment is used.
 */
export const CONVEX_URL: string =
  (import.meta.env.VITE_CONVEX_URL_OVERRIDE as string | undefined) ??
  "https://keen-aardvark-333.convex.cloud";

/** HTTP site URL for the same deployment (Convex actions / HTTP routes). */
export const CONVEX_SITE_URL: string = CONVEX_URL.replace(/\.convex\.cloud$/, ".convex.site");
