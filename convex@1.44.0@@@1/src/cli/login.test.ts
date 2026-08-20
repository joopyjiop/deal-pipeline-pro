import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { nodeFs } from "../bundler/fs.js";
import { login } from "./login.js";
import { bigBrainAPI } from "./lib/utils/utils.js";
import { readGlobalConfig } from "./lib/utils/globalConfig.js";

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
  close: vi.fn(),
}));

vi.mock("../bundler/fs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bundler/fs.js")>();
  return {
    ...actual,
    nodeFs: {
      ...actual.nodeFs,
      exists: vi.fn(),
      readUtf8File: vi.fn(),
    },
  };
});

vi.mock("./lib/utils/utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/utils/utils.js")>();
  return { ...actual, bigBrainAPI: vi.fn() };
});

vi.mock("./lib/utils/globalConfig.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./lib/utils/globalConfig.js")>();
  return { ...actual, readGlobalConfig: vi.fn() };
});

// `initializeBigBrainAuth` loads `.env.local` and `.env` into `process.env`.
// Tests set those variables directly, and `dotenv.parse` stays real for the
// file-attribution lookup.
vi.mock("dotenv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dotenv")>();
  return { ...actual, config: vi.fn() };
});

const ACCOUNT_TOKEN = "account-token";
const TEAMS = [{ id: 1, name: "Team One", slug: "team-one" }];
const DEPLOYMENT_KEY = "dev:tall-goat-123|deployment-secret";
const PROJECT_KEY = "project:my-team:my-project|project-secret";

/** Authorization headers Big Brain accepts. Anything else gets a 401. */
let authorized: Set<string>;
let mockFetch: ReturnType<typeof vi.fn>;

async function runStatus() {
  await login.parseAsync(["status"], { from: "user" });
}

function output(): string {
  return vi
    .mocked(process.stderr.write)
    .mock.calls.map((call) => String(call[0]))
    .join("");
}

/** The credentials `/api/authorize` was called with, in order. */
function authorizeHeaders(): string[] {
  return mockFetch.mock.calls.map(
    (call) => (call[1] as any).headers.Authorization,
  );
}

function setEnvFile(path: string, contents: string) {
  vi.mocked(nodeFs.exists).mockImplementation((p) => p === path);
  vi.mocked(nodeFs.readUtf8File).mockImplementation((p) => {
    if (p !== path) {
      throw new Error(`Unexpected read of ${p}`);
    }
    return contents;
  });
}

