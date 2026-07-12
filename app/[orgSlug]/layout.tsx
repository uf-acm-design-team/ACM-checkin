import OrgTheme from "@/app/components/OrgTheme";

export default async function OrgSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <OrgTheme slug={orgSlug}>{children}</OrgTheme>;
}
