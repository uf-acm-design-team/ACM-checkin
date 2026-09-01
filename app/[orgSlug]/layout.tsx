import OrgTheme from "@/app/components/OrgTheme";
import OrgNav from "@/app/components/OrgNav";

export default async function OrgSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return (
    // applyAccent covers the whole /[orgSlug] subtree: check-in, the org home,
    // stats and the admin console all carry the club's colour on their primary
    // button, active tab and identity tiles.
    //
    // Only the accent tier is overridden -- surfaces, the slate text ramp and
    // the semantic good/warn/bad tones stay fixed, so a club cannot make its own
    // error states unreadable and the admin console's tables stay legible on any
    // palette. See brandingToCssVars.
    <OrgTheme slug={orgSlug} applyAccent>
      <div className="flex min-h-dvh flex-col bg-canvas">
        {/* OrgNav renders null on the admin dashboard, which supplies its own
            shell -- see the pathname guard in the component. */}
        <OrgNav />
        {children}
      </div>
    </OrgTheme>
  );
}
