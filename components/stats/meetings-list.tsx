import { MeetingListItem } from "./meeting-list-item";
import type { StatsMeeting } from "@/lib/stats-terms";
import { EmptyState } from "@/components/ui/primitives";

export function MeetingsList({
  meetings,
  emptyMessage = "No meetings yet.",
  emptyTitle = "Nothing here yet",
}: {
  meetings: StatsMeeting[];
  emptyMessage?: string;
  emptyTitle?: string;
}) {
  if (meetings.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyMessage}</EmptyState>;
  }

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {meetings.map((meeting) => (
        <MeetingListItem key={meeting.id} meeting={meeting} />
      ))}
    </ul>
  );
}
