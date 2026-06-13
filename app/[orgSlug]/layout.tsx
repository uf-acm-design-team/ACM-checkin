import ParticlesLayout from "../components/ParticlesLayout";
import orgsData from "./orgs.json";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgConfig = orgsData.slugs[orgSlug.toLowerCase() as keyof typeof orgsData.slugs];

  return (
    <ParticlesLayout
      fromColor={orgConfig?.primary_color}
      toColor={orgConfig?.secondary_color}
    >
      {children}
    </ParticlesLayout>
  );
}
