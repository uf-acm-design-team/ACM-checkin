import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./timeout";

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the value when the promise settles in time", async () => {
    const p = withTimeout(Promise.resolve("ok"), 1000);
    await expect(p).resolves.toBe("ok");
  });

  it("passes through a rejection that happens in time", async () => {
    const p = withTimeout(Promise.reject(new Error("boom")), 1000);
    await expect(p).rejects.toThrow("boom");
  });

  it("rejects with a readable message once the time runs out", async () => {
    const never = new Promise<string>(() => {});
    const p = withTimeout(never, 15_000);
    const assertion = expect(p).rejects.toThrow("no response after 15s");
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("ignores a result that arrives after the timeout", async () => {
    let resolveLate!: (v: string) => void;
    const late = new Promise<string>((r) => (resolveLate = r));
    const p = withTimeout(late, 1000);
    const assertion = expect(p).rejects.toThrow("no response after 1s");
    await vi.advanceTimersByTimeAsync(1000);
    resolveLate("too late");
    await assertion;
  });

  it("clears its timer when the promise wins", async () => {
    await withTimeout(Promise.resolve(1), 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
