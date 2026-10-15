-- Publish attendance inserts to Supabase Realtime for the admin live check-in feed.
-- Existing attendance SELECT policies scope which events each subscriber receives.
-- Guarded so it is a no-op where attendance is already in the publication.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "pg_catalog"."pg_publication_tables"
        WHERE "pubname" = 'supabase_realtime'
          AND "schemaname" = 'public'
          AND "tablename" = 'attendance'
    ) THEN
        ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."attendance";
    END IF;
END
$$;
