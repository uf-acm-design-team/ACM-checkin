import { describe, it, expect } from "vitest";
import {
  getTerm, termBounds, compareTermsDesc, academicYearTerms,
  buildTermSummaries, pageRange, hasMore, percentage,
} from "./stats-terms";

describe("getTerm (EST month boundaries)", () => {
  it("classifies Jan–May as Spring", () => {
    expect(getTerm("2026-01-01T00:00:00").season).toBe("Spring");
    expect(getTerm("2026-05-31T23:59:59").season).toBe("Spring");
  });
  it("classifies Jun–Jul as Summer", () => {
    expect(getTerm("2026-06-01T00:00:00").season).toBe("Summer");
    expect(getTerm("2026-07-31T23:59:59").season).toBe("Summer");
  });
  it("classifies Aug–Dec as Fall", () => {
    expect(getTerm("2026-08-01T00:00:00").season).toBe("Fall");
    expect(getTerm("2026-12-31T23:59:59").season).toBe("Fall");
  });
  it("builds key and label", () => {
    expect(getTerm("2026-09-04T18:00:00")).toMatchObject({
      key: "2026-Fall", label: "Fall 2026", season: "Fall", year: 2026,
    });
  });
});

describe("termBounds", () => {
  // Now returns real instants rather than bare wall-clock strings: start_time
  // is timestamptz, so the RPC compares these as instants. Eastern is UTC-4 in
  // summer (EDT) and UTC-5 in winter (EST), which is why the two windows below
  // have different offsets baked in.
  it("Fall window", () => {
    expect(termBounds("2026-Fall")).toEqual({
      startIso: "2026-08-01T04:00:00.000Z", // midnight EDT
      endIso: "2027-01-01T04:59:00.000Z",   // 23:59 EST on Dec 31
    });
  });
  it("Spring window", () => {
    expect(termBounds("2025-Spring")).toEqual({
      startIso: "2025-01-01T05:00:00.000Z", // midnight EST
      endIso: "2025-06-01T03:59:00.000Z",   // 23:59 EDT on May 31
    });
  });
});

describe("compareTermsDesc", () => {
  it("orders newest first, Fall > Summer > Spring within a year", () => {
    const terms = [
      { season: "Spring", year: 2026 }, { season: "Fall", year: 2025 },
      { season: "Fall", year: 2026 }, { season: "Summer", year: 2026 },
    ] as const;
    const sorted = [...terms].sort(compareTermsDesc).map(t => `${t.year}-${t.season}`);
    expect(sorted).toEqual(["2026-Fall", "2026-Summer", "2026-Spring", "2025-Fall"]);
  });
});

describe("academicYearTerms", () => {
  it("Aug–Dec: AY starts this year", () => {
    expect(academicYearTerms(2026, 9)).toEqual(["2026-Fall", "2027-Spring", "2027-Summer"]);
  });
  it("Jan–Jul: AY started last year", () => {
    expect(academicYearTerms(2026, 3)).toEqual(["2025-Fall", "2026-Spring", "2026-Summer"]);
  });
});

describe("buildTermSummaries", () => {
  it("counts occurred meetings per term and attended intersection", () => {
    const meetings = [
      { id: "a", start_time: "2026-09-04T18:00:00" },
      { id: "b", start_time: "2026-10-09T18:00:00" },
      { id: "c", start_time: "2026-02-06T18:00:00" },
    ];
    const attended = new Set(["a", "c"]);
    const res = buildTermSummaries(meetings, attended);
    expect(res.totalAllTime).toBe(3);
    expect(res.attendedAllTime).toBe(2);
    const fall = res.terms.find(t => t.key === "2026-Fall")!;
    expect(fall).toMatchObject({ total: 2, attended: 1 });
    const spring = res.terms.find(t => t.key === "2026-Spring")!;
    expect(spring).toMatchObject({ total: 1, attended: 1 });
    expect(res.terms[0].key).toBe("2026-Fall");
  });
});

describe("pagination + percentage", () => {
  it("pageRange", () => {
    expect(pageRange(1, 10)).toEqual({ from: 0, to: 9 });
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });
  it("hasMore", () => {
    expect(hasMore(1, 10, 25)).toBe(true);
    expect(hasMore(3, 10, 25)).toBe(false);
    expect(hasMore(1, 10, 10)).toBe(false);
  });
  it("percentage rounds and guards zero", () => {
    expect(percentage(3, 4)).toBe(75);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(1, 3)).toBe(33);
  });
});

describe("getTerm with timestamptz values", () => {
  // start_time is now timestamptz, so the raw string's leading characters are
  // UTC. Classification must use the ORG's wall clock, not those characters.

  it("classifies a late-evening Dec 31 meeting as Fall of that year", () => {
    // 11 PM Eastern on Dec 31 == 04:00 UTC on Jan 1. Slicing the string would
    // read "2027-01" and file this under Spring 2027.
    const term = getTerm("2027-01-01T04:00:00+00:00");
    expect(term.key).toBe("2026-Fall");
    expect(term.year).toBe(2026);
  });

  it("classifies a late-evening May 31 meeting as Spring, not Summer", () => {
    // 10 PM Eastern May 31 == 02:00 UTC Jun 1.
    expect(getTerm("2026-06-01T02:00:00+00:00").key).toBe("2026-Spring");
  });

  it("classifies an ordinary afternoon meeting unchanged", () => {
    expect(getTerm("2026-09-03T19:00:00+00:00").key).toBe("2026-Fall");
  });

  it("still handles a naive string, for any legacy caller", () => {
    expect(getTerm("2026-09-03T15:00:00").key).toBe("2026-Fall");
  });
});

describe("termBounds emits real instants", () => {
  it("returns offset-bearing ISO strings, not bare wall clock", () => {
    const { startIso, endIso } = termBounds("2026-Fall");
    // Compared against timestamptz in get_member_meetings_page.
    expect(startIso).toMatch(/Z$|[+-]\d{2}:\d{2}$/);
    expect(endIso).toMatch(/Z$|[+-]\d{2}:\d{2}$/);
  });

  it("starts Fall at midnight Eastern on Aug 1", () => {
    // Midnight EDT on Aug 1 == 04:00 UTC.
    expect(termBounds("2026-Fall").startIso).toBe("2026-08-01T04:00:00.000Z");
  });

  it("keeps a boundary meeting inside its own term", () => {
    const fall = termBounds("2026-Fall");
    const lateDec = new Date("2027-01-01T04:00:00+00:00").getTime(); // 11pm Dec 31 ET
    expect(lateDec).toBeLessThanOrEqual(new Date(fall.endIso).getTime());
  });
});
