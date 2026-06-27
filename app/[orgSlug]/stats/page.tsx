import { StatsView } from "@/components/stats/stats-view";
import { getMockMeetings } from "@/components/stats/mock-meetings";

export default async function StatsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { attendedMeetings, clubMeetings } = getMockMeetings(orgSlug);

  return (
    <main className="mx-auto w-full max-w-4xl">
      <StatsView
        attendedMeetings={attendedMeetings}
        clubMeetings={clubMeetings}
      />
    </main>
  );
}
