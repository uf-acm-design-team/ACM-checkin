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
    // applyAccent is deliberately NOT set here. Org colours are painted only on
    // the check-in route, which opts in via its own segment layout; every other
    // org page uses the product's fixed design system. See OrgTheme.
    <OrgTheme slug={orgSlug}>
      <div className="flex min-h-dvh flex-col bg-canvas">
        {/* OrgNav renders null on the admin dashboard, which supplies its own
            shell -- see the pathname guard in the component. */}
        <OrgNav />
        {children}
      </div>
    </OrgTheme>
  );
}
