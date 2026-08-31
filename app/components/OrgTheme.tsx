import { createAnonSupabaseClient } from "@/app/utils/supabase/server";
import { resolveBranding, brandingToCssVars } from "@/lib/branding";
import { BrandingProvider } from "@/app/components/BrandingProvider";

// Server component. Fetches an org's name + branding by slug, injects the
// resolved colors as :root CSS variables (so the ancestor AppBackground
// picks them up), and provides name/logo to client descendants via context.
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
  children,
}: {
  slug: string;
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
      {/* Values are validated hex (lib/branding.ts), so no injection risk. */}
      <style>{`:root{${brandingToCssVars(branding)}}`}</style>
      <BrandingProvider value={{ name, slug, ...branding }}>
        {children}
      </BrandingProvider>
    </>
  );
}
