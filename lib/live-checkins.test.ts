import { describe, expect, it } from "vitest";
import {
  compareNewestFirst,
  isMeetingOpen,
  mergeNewest,
  msUntilClose,
  olderThanFilter,
  sourceLabel,
} from "./live-checkins";

const row = (id: string, checked_in_at: string) => ({ id, checked_in_at });

describe("compareNewestFirst", () => {
  it("orders by time descending, then id descending", () => {
    const rows = [
      row("a", "2026-10-14T10:00:00Z"),
      row("c", "2026-10-14T11:00:00Z"),
      row("b", "2026-10-14T10:00:00Z"),
    ];
    expect(rows.sort(compareNewestFirst).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("mergeNewest", () => {
  it("adds new rows in newest-first order", () => {
    const existing = [row("b", "2026-10-14T10:00:00Z")];
    const merged = mergeNewest(existing, [row("c", "2026-10-14T11:00:00Z")]);
    expect(merged.map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("drops duplicates by id, including within the incoming batch", () => {
    const existing = [row("b", "2026-10-14T10:00:00Z")];
    const merged = mergeNewest(existing, [
      row("b", "2026-10-14T10:00:00Z"),
      row("c", "2026-10-14T11:00:00Z"),
      row("c", "2026-10-14T11:00:00Z"),
    ]);
    expect(merged.map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("returns the same array when nothing is new", () => {
    const existing = [row("b", "2026-10-14T10:00:00Z")];
    expect(mergeNewest(existing, [row("b", "2026-10-14T10:00:00Z")])).toBe(existing);
  });
});

describe("olderThanFilter", () => {
  it("builds a keyset filter on time then id", () => {
    expect(olderThanFilter(row("x", "2026-10-14T10:00:00Z"))).toBe(
      "checked_in_at.lt.2026-10-14T10:00:00Z,and(checked_in_at.eq.2026-10-14T10:00:00Z,id.lt.x)",
    );
  });
});

describe("sourceLabel", () => {
  it("maps known sources and ignores the rest", () => {
    expect(sourceLabel("guest")).toBe("guest");
    expect(sourceLabel("authenticated")).toBe("member");
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel("import")).toBeNull();
  });
});

describe("isMeetingOpen", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");

  it("is closed when status is false", () => {
    expect(isMeetingOpen({ status: false, end_time: null }, now)).toBe(false);
  });

  it("is open with no end time", () => {
    expect(isMeetingOpen({ status: true, end_time: null }, now)).toBe(true);
  });

  it("closes once the end time passes", () => {
    expect(isMeetingOpen({ status: true, end_time: "2026-10-14T13:00:00Z" }, now)).toBe(true);
    expect(isMeetingOpen({ status: true, end_time: "2026-10-14T11:00:00Z" }, now)).toBe(false);
  });
});

describe("msUntilClose", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");

  it("returns null without an end time and never goes negative", () => {
    expect(msUntilClose(null, now)).toBeNull();
    expect(msUntilClose("2026-10-14T12:00:05Z", now)).toBe(5000);
    expect(msUntilClose("2026-10-14T11:00:00Z", now)).toBe(0);
  });
});
