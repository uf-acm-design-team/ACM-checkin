-- Convert meetings.start_time / end_time to timestamptz where they are still
-- `timestamp without time zone`.
--
-- Production was converted out of band (see 20260827000000), so databases built
-- from migrations kept the old type and read times 4-5 hours off. Guarded per
-- column, so this is a no-op where the column is already timestamptz.
-- Existing naive values are UTC (seed uses now(); the app writes UTC instants).

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns"
        WHERE "table_schema" = 'public' AND "table_name" = 'meetings'
          AND "column_name" = 'start_time' AND "data_type" = 'timestamp without time zone'
    ) THEN
        ALTER TABLE "public"."meetings"
            ALTER COLUMN "start_time" TYPE timestamptz USING "start_time" AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns"
        WHERE "table_schema" = 'public' AND "table_name" = 'meetings'
          AND "column_name" = 'end_time' AND "data_type" = 'timestamp without time zone'
    ) THEN
        ALTER TABLE "public"."meetings"
            ALTER COLUMN "end_time" TYPE timestamptz USING "end_time" AT TIME ZONE 'UTC';
    END IF;
END
$$;
