-- Meeting check-in forms: replace `meetings.questions text[]` with a structured
-- `form_schema jsonb`.
--
-- WHY text[] had to go
-- -------------------
-- `questions` held nothing but a prompt string per question, which made three
-- things impossible:
--
--   1. Question TYPE. Every question was implicitly a free-text box. Multiple
--      choice, checkboxes, dropdown and scale all need a type discriminator and
--      (for the choice types) a list of options.
--
--   2. STABLE IDENTITY. Answers were stored in attendance.answers as either a
--      positional array or an object keyed by the question TEXT -- see
--      normalizeAnswers() in lib/stats-data.ts, whose own comment admitted the
--      shape "has no standardized shape yet". Both keys are unstable: reordering
--      questions silently re-points every historical answer, and rewording one
--      orphans its answers. An officer editing last week's form corrupts last
--      week's responses with no error and no way to tell it happened.
--
--   3. REQUIRED / VALIDATION metadata, which the check-in form needs to enforce.
--
-- THE SHAPE
-- ---------
-- form_schema is a jsonb ARRAY of question objects, in display order:
--
--   [{
--     "id":       "q_a1b2c3d4",          -- stable, never reused, never rewritten
--     "type":     "short_text" | "long_text" | "multiple_choice"
--                 | "checkboxes" | "dropdown" | "scale",
--     "label":    "How did you hear about this?",
--     "required": false,
--     "options":  ["Instagram", "Friend", "Class"],   -- choice types only
--     "scale":    { "min": 1, "max": 5,
--                   "min_label": "Poor", "max_label": "Great" }  -- scale only
--   }, ...]
--
-- and attendance.answers becomes an OBJECT KEYED BY QUESTION ID:
--
--   { "q_a1b2c3d4": "Instagram", "q_x9y8z7w6": ["A", "C"], "q_p0o9i8u7": 4 }
--
-- Keying by id is the whole point: it survives reordering and rewording, which
-- is exactly what the old positional/text keys could not do.
--
-- The constraint below enforces only that form_schema is an array -- the per-
-- question shape is validated in TypeScript (lib/form-schema.ts), which both the
-- builder and the check-in submit path share. Encoding the full shape as a CHECK
-- would duplicate that logic in a second language and make adding a question
-- type a migration rather than a code change.
--
-- MIGRATION SAFETY
-- ----------------
-- `questions` is deliberately NOT dropped here. Both columns coexist for one
-- release so a rollback doesn't lose data and any deploy still reading
-- `questions` keeps working. Drop it in a follow-up migration once this has
-- shipped -- see the note at the bottom of this file.


-- ---------------------------------------------------------------------------
-- 1. The new column.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."meetings"
    ADD COLUMN IF NOT EXISTS "form_schema" "jsonb" NOT NULL DEFAULT '[]'::"jsonb";

ALTER TABLE "public"."meetings"
    DROP CONSTRAINT IF EXISTS "meetings_form_schema_is_array";

ALTER TABLE "public"."meetings"
    ADD CONSTRAINT "meetings_form_schema_is_array"
    CHECK ("jsonb_typeof"("form_schema") = 'array');


-- ---------------------------------------------------------------------------
-- 2. Backfill from the legacy text[].
--
-- Every legacy question becomes a required-false short_text, preserving order.
-- The generated ids are deterministic ("q_legacy_0", "q_legacy_1", ...) rather
-- than random so that re-running this migration is idempotent and so the answer
-- backfill in step 3 can compute the same ids independently.
-- ---------------------------------------------------------------------------
UPDATE "public"."meetings" m
   SET "form_schema" = (
        SELECT COALESCE(
            "jsonb_agg"(
                "jsonb_build_object"(
                    'id',       'q_legacy_' || (t.ord - 1)::"text",
                    'type',     'short_text',
                    'label',    t.q,
                    'required', false
                )
                ORDER BY t.ord
            ),
            '[]'::"jsonb"
        )
        FROM "unnest"(m."questions") WITH ORDINALITY AS t(q, ord)
   )
 WHERE m."questions" IS NOT NULL
   AND "array_length"(m."questions", 1) > 0
   -- Only fill rows that have not already been migrated, so this is safe to
   -- re-run and never clobbers a form an officer has since edited.
   AND m."form_schema" = '[]'::"jsonb";


-- ---------------------------------------------------------------------------
-- 3. Backfill existing answers into the id-keyed object shape.
--
-- Historical attendance.answers rows are in one of the two legacy shapes
-- normalizeAnswers() accepted:
--
--   positional array:  ["yes", "no"]
--   text-keyed object: {"How did you hear about this?": "Instagram"}
--
-- Both are rewritten to {"q_legacy_<i>": <answer>} using the same index->id
-- mapping step 2 generated. Rows already keyed by an id starting with "q_" are
-- left alone.
--
-- Answers are coerced to text: every legacy answer came from a free-text input,
-- and the legacy questions all became short_text above, so text is the correct
-- target type for all of them.
-- ---------------------------------------------------------------------------

