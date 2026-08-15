import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// The cycle is paused until the owner enables automation from /toolkit.
crons.hourly(
  "run Mongo automation cycle",
  { minuteUTC: 17 },
  internal.mongodb.runAutomationCycle,
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

export default crons;
