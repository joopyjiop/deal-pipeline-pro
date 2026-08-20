import { afterEach, describe, expect, test, vi } from "vitest";
import { version } from "../../index.js";
import * as syscall from "./syscall.js";
import { getServiceToken } from "./actions_impl.js";

vi.mock("./syscall.js", () => ({
  performAsyncSyscall: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("getServiceToken", () => {
  test("requires a service", async () => {
    await expect(
      getServiceToken(undefined as unknown as "ai-gateway"),
    ).rejects.toThrow("Must provide arg 1 `service` to `getServiceToken`");
    expect(syscall.performAsyncSyscall).not.toHaveBeenCalled();
  });

  test("requests an LLM token for the current action", async () => {
    vi.mocked(syscall.performAsyncSyscall).mockResolvedValue("jwt");

    const token = await getServiceToken("ai-gateway");

    expect(token).toBe("jwt");
    expect(syscall.performAsyncSyscall).toHaveBeenCalledWith(
      "1.0/createServiceToken",
      {
        service: "ai-gateway",
        version,
      },
    );
  });

  test("rejects the former service spelling", async () => {
    await expect(getServiceToken("ai" as "ai-gateway")).rejects.toThrow(
      'Unsupported service "ai"',
    );
    expect(syscall.performAsyncSyscall).not.toHaveBeenCalled();
  });

  test("rejects unsupported services before issuing a syscall", async () => {
    await expect(getServiceToken("other" as "ai-gateway")).rejects.toThrow(
      'Unsupported service "other"',
    );
    expect(syscall.performAsyncSyscall).not.toHaveBeenCalled();
  });

  test("preserves syscall errors", async () => {
    const error = new Error(
      "Unknown async operation 1.0/createServiceToken with args {}",
    );
    vi.mocked(syscall.performAsyncSyscall).mockRejectedValue(error);

    await expect(getServiceToken("ai-gateway")).rejects.toBe(error);
  });
});
