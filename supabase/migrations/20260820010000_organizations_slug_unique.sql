-- Enforce unique org slugs.
--
-- [orgSlug] routing (app/[orgSlug]/**) resolves an org with
-- `.eq("slug", orgSlug).single()`. With no uniqueness constraint, two orgs
-- created with the same slug would make that lookup ambiguous -- whichever
-- row Postgres happens to return first "wins" the route. Enforced
-- case-insensitively since the create-org edge function always lowercases
-- slugs before insert, but existing rows were never normalized.
--
-- This will fail loudly if duplicate slugs already exist. That's
-- intentional: an org can have meetings/memberships hanging off it, so
-- silently deleting one to make room is not safe to automate. Resolve any
-- collision by hand (rename one slug) before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key"
    ON "public"."organizations" (lower("slug"));
