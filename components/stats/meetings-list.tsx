import { MeetingListItem } from "./meeting-list-item";
import type { Meeting } from "./mock-meetings";

export function MeetingsList({
  meetings,
  emptyMessage = "No meetings attended yet. Check in at the next event!",
}: {
  meetings: Meeting[];
  emptyMessage?: string;
}) {
  if (meetings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center">
        <p className="text-sm text-white/70">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3 md:grid md:grid-cols-2">
      {meetings.map((meeting) => (
        <MeetingListItem key={meeting.id} meeting={meeting} />
      ))}
    </ul>
  );
}
