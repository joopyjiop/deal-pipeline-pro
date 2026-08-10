"use node";

import { MongoClient } from "mongodb";
import { v } from "convex/values";
import { action } from "./_generated/server";

const OWNER_EMAIL = "jacobvierra8@gmail.com";

let clientPromise: Promise<MongoClient> | null = null;

function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

export const healthCheck = action({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    connected: v.boolean(),
    status: v.string(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email?.trim().toLowerCase();

    if (email !== OWNER_EMAIL) {
      throw new Error("Owner access required");
    }

    if (!process.env.MONGODB_URI) {
      return {
        configured: false,
        connected: false,
        status: "MONGODB_URI is not configured",
      };
    }

    try {
      const client = await getMongoClient();
      await client.db("admin").command({ ping: 1 });

      return {
        configured: true,
        connected: true,
        status: "Connected successfully",
      };
    } catch (error) {
      console.error("MongoDB Atlas health check failed", error);

      return {
        configured: true,
        connected: false,
        status: "Connection failed",
      };
    }
  },
});
