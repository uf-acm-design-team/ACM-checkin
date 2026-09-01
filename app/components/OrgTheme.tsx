import { createAnonSupabaseClient } from "@/app/utils/supabase/server";
import { resolveBranding, brandingToCssVars } from "@/lib/branding";
import { BrandingProvider } from "@/app/components/BrandingProvider";

// Server component. Fetches an org's name + branding by slug and provides
// name/logo/colors to client descendants via context.
//
// Whether the org's colours are actually PAINTED is a separate decision from
// whether they're available, and that's what `applyAccent` controls. The design
// system is fixed -- white surfaces, slate text, one purple accent -- across
// every route except /[orgSlug]/checkin, where the accent slot is filled with
// the club's own colour. An attendee at a club's door should see that club; an
// officer moving between clubs should see one consistent console.
//
// Only the accent tier is overridden even then. Surfaces, the text ramp and the
// semantic tones stay fixed, so a club can't make its own error states
// unreadable. See brandingToCssVars.
//
// Uses the SERVER anon client. The browser client in utils/supabase/client.ts
// is a module-level singleton whose accessToken callback returns null when
// there is no window -- so on the server it carried no identity anyway, while
// being shared across every concurrent request.
//
// Anon is still the right level: organizations are readable by anon under RLS
// (orgs_public_read), which is required for the signed-out guest check-in page
// to render an org's branding at all.
export default async function OrgTheme({
  slug,
  applyAccent = false,
  children,
}: {
  slug: string;
  /** Paint the org's accent into --accent-*. Check-in only. */
  applyAccent?: boolean;
  children: React.ReactNode;
}) {
  const supabase = createAnonSupabaseClient();
  const result = await supabase
    .from("organizations")
    .select("name, branding")
    .eq("slug", slug)
    .maybeSingle();

  const data = result.data as { name: string | null; branding: unknown } | null;

  const branding = resolveBranding(data?.branding);
  const name = data?.name ?? "";

  return (
    <>
      {/* Values are validated hex (lib/branding.ts), so no injection risk.
          Scoped to :root so the tokens reach the whole subtree, including
          portalled content. */}
      {applyAccent && <style>{`:root{${brandingToCssVars(branding)}}`}</style>}
      <BrandingProvider value={{ name, slug, ...branding }}>
        {children}
      </BrandingProvider>
    </>
  );
}
