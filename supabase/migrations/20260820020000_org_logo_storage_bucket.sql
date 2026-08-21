-- Storage bucket for org logos (crest/wordmark), uploaded by the create-org
-- edge function using the service role key. This is a stand-in for real
-- object storage: same bucket-based shape, so swapping providers later only
-- touches the edge function, not organizations.branding's schema.
--
-- Public so branding.logo URLs render on public-facing pages (the guest
-- check-in flow) without auth. Writes always go through the service role
-- (RLS/storage policies are bypassed for it), so no INSERT/UPDATE policy is
-- needed here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'org-logos',
    'org-logos',
    true,
    2097152, -- 2MB
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;
