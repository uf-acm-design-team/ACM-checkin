BEGIN;

SELECT plan(2);


-- temporarily remove officer check
CREATE OR REPLACE FUNCTION public.is_org_officer(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
AS $$
    SELECT true;
$$;


-- 1. Create a temporary table to store our generated UUIDs for easy reference
CREATE TEMP TABLE test_context (
    org_id uuid,
    m1_id uuid,
    m2_id uuid,
    m3_id uuid,
    m4_id uuid
);

INSERT INTO test_context VALUES (
    gen_random_uuid(),
    gen_random_uuid(),
    gen_random_uuid(),
    gen_random_uuid(),
    gen_random_uuid()
);

-- 2. Create 1 test organization
INSERT INTO public.organizations (id, name, slug, created_at, branding)
SELECT 
    org_id, 
    'Test Organization', 
    'test-org-' || substr(org_id::text, 1, 8), 
    '2026-10-01 00:00:00+00'::timestamptz, 
    '{}'::jsonb
FROM test_context;

-- 3. Create 4 meetings on Mondays in October 2026 (Oct 5, Oct 12, Oct 19, Oct 26)
-- Omit requires_checkin_password (and leave checkin_password null) so the generated column evaluates to false
INSERT INTO public.meetings (
    id, org_id, title, start_time, end_time, created_at, 
    status, questions, created_by, is_geo_locked, is_officer_only
)
SELECT m1_id, org_id, 'Meeting 1', '2026-10-05 18:00:00+00'::timestamptz, '2026-10-05 19:00:00+00'::timestamptz, '2026-10-01 12:00:00+00'::timestamptz, true, '{}'::text[], 'test-admin', false, false FROM test_context
UNION ALL
SELECT m2_id, org_id, 'Meeting 2', '2026-10-12 18:00:00+00'::timestamptz, '2026-10-12 19:00:00+00'::timestamptz, '2026-10-01 12:00:00+00'::timestamptz, true, '{}'::text[], 'test-admin', false, false FROM test_context
UNION ALL
SELECT m3_id, org_id, 'Meeting 3', '2026-10-19 18:00:00+00'::timestamptz, '2026-10-19 19:00:00+00'::timestamptz, '2026-10-01 12:00:00+00'::timestamptz, true, '{}'::text[], 'test-admin', false, false FROM test_context
UNION ALL
SELECT m4_id, org_id, 'Meeting 4', '2026-10-26 18:00:00+00'::timestamptz, '2026-10-26 19:00:00+00'::timestamptz, '2026-10-01 12:00:00+00'::timestamptz, true, '{}'::text[], 'test-admin', false, false FROM test_context;

-- 4. Generate 30 member rows (with an account/user_id and email) and 40 unique guest rows (no account/null user_id, email only) in the attendees table
CREATE TEMP TABLE test_members AS
SELECT 
    s AS idx,
    gen_random_uuid() AS id
FROM generate_series(1, 30) AS s;

CREATE TEMP TABLE test_guests AS
SELECT 
    s AS idx,
    gen_random_uuid() AS id
FROM generate_series(1, 40) AS s;

INSERT INTO public.attendees (id, created_at, email, first_name, last_name, grad_year, admin, user_id)
SELECT 
    id,
    '2026-10-01 00:00:00+00'::timestamptz,
    'member' || idx || '_' || substr(id::text, 1, 6) || '@ufl.edu',
    'First' || idx,
    'Last' || idx,
    '2028',
    false,
    'user_' || id::text
FROM test_members
UNION ALL
SELECT 
    id,
    '2026-10-01 00:00:00+00'::timestamptz,
    'guest' || idx || '_' || substr(id::text, 1, 6) || '@ufl.edu',
    'GuestFirst' || idx,
    'GuestLast' || idx,
    '2028',
    false,
    NULL
FROM test_guests;

-- ============================================================================
-- 5. Insert Attendance Records
-- ============================================================================

-- MEETING 1 (Oct 5): 
-- 10 Guests (Guests #1 to #10 -> 10 first-time, 0 returning)
-- 20 Members (Members #1 to #20 -> 20 first-time, 0 returning)
-- Totals: 30 first-time, 0 returning
INSERT INTO public.attendance (id, org_id, meeting_id, attendee_id, source, checked_in_at, answers)
SELECT gen_random_uuid(), c.org_id, c.m1_id, g.id, 'guest', '2026-10-05 18:05:00+00'::timestamptz, '{}'::jsonb
FROM test_context c
CROSS JOIN test_guests g
WHERE g.idx BETWEEN 1 AND 10
UNION ALL
SELECT gen_random_uuid(), c.org_id, c.m1_id, m.id, 'seed', '2026-10-05 18:05:00+00'::timestamptz, '{}'::jsonb
FROM test_context c
CROSS JOIN test_members m
WHERE m.idx BETWEEN 1 AND 20;

-- MEETING 2 (Oct 12): 
-- 8 Guests (Guests #6 to #13 -> 5 returning [#6-#10], 3 first-time [#11-#13])
-- 20 Members (Members #6 to #25 -> 15 returning [#6-#20], 5 first-time [#21-#25])
-- Totals: 8 first-time, 20 returning
INSERT INTO public.attendance (id, org_id, meeting_id, attendee_id, source, checked_in_at, answers)
SELECT gen_random_uuid(), c.org_id, c.m2_id, g.id, 'guest', '2026-10-12 18:05:00+00'::timestamptz, '{}'::jsonb
FROM test_context c
CROSS JOIN test_guests g
WHERE g.idx BETWEEN 6 AND 13
UNION ALL
SELECT gen_random_uuid(), c.org_id, c.m2_id, m.id, 'seed', '2026-10-12 18:05:00+00'::timestamptz, '{}'::jsonb
FROM test_context c
CROSS JOIN test_members m
WHERE m.idx BETWEEN 6 AND 25;

-- MEETING 3 (Oct 19): 
-- 30 Guests (Guests #1 to #30 -> 13 returning [#1-#13], 17 first-time [#14-#30])
-- 30 Members (Members #1 to #30 -> 25 returning [#1-#25], 5 first-time [#26-#30])
-- Totals: 22 first-time, 38 returning
INSERT INTO public.attendance (id, org_id, meeting_id, attendee_id, source, checked_in_at, answers)
SELECT gen_random_uuid(), c.org_id, c.m3_id, g.id, 'guest', '2026-10-19 18:05:00+00'::timestamptz, '{}'::jsonb
FROM test_context c
CROSS JOIN test_guests g
WHERE g.idx BETWEEN 1 AND 30
UNION ALL
SELECT gen_random_uuid(), c.org_id, c.m3_id, m.id, 'seed', '2026-10-19 18:05:00+00'::timestamptz, '{}'::jsonb
FROM test_context c
CROSS JOIN test_members m
WHERE m.idx BETWEEN 1 AND 30;

-- MEETING 4 (Oct 26): 
-- 20 Guests (Guests #21 to #40 -> 10 returning [#21-#30], 10 first-time [#31-#40])
-- 10 Members (Members #1 to #10 -> 10 returning [#1-#10], 0 first-time)
-- Totals: 10 first-time, 20 returning
INSERT INTO public.attendance (id, org_id, meeting_id, attendee_id, source, checked_in_at, answers)
SELECT gen_random_uuid(), c.org_id, c.m4_id, g.id, 'guest', '2026-10-26 18:05:00+00'::timestamptz, '{}'::jsonb
FROM test_context c
CROSS JOIN test_guests g
WHERE g.idx BETWEEN 21 AND 40
UNION ALL
SELECT gen_random_uuid(), c.org_id, c.m4_id, m.id, 'seed', '2026-10-26 18:05:00+00'::timestamptz, '{}'::jsonb
FROM test_context c
CROSS JOIN test_members m
WHERE m.idx BETWEEN 1 AND 10;

-- ============================================================================
-- 6. pgTAP Assertions
-- ============================================================================

-- Test 1: Verify get_org_attendance_by_meeting
SELECT results_eq(
    $$
        SELECT title, total::bigint, members::bigint, guests::bigint
        FROM public.get_org_attendance_by_meeting(
            (SELECT org_id FROM test_context),
            '2026-10-01 00:00:00+00'::timestamptz,
            '2026-10-31 23:59:59+00'::timestamptz
        )
        ORDER BY start_time ASC
    $$,
    $$
        VALUES 
            ('Meeting 1'::text, 30::bigint, 20::bigint, 10::bigint),
            ('Meeting 2'::text, 28::bigint, 20::bigint, 8::bigint),
            ('Meeting 3'::text, 60::bigint, 30::bigint, 30::bigint),
            ('Meeting 4'::text, 30::bigint, 10::bigint, 20::bigint)
    $$,
    'get_org_attendance_by_meeting should return accurate total, member, and guest counts across all 4 October meetings'
);

-- Test 2: Verify get_org_retention_by_meeting
SELECT results_eq(
    $$
        SELECT meeting_title, first_time::bigint, "returning"::bigint, total::bigint
        FROM public.get_org_retention_by_meeting(
            (SELECT org_id FROM test_context),
            '2026-10-01 00:00:00+00'::timestamptz,
            '2026-10-31 23:59:59+00'::timestamptz
        )
        ORDER BY meeting_title ASC
    $$,
    $$
        VALUES 
            ('Meeting 1'::text, 30::bigint, 0::bigint, 30::bigint),
            ('Meeting 2'::text, 8::bigint, 20::bigint, 28::bigint),
            ('Meeting 3'::text, 22::bigint, 38::bigint, 60::bigint),
            ('Meeting 4'::text, 10::bigint, 20::bigint, 30::bigint)
    $$,
    'get_org_retention_by_meeting should accurately track first_time vs returning members and guests across the 4 meetings'
);

SELECT * FROM finish();
ROLLBACK;