/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agents from "../agents.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as camofox from "../camofox.js";
import type * as credentials from "../credentials.js";
import type * as crons from "../crons.js";
import type * as embeddings from "../embeddings.js";
import type * as http from "../http.js";
import type * as leads from "../leads.js";
import type * as mongodb from "../mongodb.js";
import type * as ollama from "../ollama.js";
import type * as owner from "../owner.js";
import type * as refextract from "../refextract.js";
import type * as rentcast from "../rentcast.js";
import type * as scrapegraph from "../scrapegraph.js";
import type * as search from "../search.js";
import type * as settings from "../settings.js";
import type * as sharedConversation from "../sharedConversation.js";
import type * as sitemap from "../sitemap.js";
import type * as skiptrace from "../skiptrace.js";
import type * as stagingEvidence from "../stagingEvidence.js";
import type * as threadResponder from "../threadResponder.js";
import type * as underwriting from "../underwriting.js";
import type * as users from "../users.js";
import type * as webIntel from "../webIntel.js";
import type * as webIntelCore from "../webIntelCore.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agents: typeof agents;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  camofox: typeof camofox;
  credentials: typeof credentials;
  crons: typeof crons;
  embeddings: typeof embeddings;
  http: typeof http;
  leads: typeof leads;
  mongodb: typeof mongodb;
  ollama: typeof ollama;
  owner: typeof owner;
  refextract: typeof refextract;
  rentcast: typeof rentcast;
  scrapegraph: typeof scrapegraph;
  search: typeof search;
  settings: typeof settings;
  sharedConversation: typeof sharedConversation;
  sitemap: typeof sitemap;
  skiptrace: typeof skiptrace;
  stagingEvidence: typeof stagingEvidence;
  threadResponder: typeof threadResponder;
  underwriting: typeof underwriting;
  users: typeof users;
  webIntel: typeof webIntel;
  webIntelCore: typeof webIntelCore;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
