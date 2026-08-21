-- Auto-close meetings once their end time has passed.

-- Enable the pg_cron extension. pg_cron's control file hardcodes
-- `schema = cron` (relocatable = false), so it must install into its own
-- "cron" schema -- specifying another schema here fails outright.
create extension if not exists pg_cron;

--- indexing for efficient checking
CREATE INDEX IF NOT EXISTS "idx_meetings_status_end_time"
    ON "public"."meetings" ("status", "end_time");


--- function that closes meetings whose end_time has passed
CREATE OR REPLACE FUNCTION "public"."close_expired_meetings"()
RETURNS void
LANGUAGE "sql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    UPDATE "public"."meetings"
    SET "status" = false
    WHERE "status" = true
      AND "end_time" IS NOT NULL
      AND "end_time" < NOW();
$$;

--- (re)schedule the cron job that runs the function every minute
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "cron"."job"
        WHERE "jobname" = 'close-expired-meetings'
    ) THEN
        PERFORM "cron"."unschedule"('close-expired-meetings');
    END IF;

    PERFORM "cron"."schedule"(
        'close-expired-meetings',
        '* * * * *',
        $cron$SELECT "public"."close_expired_meetings"();$cron$
    );
END
$$;
