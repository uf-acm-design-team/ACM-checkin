-- supabase/seed.sql
-- Minimal dummy data for local dev. Safe to re-run after `supabase db reset`.

BEGIN;

-- 1) Organizations
INSERT INTO public.organizations (slug, name)
VALUES
  ('aed', 'AED'),
  ('acm', 'ACM'),
  ('colorstack', 'ColorStack')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- Helper CTE to resolve org ids by slug
WITH orgs AS (
  SELECT id, slug
  FROM public.organizations
  WHERE slug IN ('aed', 'acm', 'colorstack')
)

-- 2) Meetings (one active now + one past per org)
INSERT INTO public.meetings (org_id, title, start_time, end_time, status, questions)
SELECT
  o.id,
  CASE o.slug
    WHEN 'aed' THEN 'AED General Body Meeting'
    WHEN 'acm' THEN 'ACM Workshop'
    WHEN 'colorstack' THEN 'ColorStack Community Meetup'
  END,
  (now() - interval '15 minutes')::timestamp,
  (now() + interval '45 minutes')::timestamp,
  true,
  ARRAY['How did you hear about this?', 'Did you bring a friend?']::text[]
FROM orgs o;

WITH orgs AS (
  SELECT id, slug
  FROM public.organizations
  WHERE slug IN ('aed', 'acm', 'colorstack')
)
INSERT INTO public.meetings (org_id, title, start_time, end_time, status, questions)
SELECT
  o.id,
  CASE o.slug
    WHEN 'aed' THEN 'AED Past Event'
    WHEN 'acm' THEN 'ACM Past Event'
    WHEN 'colorstack' THEN 'ColorStack Past Event'
  END,
  (now() - interval '14 days')::timestamp,
  (now() - interval '14 days' + interval '1 hour')::timestamp,
  false,
  ARRAY[]::text[]
FROM orgs o;

-- 3) Attendees (global people)
-- IMPORTANT: You should enforce UNIQUE(lower(trim(email))) in schema eventually.
INSERT INTO public.attendee (email, first_name, last_name, grad_year, admin)
VALUES
  ('alice@ufl.edu', 'Alice', 'Nguyen', '2027', false),
  ('bryce@ufl.edu', 'Bryce', 'Miller', '2026', true),
  ('carlos@ufl.edu', 'Carlos', 'Santos', '2025', false)
ON CONFLICT DO NOTHING;  -- if you later add a unique constraint, change this to ON CONFLICT(email) DO UPDATE ...

-- 4) Attendance rows (each attendee checks into one org’s currently-active meeting)
-- Resolve active meeting per org and attendee ids by email.
WITH
  org_ids AS (
    SELECT slug, id
    FROM public.organizations
    WHERE slug IN ('aed', 'acm', 'colorstack')
  ),
  active_meetings AS (
    SELECT m.id AS meeting_id, m.org_id
    FROM public.meetings m
    WHERE m.status = true
      AND m.start_time <= now()
      AND m.end_time >= now()
  ),
  a AS (
    SELECT id AS attendee_id, lower(trim(email)) AS email_n
    FROM public.attendee
    WHERE lower(trim(email)) IN ('alice@ufl.edu','bryce@ufl.edu','carlos@ufl.edu')
  )
INSERT INTO public.attendance (org_id, meeting_id, attendee_id, source, answers)
SELECT
  o.id AS org_id,
  am.meeting_id,
  a.attendee_id,
  'seed' AS source,
  ARRAY['seed answer 1','seed answer 2']::text[]
FROM (VALUES
  ('aed','alice@ufl.edu'),
  ('acm','bryce@ufl.edu'),
  ('colorstack','carlos@ufl.edu')
) AS map(slug, email_n)
JOIN org_ids o ON o.slug = map.slug
JOIN active_meetings am ON am.org_id = o.id
JOIN a ON a.email_n = map.email_n;

COMMIT;