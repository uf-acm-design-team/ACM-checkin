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
    <OrgTheme slug={orgSlug}>
      {/* OrgNav renders null on the admin dashboard, which supplies its own
          shell -- see the pathname guard in the component. */}
      <OrgNav />
      {children}
    </OrgTheme>
  );
}
