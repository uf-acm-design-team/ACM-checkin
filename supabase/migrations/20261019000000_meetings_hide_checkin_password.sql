-- Hide meetings.checkin_password from anon and authenticated.
--
-- 20260826000000 revoked SELECT on the column, but the table-level GRANT SELECT
-- from 20260813000100 still covered it. Swap the table grant for a column list.
-- The list is read at run time so columns added outside migrations keep access,
-- and the REVOKE also clears column grants, so re-running ends in the same state.

DO $$
DECLARE
    v_cols "text";
    v_role "text";
    v_col "text";
BEGIN
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO v_cols
      FROM "information_schema"."columns"
     WHERE table_schema = 'public'
       AND table_name = 'meetings'
       AND column_name <> 'checkin_password';

    REVOKE SELECT ON TABLE "public"."meetings" FROM "anon", "authenticated";
    EXECUTE format(
        'GRANT SELECT (%s) ON TABLE "public"."meetings" TO "anon", "authenticated"',
        v_cols
    );

    -- Roll back unless the password is hidden and every other column is readable.
    -- Also catches a grant from another grantor that the REVOKE above can't remove.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_column_privilege(v_role, 'public.meetings', 'checkin_password', 'SELECT') THEN
            RAISE EXCEPTION '% can still read meetings.checkin_password', v_role;
        END IF;

        FOR v_col IN
            SELECT column_name
              FROM "information_schema"."columns"
             WHERE table_schema = 'public'
               AND table_name = 'meetings'
               AND column_name <> 'checkin_password'
        LOOP
            IF NOT has_column_privilege(v_role, 'public.meetings', v_col, 'SELECT') THEN
                RAISE EXCEPTION '% lost SELECT on meetings.%', v_role, v_col;
            END IF;
        END LOOP;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
