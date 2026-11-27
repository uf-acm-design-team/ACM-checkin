-- verify_meeting_checkin_password ignores case and leading/trailing spaces
-- (AC-9) but still rejects wrong passwords. Run with `npx supabase test db`.
BEGIN;

SELECT plan(8);

CREATE TEMP TABLE test_context (org_id uuid, locked_id uuid, open_id uuid);
INSERT INTO test_context VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

INSERT INTO public.organizations (id, name, slug, created_at, branding)
SELECT org_id, 'Password Test Org', 'pw-test-' || substr(org_id::text, 1, 8), now(), '{}'::jsonb
FROM test_context;

INSERT INTO public.meetings (
    id, org_id, title, start_time, end_time, created_at,
    status, questions, created_by, is_geo_locked, is_officer_only, checkin_password
)
SELECT locked_id, org_id, 'Locked', now(), now() + interval '1 hour', now(),
       true, '{}'::text[], 'test-admin', false, false, 'ACM2026'
FROM test_context
UNION ALL
SELECT open_id, org_id, 'Open', now(), now() + interval '1 hour', now(),
       true, '{}'::text[], 'test-admin', false, false, NULL
FROM test_context;

SELECT ok(public.verify_meeting_checkin_password((SELECT locked_id FROM test_context), 'ACM2026'),
          'exact password is accepted');
SELECT ok(public.verify_meeting_checkin_password((SELECT locked_id FROM test_context), 'acm2026'),
          'lowercase password is accepted');
SELECT ok(public.verify_meeting_checkin_password((SELECT locked_id FROM test_context), ' Acm2026 '),
          'capitalised password with surrounding spaces is accepted');
SELECT ok(public.verify_meeting_checkin_password((SELECT locked_id FROM test_context), E'\tACM2026\n'),
          'tabs and newlines around the password are ignored');
SELECT ok(NOT public.verify_meeting_checkin_password((SELECT locked_id FROM test_context), 'ACM2025'),
          'wrong password is rejected');
SELECT ok(NOT public.verify_meeting_checkin_password((SELECT locked_id FROM test_context), 'acm 2026'),
          'inner spaces still count');
SELECT ok(public.verify_meeting_checkin_password((SELECT open_id FROM test_context), ''),
          'meeting without a password accepts anything');
SELECT ok(NOT public.verify_meeting_checkin_password(gen_random_uuid(), 'ACM2026'),
          'unknown meeting is rejected');

SELECT * FROM finish();
ROLLBACK;
