-- Follow-up to converting meetings.start_time / meetings.end_time from
-- `timestamp without time zone` to `timestamptz`.
--
-- THE COLUMN TYPE CHANGE ITSELF WAS APPLIED OUT OF BAND (via the Supabase
-- dashboard), so this migration does not repeat it. What it does is fix the one
-- piece of SQL whose correctness depended on the old type.
--
-- WHAT WAS BROKEN
-- ---------------
-- close_expired_meetings() compared a tz-less column against NOW():
--
--     WHERE end_time < NOW()
--
-- Comparing `timestamp` to `timestamptz` casts NOW() into the SERVER's
-- timezone, which on Supabase is UTC. But end_time held a bare Eastern
-- wall-clock string, four hours behind UTC in EDT (five in EST). So every
-- meeting looked four hours more expired than it was, and the cron -- which
-- runs every minute -- closed any meeting shorter than the UTC offset on its
-- very first tick. A normal one-hour club meeting never survived to accept a
-- single check-in.
--
-- Now that end_time is a real instant, both sides of the comparison are
-- instants and the operator does the right thing with no casting. The body
-- below is therefore identical to the original except for the type it now
-- operates on -- the fix was the column, and this makes the intent explicit.
--
-- The idx_meetings_status_end_time index from 20260820000000 was rebuilt
-- automatically by the ALTER TYPE, so it needs no attention here.

CREATE OR REPLACE FUNCTION "public"."close_expired_meetings"()
RETURNS void
LANGUAGE "sql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    -- end_time is timestamptz: this is a true instant comparison, valid from
    -- any server timezone and across DST transitions.
    UPDATE "public"."meetings"
    SET "status" = false
    WHERE "status" = true
      AND "end_time" IS NOT NULL
      AND "end_time" < NOW();
$$;


-- ---------------------------------------------------------------------------
-- One-time repair: reopen meetings the old comparison closed early.
--
-- The cron only ever closes, so every meeting it wrongly closed is still
-- sitting at status = false. Restrict to meetings that have NOT actually ended
-- yet -- a meeting whose end time has genuinely passed should stay closed, and
-- this way the statement cannot resurrect anything from the past.
--
-- This also reopens two kinds of meeting an officer may have closed on purpose:
-- one closed while still running, and a FUTURE meeting created in the closed
-- state (drafted ahead of time). Both are a much smaller harm than a meeting
-- nobody can check into -- neither loses data, and either can be closed again
-- with one click -- but it is worth knowing before running this against
-- production. To be conservative, add:
--
--     AND "start_time" <= NOW()
--
-- which limits the repair to meetings that have already started.
-- ---------------------------------------------------------------------------
UPDATE "public"."meetings"
SET "status" = true
WHERE "status" = false
  AND "end_time" IS NOT NULL
  AND "end_time" > NOW();
