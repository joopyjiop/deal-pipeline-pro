import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// The cycle is paused until the owner enables automation from /toolkit.
crons.hourly(
  "run Mongo automation cycle",
  { minuteUTC: 17 },
  internal.mongodb.runAutomationCycle,
);

export default crons;
