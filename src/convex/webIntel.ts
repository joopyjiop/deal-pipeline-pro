"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  chooseExtractionTargets,
  webIntelPlan,
  webIntelProviderSummary,
  type WebIntelMode,
  type WebIntelSourceType,
} from "./webIntelCore";

/**
 * DealProof "mega skill" — one web-intelligence call over the four fetch
 * surfaces the pipeline already owns:
 *
 *   1. Sitemap discovery   (src/convex/sitemap.ts  → mcpSitemapDiscover)
 *   2. Plain fetch with Firecrawl render fallback
 *                          (mongodb.ts fetchAndStageSource → mcpScrapeSource)
 *   3. ScrapeGraphAI structured extraction
 *                          (src/convex/scrapegraph.ts → mcpScrapegraphExtract)
 *   4. Camofox anti-detection browser
 *                          (src/convex/camofox.ts — owner-only escalation)
 *
 * The first three are reachable from the authenticated MCP agent path; the
 * orchestrator composes them so an external agent (Odysseus) can run the whole
 * chain — discover → fetch/stage → extract — in one `web_intel` call instead of
 * three. Camofox stays owner-only (same security split as every other browser
 * action): the agent path never drives a login-capable browser.
 *
 * Every write still flows through the existing staging + evidence gates and the
 * owner-review queue. Nothing here invents PII or approves a lead.
 */

export const mcpWebIntel = internalAction({
  args: {
    url: v.string(),
    sourceType: v.union(
      v.literal("SHERIFF_SALE"),
      v.literal("TAX_SALE"),
      v.literal("AUCTION_COM"),
      v.literal("PROBATE"),
      v.literal("OFF_MARKET"),
      v.literal("ASSESSOR"),
      v.literal("RECORDER"),
      v.literal("PROPSTREAM"),
      v.literal("BATCHLEADS"),
      v.literal("DEALMACHINE"),
      v.literal("FORECLOSURE"),
      v.literal("MARKETPLACE"),
      v.literal("ASSOCIATION"),
    ),
    mode: v.optional(v.union(v.literal("auto"), v.literal("discover"), v.literal("fetch"), v.literal("extract"))),
    prompt: v.optional(v.string()),
    schema: v.optional(v.any()),
    maxUrls: v.optional(v.number()),
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const prompt = (args.prompt ?? "").trim();
    if (args.mode === "extract" && !prompt) {
      throw new Error("web_intel extract mode requires a prompt");
    }
    const plan = webIntelPlan({ mode: args.mode, prompt, maxUrls: args.maxUrls, maxPages: args.maxPages });

    // Each inner action enforces requireMcpAiAccess + the scraper toggle, so
    // this orchestrator inherits the exact same gates with no duplication.
    const report: {
      provider: "web-intel";
      mode: WebIntelMode;
      seedUrl: string;
      sourceType: WebIntelSourceType;
      plan: ReturnType<typeof webIntelPlan>["steps"];
      providers: ReturnType<typeof webIntelProviderSummary>;
      discovery?: unknown;
      fetch?: unknown;
      extraction?: unknown;
      errors: Array<{ phase: string; error: string }>;
      warnings: string[];
    } = {
      provider: "web-intel",
      mode: plan.mode,
      seedUrl: args.url,
      sourceType: args.sourceType,
      plan: plan.steps,
      providers: webIntelProviderSummary(plan),
      errors: [],
      warnings: [],
    };

    if (plan.mode !== "extract") {
      report.warnings.push(
        "Camofox (the anti-detection browser) is owner-only and not reachable from the agent path. If a page blocks the fetch or Firecrawl fallback (bot wall, login, heavy JS), escalate to the owner to browse it in the Toolkit.",
      );
    }

    // 1. Discovery (sitemap) — also stages each discovered URL for review.
    let discoveredUrls: string[] = [];
    if (plan.mode === "discover" || plan.mode === "auto") {
      try {
        const discovery = await ctx.runAction(internal.mongodb.mcpSitemapDiscover, {
          url: args.url,
          sourceType: args.sourceType,
          maxUrls: plan.maxUrls,
        });
        report.discovery = discovery;
        const discovered = (discovery as { discovered?: Array<{ url?: string }> }).discovered ?? [];
        discoveredUrls = discovered.map((entry) => entry.url).filter((url): url is string => Boolean(url));
      } catch (error) {
        report.errors.push({ phase: "discover", error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 2. Fetch the seed URL (plain fetch → Firecrawl render fallback) and stage.
    if (plan.mode === "fetch" || plan.mode === "auto") {
      try {
        report.fetch = await ctx.runAction(internal.mongodb.mcpScrapeSource, {
          url: args.url,
          sourceType: args.sourceType,
        });
      } catch (error) {
        report.errors.push({ phase: "fetch", error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 3. Structured extraction with ScrapeGraphAI, over the seed and (in auto
    //    mode) the discovered listing URLs, bounded by maxPages.
    if (plan.extract) {
      const targets = chooseExtractionTargets(args.url, discoveredUrls, plan.maxPages);
      const extractions: unknown[] = [];
      for (const target of targets) {
        try {
          extractions.push(
            await ctx.runAction(internal.mongodb.mcpScrapegraphExtract, {
              url: target,
              sourceType: args.sourceType,
              prompt,
              schema: args.schema as Record<string, unknown> | undefined,
            }),
          );
        } catch (error) {
          extractions.push({ url: target, error: error instanceof Error ? error.message : String(error) });
        }
      }
      report.extraction = { targets, results: extractions };
    }

    return report;
  },
});