-- 3a. Positional arrays -> id-keyed object, by index.
UPDATE "public"."attendance" a
   SET "answers" = (
        SELECT COALESCE("jsonb_object_agg"(
                   'q_legacy_' || (t.ord - 1)::"text",
                   t.val
               ), '{}'::"jsonb")
        FROM "jsonb_array_elements"(a."answers") WITH ORDINALITY AS t(val, ord)
        -- Drop blanks rather than storing empty strings: an unanswered optional
        -- question should be absent from the object, not present-but-empty.
        WHERE "jsonb_typeof"(t.val) <> 'null'
          AND NULLIF("btrim"(t.val #>> '{}'), '') IS NOT NULL
   )
 WHERE a."answers" IS NOT NULL
   AND "jsonb_typeof"(a."answers") = 'array';

-- 3b. Text-keyed objects -> id-keyed object, by matching the key against the
--     meeting's legacy question list.
UPDATE "public"."attendance" a
   SET "answers" = (
        SELECT COALESCE("jsonb_object_agg"(
                   'q_legacy_' || (q.ord - 1)::"text",
                   kv.value
               ), '{}'::"jsonb")
        FROM "jsonb_each"(a."answers") AS kv
        JOIN "unnest"(m."questions") WITH ORDINALITY AS q(text, ord)
          ON q.text = kv.key
        WHERE NULLIF("btrim"(kv.value #>> '{}'), '') IS NOT NULL
   )
  FROM "public"."meetings" m
 WHERE m."id" = a."meeting_id"
   AND a."answers" IS NOT NULL
   AND "jsonb_typeof"(a."answers") = 'object'
   AND m."questions" IS NOT NULL
   AND "array_length"(m."questions", 1) > 0
   -- Skip anything already in the new shape.
   AND NOT EXISTS (
        SELECT 1 FROM "jsonb_object_keys"(a."answers") AS k
        WHERE k LIKE 'q\_%'
   );

-- Normalize the "no answers" representation: a NULL and an empty object mean the
-- same thing, and the read path is simpler with one of them.
UPDATE "public"."attendance"
   SET "answers" = NULL
 WHERE "answers" = '{}'::"jsonb";


-- ---------------------------------------------------------------------------
-- 4. Index for per-question response aggregation.
--
-- The Responses tab summarizes answers per question, which means containment
-- lookups against the answers object. GIN with jsonb_path_ops is the smaller,
-- faster index for the @> containment operator that serves those queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "attendance_answers_gin"
    ON "public"."attendance"
    USING "gin" ("answers" "jsonb_path_ops")
    WHERE "answers" IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 5. Fix meetings.created_at.
--
-- The baseline declared it `time with time zone` -- a TIME OF DAY with no date
-- component, and no default, so it has been NULL on every row ever inserted.
-- That is plainly a typo for timestamptz. Nothing reads the column today (grep:
-- no reference in app/, lib/ or components/), so the rewrite is safe.
--
-- Existing values are all NULL or a bare time that cannot be resolved to a real
-- instant, so they are discarded rather than guessed at; the column is then
-- given the default every other created_at in this schema has.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."meetings"
    ALTER COLUMN "created_at" DROP DEFAULT;

ALTER TABLE "public"."meetings"
    ALTER COLUMN "created_at" TYPE timestamp with time zone
    USING NULL::timestamp with time zone;

ALTER TABLE "public"."meetings"
    ALTER COLUMN "created_at" SET DEFAULT "now"();

-- Backfill the rows that predate the default. start_time is the best available
-- proxy for when a meeting row was created; it is tz-less wall clock, so it is
-- interpreted in the database's timezone.
UPDATE "public"."meetings"
   SET "created_at" = "start_time"::timestamp with time zone
 WHERE "created_at" IS NULL
   AND "start_time" IS NOT NULL;


-- ---------------------------------------------------------------------------
-- FOLLOW-UP (do NOT run in this migration)
--
-- Once this has shipped and no deployed code reads `questions`:
--
--     ALTER TABLE "public"."meetings" DROP COLUMN "questions";
--
-- get_member_meetings_page must stop returning `questions` first -- see
-- 20260815000100_get_member_meetings_page_form_schema.sql, which does exactly
-- that. The DROP is deliberately left for a later release so this migration is
-- reversible.
-- ---------------------------------------------------------------------------
