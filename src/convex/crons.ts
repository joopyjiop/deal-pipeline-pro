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
// requests/escalations/questions in the shared conversation threads. Skips
// cleanly when the owner's "AI access" switch is off or AI_BASE_URL is not
// configured (see src/convex/threadResponder.ts).
crons.interval(
  "answer open shared threads",
  { minutes: 3 },
  internal.threadResponder.respondToOpenThreads,
  {},
);

export default crons;