describe("npx convex login status", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    process.env = {};

    vi.resetAllMocks();
    authorized = new Set([`Bearer ${ACCOUNT_TOKEN}`]);
    mockFetch = vi.fn(async (url: string, options: any) => {
      if (!String(url).endsWith("/api/authorize")) {
        throw new Error(`Unexpected fetch of ${url}`);
      }
      return {
        status: authorized.has(options.headers.Authorization) ? 200 : 401,
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    vi.mocked(readGlobalConfig).mockReturnValue({ accessToken: ACCOUNT_TOKEN });
    vi.mocked(bigBrainAPI).mockResolvedValue(TEAMS);
    vi.mocked(nodeFs.exists).mockReturnValue(false);

    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
  });

  afterEach(() => {
    process.env = savedEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("account status", () => {
    test("reports the account and its teams", async () => {
      await runStatus();

      expect(output()).toContain("Convex account token found in:");
      expect(output()).toContain("config.json");
      expect(output()).toContain("Status: Logged in");
      expect(output()).toContain("Teams: 1 team accessible");
      expect(output()).toContain("- Team One (team-one)");
      expect(output()).not.toContain("Working Directory:");
    });

    test("reports no token when the global config is missing", async () => {
      vi.mocked(readGlobalConfig).mockReturnValue(null);

      await runStatus();

      expect(output()).toContain("No Convex account token found in:");
      expect(output()).toContain("Status: Not logged in");
      expect(bigBrainAPI).not.toHaveBeenCalled();
    });

    test("reports not logged in when Big Brain rejects the account token", async () => {
      authorized.clear();

      await runStatus();

      expect(output()).toContain("Convex account token found in:");
      expect(output()).toContain("Status: Not logged in");
      expect(bigBrainAPI).not.toHaveBeenCalled();
    });
  });

  describe("deploy key in the working directory", () => {
    test("reports a valid deployment key, checked without its prefix", async () => {
      process.env.CONVEX_DEPLOY_KEY = DEPLOYMENT_KEY;
      setEnvFile(".env.local", `CONVEX_DEPLOY_KEY=${DEPLOYMENT_KEY}\n`);
      // Big Brain only accepts a deployment key with the `dev:` prefix removed.
      authorized.add("Bearer deployment-secret");

      await runStatus();

      expect(output()).toContain(
        "Working Directory: Valid CONVEX_DEPLOY_KEY in .env.local",
      );
      expect(authorizeHeaders()).toContain("Bearer deployment-secret");
      expect(authorizeHeaders()).not.toContain(`Bearer ${DEPLOYMENT_KEY}`);
    });

    test("reports a deployment key Big Brain rejects", async () => {
      process.env.CONVEX_DEPLOY_KEY = DEPLOYMENT_KEY;
      setEnvFile(".env.local", `CONVEX_DEPLOY_KEY=${DEPLOYMENT_KEY}\n`);

      await runStatus();

      expect(output()).toContain(
        "Working Directory: Invalid CONVEX_DEPLOY_KEY in .env.local",
      );
    });

    test("attributes a key that isn't in an env file to the shell", async () => {
      process.env.CONVEX_DEPLOY_KEY = DEPLOYMENT_KEY;

      await runStatus();

      expect(output()).toContain(
        "Working Directory: Invalid CONVEX_DEPLOY_KEY in shell environment",
      );
    });

    test("attributes a key found in .env", async () => {
      process.env.CONVEX_DEPLOY_KEY = DEPLOYMENT_KEY;
      setEnvFile(".env", `CONVEX_DEPLOY_KEY=${DEPLOYMENT_KEY}\n`);

      await runStatus();

      expect(output()).toContain(
        "Working Directory: Invalid CONVEX_DEPLOY_KEY in .env",
      );
    });

    test("names CONVEX_DEPLOYMENT_TOKEN when that's the variable set", async () => {
      process.env.CONVEX_DEPLOYMENT_TOKEN = DEPLOYMENT_KEY;
      setEnvFile(".env.local", `CONVEX_DEPLOYMENT_TOKEN=${DEPLOYMENT_KEY}\n`);
      authorized.add("Bearer deployment-secret");

      await runStatus();

      expect(output()).toContain(
        "Working Directory: Valid CONVEX_DEPLOYMENT_TOKEN in .env.local",
      );
    });

    test("reports a project key", async () => {
      process.env.CONVEX_DEPLOY_KEY = PROJECT_KEY;
      setEnvFile(".env.local", `CONVEX_DEPLOY_KEY=${PROJECT_KEY}\n`);
      authorized.add("Bearer project-secret");

      await runStatus();

      expect(output()).toContain(
        "Working Directory: Valid CONVEX_DEPLOY_KEY in .env.local",
      );
      expect(authorizeHeaders()).toContain("Bearer project-secret");
    });

    test("stays quiet about a preview key, which never outranks the account", async () => {
      vi.mocked(readGlobalConfig).mockReturnValue(null);
      process.env.CONVEX_DEPLOY_KEY =
        "preview:my-team:my-project|preview-secret";

      await runStatus();

      expect(output()).toContain("Status: Not logged in");
      expect(output()).not.toContain("Working Directory:");
    });
  });

  describe("account and deploy key together", () => {
    test("reports both, listing teams for the account", async () => {
      process.env.CONVEX_DEPLOY_KEY = DEPLOYMENT_KEY;
      setEnvFile(".env.local", `CONVEX_DEPLOY_KEY=${DEPLOYMENT_KEY}\n`);

      await runStatus();

      expect(output()).toContain("Status: Logged in");
      expect(output()).toContain("Teams: 1 team accessible");
      expect(output()).toContain(
        "Working Directory: Invalid CONVEX_DEPLOY_KEY in .env.local",
      );
    });

    test("reports the key while logged out", async () => {
      vi.mocked(readGlobalConfig).mockReturnValue(null);
      process.env.CONVEX_DEPLOY_KEY = DEPLOYMENT_KEY;
      setEnvFile(".env.local", `CONVEX_DEPLOY_KEY=${DEPLOYMENT_KEY}\n`);

      await runStatus();

      expect(output()).toContain("No Convex account token found in:");
      expect(output()).toContain("Status: Not logged in");
      expect(output()).toContain(
        "Working Directory: Invalid CONVEX_DEPLOY_KEY in .env.local",
      );
    });
  });
});
