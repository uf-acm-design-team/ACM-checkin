-- Check-in passwords ignore upper/lowercase and leading/trailing spaces (AC-9).
--
-- Phones capitalise the first letter of a text field, so "acm2026" arrived as
-- "Acm2026" and members were told the password was wrong. Both sides are now
-- normalised when compared: leading/trailing ASCII whitespace (space, tab,
-- CR, LF) is stripped and the rest is lowercased. Inner spaces still count.
-- The stored value is not rewritten, so officers still see what they typed.
--
-- This mirrors normalizeCheckinPassword() in lib/checkin-password.ts, which
-- the guest check-in path uses. Change both together.
--
-- Same signature as before, so grants carry over and the generated mobile
-- types don't change. The grants are restated anyway to keep them in view.

CREATE OR REPLACE FUNCTION "public"."verify_meeting_checkin_password"("p_meeting_id" "uuid", "p_password" "text")
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = "public"
AS $$
    SELECT COALESCE(
        (
            SELECT "checkin_password" IS NULL
                OR lower(regexp_replace("checkin_password", '^[ \t\r\n]+|[ \t\r\n]+$', '', 'g'))
                 = lower(regexp_replace(COALESCE(p_password, ''), '^[ \t\r\n]+|[ \t\r\n]+$', '', 'g'))
            FROM "public"."meetings"
            WHERE "id" = p_meeting_id
        ),
        false
    );
$$;

REVOKE EXECUTE ON FUNCTION "public"."verify_meeting_checkin_password"("uuid", "text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."verify_meeting_checkin_password"("uuid", "text") TO "authenticated";
