import { createClient } from "@/app/utils/supabase/client";
import { resolveBranding, brandingToCssVars } from "@/lib/branding";
import { BrandingProvider } from "@/app/components/BrandingProvider";

// Server component. Fetches an org's name + branding by slug, injects the
// resolved colors as :root CSS variables (so the ancestor ParticlesLayout
// picks them up), and provides name/logo to client descendants via context.
//
// Branding is public (RLS is disabled), so the anon supabase-js client is
// sufficient and no auth/cookies are needed for this read.
export default async function OrgTheme({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const supabase = createClient();
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
