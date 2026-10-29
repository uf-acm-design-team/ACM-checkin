-- Range checks on meetings, mirroring validateMeetingDraft in
-- lib/meeting-validation.ts (radius matches RADIUS_MIN/MAX_METERS there).
-- NULL passes every check, so meetings without geolock or times are unaffected.
--
-- Each constraint is added NOT VALID only if missing, then validated. VALIDATE
-- fails on any existing bad row and rolls the migration back; no data is changed.

DO $$
DECLARE
    v_name "text";
    v_check "text";
BEGIN
    FOR v_name, v_check IN VALUES
        ('meetings_latitude_range', '"latitude" BETWEEN -90 AND 90'),
        ('meetings_longitude_range', '"longitude" BETWEEN -180 AND 180'),
        ('meetings_radius_meters_range', '"radius_meters" BETWEEN 10 AND 5000'),
        ('meetings_end_after_start', '"end_time" > "start_time"')
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM "pg_catalog"."pg_constraint"
             WHERE conrelid = 'public.meetings'::regclass
               AND conname = v_name
        ) THEN
            EXECUTE format(
                'ALTER TABLE "public"."meetings" ADD CONSTRAINT %I CHECK (%s) NOT VALID',
                v_name,
                v_check
            );
        END IF;

        EXECUTE format(
            'ALTER TABLE "public"."meetings" VALIDATE CONSTRAINT %I',
            v_name
        );
    END LOOP;
END
$$;
