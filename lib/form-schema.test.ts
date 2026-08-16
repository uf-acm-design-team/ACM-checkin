import { describe, it, expect } from "vitest";
import {
  parseSchema,
  parseAnswers,
  validateSchema,
  normalizeSchema,
  validateAnswers,
  retypeQuestion,
  newQuestionId,
  formatAnswer,
  canEditStructurally,
  MAX_QUESTIONS,
  MAX_SHORT_TEXT_LENGTH,
  type FormQuestion,
  type FormSchema,
} from "./form-schema";

// Terse builder so each test states only what it is actually about.
const q = (over: Partial<FormQuestion> = {}): FormQuestion => ({
  id: "q_1",
  type: "short_text",
  label: "Question",
  required: false,
  ...over,
});

describe("parseSchema", () => {
  it("returns empty for non-arrays", () => {
    expect(parseSchema(null)).toEqual([]);
    expect(parseSchema({})).toEqual([]);
    expect(parseSchema("[]")).toEqual([]);
    expect(parseSchema(undefined)).toEqual([]);
  });

  it("keeps a well-formed question", () => {
    expect(
      parseSchema([
        { id: "q_a", type: "dropdown", label: "Pick", required: true, options: ["A", "B"] },
      ]),
    ).toEqual([
      { id: "q_a", type: "dropdown", label: "Pick", required: true, options: ["A", "B"] },
    ]);
  });

  it("drops entries with no id -- they have no answer slot", () => {
    expect(parseSchema([{ type: "short_text", label: "No id" }])).toEqual([]);
    expect(parseSchema([{ id: "   ", label: "Blank id" }])).toEqual([]);
  });

  it("drops a duplicate id rather than letting two questions share an answer", () => {
    const parsed = parseSchema([
      { id: "q_a", type: "short_text", label: "First" },
      { id: "q_a", type: "short_text", label: "Second" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("First");
  });

  it("falls back to short_text for an unknown type", () => {
    expect(parseSchema([{ id: "q_a", type: "carrier_pigeon", label: "?" }])[0].type)
      .toBe("short_text");
  });

  it("drops non-string and blank options", () => {
    const parsed = parseSchema([
      { id: "q_a", type: "checkboxes", label: "Pick", options: ["A", 7, "", "  ", "B"] },
    ]);
    expect(parsed[0].options).toEqual(["A", "B"]);
  });

  it("keeps max strictly above min so a scale always has two points", () => {
    const parsed = parseSchema([
      { id: "q_a", type: "scale", label: "Rate", scale: { min: 5, max: 2 } },
    ]);
    expect(parsed[0].scale!.max).toBeGreaterThan(parsed[0].scale!.min);
  });

  it("treats required as strictly boolean true", () => {
    expect(parseSchema([{ id: "q_a", label: "x", required: "yes" }])[0].required).toBe(false);
    expect(parseSchema([{ id: "q_a", label: "x", required: 1 }])[0].required).toBe(false);
  });

  it("survives garbage entries mixed with good ones", () => {
    const parsed = parseSchema([
      null,
      "nope",
      ["also nope"],
      { id: "q_good", type: "short_text", label: "Kept" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("q_good");
  });
});

describe("parseAnswers", () => {
  it("returns empty for non-objects", () => {
    expect(parseAnswers(null)).toEqual({});
    expect(parseAnswers([1, 2])).toEqual({});
    expect(parseAnswers("x")).toEqual({});
  });

  it("keeps strings, numbers and string arrays", () => {
    expect(parseAnswers({ a: "x", b: 3, c: ["p", "q"] })).toEqual({
      a: "x", b: 3, c: ["p", "q"],
    });
  });

  it("drops values of unusable types", () => {
    expect(parseAnswers({ a: { nested: true }, b: null, c: true })).toEqual({});
  });

  it("filters non-strings out of an array answer", () => {
    expect(parseAnswers({ a: ["ok", 5, null] })).toEqual({ a: ["ok"] });
  });
});

describe("validateSchema", () => {
  it("accepts a valid schema", () => {
    expect(validateSchema([q({ label: "Fine" })])).toEqual([]);
  });

  it("requires question text", () => {
    const errors = validateSchema([q({ label: "   " })]);
    expect(errors).toHaveLength(1);
    expect(errors[0].questionId).toBe("q_1");
  });

  it("requires choice questions to have at least one option", () => {
    const errors = validateSchema([q({ type: "dropdown", options: [] })]);
    expect(errors.some((e) => /at least one option/i.test(e.message))).toBe(true);
  });

  it("rejects duplicate options, case-insensitively", () => {
    const errors = validateSchema([
      q({ type: "multiple_choice", options: ["Yes", "yes"] }),
    ]);
    expect(errors.some((e) => /unique/i.test(e.message))).toBe(true);
  });

  it("rejects a duplicate question id", () => {
    const errors = validateSchema([q({ id: "dup" }), q({ id: "dup" })]);
    expect(errors.some((e) => /duplicate question id/i.test(e.message))).toBe(true);
  });

  it("rejects a scale whose max is not above its min", () => {
    const errors = validateSchema([
      q({ type: "scale", scale: { min: 3, max: 3 } }),
    ]);
    expect(errors.some((e) => /greater than the minimum/i.test(e.message))).toBe(true);
  });

  it("reports a whole-form error past the question limit", () => {
    const many = Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) =>
      q({ id: `q_${i}` }),
    );
    expect(validateSchema(many).some((e) => e.questionId === null)).toBe(true);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const errors = validateSchema([
      q({ id: "q_a", label: "" }),
      q({ id: "q_b", type: "dropdown", options: [] }),
    ]);
    expect(errors).toHaveLength(2);
  });
});

describe("normalizeSchema", () => {
  it("trims labels and drops blank options", () => {
    const [out] = normalizeSchema([
      q({ type: "checkboxes", label: "  Padded  ", options: ["A", "  ", " B "] }),
    ]);
    expect(out.label).toBe("Padded");
    expect(out.options).toEqual(["A", "B"]);
  });

  it("strips keys that don't apply to the type", () => {
    // A question that was briefly a dropdown must not carry a stale options
    // array once it is a short_text again.
    const [out] = normalizeSchema([
      q({ type: "short_text", options: ["stale"], scale: { min: 1, max: 5 } }),
    ]);
    expect(out.options).toBeUndefined();
    expect(out.scale).toBeUndefined();
  });

  it("omits blank scale labels instead of storing empty strings", () => {
    const [out] = normalizeSchema([
      q({ type: "scale", scale: { min: 1, max: 5, min_label: "  ", max_label: "High" } }),
    ]);
    expect(out.scale).toEqual({ min: 1, max: 5, max_label: "High" });
  });
});

describe("validateAnswers", () => {
  it("accepts an empty submission when nothing is required", () => {
    const result = validateAnswers([q()], {});
    expect(result.ok).toBe(true);
    expect(result.answers).toEqual({});
  });

  it("flags a missing required answer", () => {
    const result = validateAnswers([q({ required: true })], {});
    expect(result.ok).toBe(false);
    expect(result.errors.q_1).toBeTruthy();
  });

  it("treats whitespace as unanswered", () => {
    const result = validateAnswers([q({ required: true })], { q_1: "   " });
    expect(result.ok).toBe(false);
  });

  it("trims accepted text", () => {
    const result = validateAnswers([q()], { q_1: "  hello  " });
    expect(result.answers.q_1).toBe("hello");
  });

  it("rejects text past the type's length cap", () => {
    const result = validateAnswers([q()], {
      q_1: "x".repeat(MAX_SHORT_TEXT_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a choice answer that isn't one of the options", () => {
    const result = validateAnswers(
      [q({ type: "multiple_choice", options: ["A", "B"] })],
      { q_1: "C" },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a checkbox selection outside the options", () => {
    const result = validateAnswers(
      [q({ type: "checkboxes", options: ["A", "B"] })],
      { q_1: ["A", "Z"] },
    );
    expect(result.ok).toBe(false);
  });

  it("stores checkbox answers in schema order, not click order", () => {
    const result = validateAnswers(
      [q({ type: "checkboxes", options: ["A", "B", "C"] })],
      { q_1: ["C", "A"] },
    );
    expect(result.answers.q_1).toEqual(["A", "C"]);
  });

  it("accepts a scale value sent as a string, since inputs are strings", () => {
    const result = validateAnswers(
      [q({ type: "scale", scale: { min: 1, max: 5 } })],
      { q_1: "4" },
    );
    expect(result.ok).toBe(true);
    expect(result.answers.q_1).toBe(4);
  });

  it("rejects an out-of-range or fractional scale value", () => {
    const scale = [q({ type: "scale", scale: { min: 1, max: 5 } })];
    expect(validateAnswers(scale, { q_1: 9 }).ok).toBe(false);
    expect(validateAnswers(scale, { q_1: 2.5 }).ok).toBe(false);
  });

  it("drops answers for ids that aren't in the schema", () => {
    // Otherwise a caller could write arbitrary jsonb into attendance.answers.
    const result = validateAnswers([q()], { q_1: "kept", q_injected: "dropped" });
    expect(result.ok).toBe(true);
    expect(result.answers).toEqual({ q_1: "kept" });
  });

  it("does not fail a check-in because a deleted question is still submitted", () => {
    expect(validateAnswers([], { q_gone: "orphan" }).ok).toBe(true);
  });

  it("ignores a non-array value for a checkboxes question", () => {
    const result = validateAnswers(
      [q({ type: "checkboxes", options: ["A"], required: true })],
      { q_1: "A" },
    );
    expect(result.ok).toBe(false);
  });
});

describe("retypeQuestion", () => {
  it("keeps the id so existing answers stay associated", () => {
    expect(retypeQuestion(q({ id: "q_keep" }), "dropdown").id).toBe("q_keep");
  });

  it("seeds options when moving to a choice type", () => {
    expect(retypeQuestion(q(), "dropdown").options).toHaveLength(1);
  });

  it("carries options between choice types", () => {
    const from = q({ type: "multiple_choice", options: ["A", "B"] });
    expect(retypeQuestion(from, "checkboxes").options).toEqual(["A", "B"]);
  });

  it("drops options when leaving a choice type", () => {
    const from = q({ type: "dropdown", options: ["A"] });
    expect(retypeQuestion(from, "long_text").options).toBeUndefined();
  });

  it("adds and removes the scale config with the type", () => {
    expect(retypeQuestion(q(), "scale").scale).toBeDefined();
    expect(retypeQuestion(q({ type: "scale" }), "short_text").scale).toBeUndefined();
  });
});

describe("newQuestionId", () => {
  it("is prefixed and unique across calls", () => {
    const ids = new Set(Array.from({ length: 200 }, newQuestionId));
    expect(ids.size).toBe(200);
    expect([...ids].every((id) => id.startsWith("q_"))).toBe(true);
  });
});

describe("formatAnswer", () => {
  it("renders each answer shape as one string", () => {
    expect(formatAnswer("text")).toBe("text");
    expect(formatAnswer(4)).toBe("4");
    expect(formatAnswer(["A", "B"])).toBe("A; B");
    expect(formatAnswer(undefined)).toBe("");
  });
});

describe("canEditStructurally", () => {
  it("locks structural edits once responses exist", () => {
    expect(canEditStructurally(0)).toBe(true);
    expect(canEditStructurally(1)).toBe(false);
  });
});

describe("id-keyed answers survive edits that positional keys would not", () => {
  // The whole reason form_schema replaced questions text[].
  const before: FormSchema = [
    q({ id: "q_a", label: "Name" }),
    q({ id: "q_b", label: "Year" }),
  ];
  const answers = { q_a: "Alice", q_b: "2027" };

  it("survives reordering", () => {
    const reordered: FormSchema = [before[1], before[0]];
    const result = validateAnswers(reordered, answers);
    expect(result.answers).toEqual({ q_a: "Alice", q_b: "2027" });
  });

  it("survives rewording", () => {
    const reworded: FormSchema = [
      q({ id: "q_a", label: "Full name" }),
      q({ id: "q_b", label: "Grad year" }),
    ];
    expect(validateAnswers(reworded, answers).answers).toEqual(answers);
  });
});
