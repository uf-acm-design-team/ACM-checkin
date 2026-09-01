import OrgTheme from "@/app/components/OrgTheme";

/**
 * The one route where a club's own colour is painted.
 *
 * Re-runs OrgTheme with applyAccent so the check-in flow's primary button,
 * active states and identity tiles carry the org's accent instead of the
 * product purple. Nesting a second BrandingProvider is harmless -- the inner
 * one wins for descendants and resolves to the same values -- and it keeps the
 * decision colocated with the route it applies to rather than smuggled into a
 * shared parent via pathname sniffing, which a server layout cannot do anyway.
 */
export default async function CheckinLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return (
    <OrgTheme slug={orgSlug} applyAccent>
      {children}
    </OrgTheme>
  );
}
