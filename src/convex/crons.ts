import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// The cycle is paused until the owner enables automation from /toolkit.
// internal.aiUsage.runAutomationCycleWithCharge wraps the cycle and charges
// the AI token guard (aiUsageCore.ts) for the consultant-court runs it
// performs — the court chain in mongodb.ts predates the guard, so court runs
// are charged at their entry points with a fixed per-run estimate.
crons.hourly(
  "run Mongo automation cycle",
  { minuteUTC: 17 },
  internal.aiUsage.runAutomationCycleWithCharge,
);

// Website-side auto-responder: every 3 minutes, answer open Odysseus
// requests/escalations/questions in the shared conversation threads. Each
// Odysseus post also schedules an immediate reply (~30s later) from the HTTP
// layer, so this cron is the backstop rather than the primary trigger. Skips
// cleanly when the owner's "AI access" switch is off; when AI access is on it
// answers with the AI gateway if configured, otherwise with a deterministic
// grounded reply from live app data (see src/convex/threadResponder.ts).
crons.interval(
  "answer open shared threads",
  { minutes: 5 },
  internal.threadResponder.respondToOpenThreads,
  {},
);

// Retry failed purchase-confirmation emails (Stripe checkout → CSV delivery).
// Each delivery allows MAX_DELIVERY_ATTEMPTS with escalating backoff; a
// permanently failed send stays visible in the email_deliveries log for
// owner review via GET /api/admin/email-deliveries.
crons.interval(
  "retry failed purchase emails",
  { minutes: 15 },
  internal.emailDelivery.retryFailedDeliveries,
  {},
);

// Daily sweep: delete import-staging rows that are empty garbage (no source
// URL anywhere and no readable content). The fetch/crawl paths nest their
// evidence in rawJson, so rows that are truly contentless can never be
// reviewed or promoted — see src/convex/stagingCleanup.ts.
crons.daily(
  "sweep empty staged sources",
  { hourUTC: 6, minuteUTC: 0 },
  internal.stagingCleanup.sweepEmptyStagedSources,
  {},
);

export default crons;
