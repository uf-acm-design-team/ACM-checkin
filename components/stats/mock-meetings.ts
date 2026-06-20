export type Meeting = {
  id: string;
  title: string;
  start_time: string;
  /** Whether the logged-in member attended this meeting. */
  attended: boolean;
  /** Optional summary written by an officer. When present, members can view it. */
  description?: string;
};

export type Term = {
  key: string;
  label: string;
  season: "Spring" | "Summer" | "Fall";
  year: number;
};

export function getTerm(isoDate: string): Term {
  const date = new Date(isoDate);
  const month = date.getMonth();
  const year = date.getFullYear();
  const season: Term["season"] =
    month <= 4 ? "Spring" : month <= 6 ? "Summer" : "Fall";
  return {
    key: `${year}-${season}`,
    label: `${season} ${year}`,
    season,
    year,
  };
}

const SEASON_ORDER: Record<Term["season"], number> = {
  Spring: 0,
  Summer: 1,
  Fall: 2,
};

export function compareTermsDesc(a: Term, b: Term): number {
  if (a.year !== b.year) return b.year - a.year;
  return SEASON_ORDER[b.season] - SEASON_ORDER[a.season];
}

/**
 * Per-org mock club meetings. `attended` marks the ones the logged-in member
 * checked into; the attended view is derived from the same source. Each org
 * gets its own themed set so `/[orgSlug]/stats` looks distinct while we're
 * still on mock data. Prefixed ids keep keys unique across orgs.
 */

// AED — pre-med / medical theme.
const AED_CLUB_MEETINGS: Meeting[] = [
  // Spring 2026
  {
    id: "aed-1",
    title: "Mentorship Meeting",
    start_time: "2026-04-16T18:00:00-04:00",
    attended: true,
    description:
      "Mentors and mentees paired up for the semester. We discussed study strategies, shadowing opportunities, and set goals for the rest of the term.",
  },
  { id: "aed-2", title: "Suturing Workshop", start_time: "2026-04-09T18:00:00-04:00", attended: true },
  {
    id: "aed-3",
    title: "Guest Speaker: Dr. Patel",
    start_time: "2026-03-26T18:00:00-04:00",
    attended: true,
    description:
      "Dr. Patel shared her path into cardiology and answered questions about residency applications and work-life balance in medicine.",
  },
  {
    id: "aed-15",
    title: "Blood Drive Volunteering",
    start_time: "2026-03-19T15:00:00-04:00",
    attended: false,
    description:
      "Members helped run the campus blood drive check-in table. Great service hours opportunity.",
  },
  { id: "aed-4", title: "Cadaver Lab Tour", start_time: "2026-03-12T18:00:00-04:00", attended: true },
  { id: "aed-5", title: "MCAT Prep Panel", start_time: "2026-02-26T18:00:00-05:00", attended: true },
  { id: "aed-16", title: "Resume Workshop", start_time: "2026-02-12T18:00:00-05:00", attended: false },
  { id: "aed-6", title: "Spring Kickoff Social", start_time: "2026-01-22T18:00:00-05:00", attended: true },
  // Fall 2025
  { id: "aed-7", title: "End-of-Semester Banquet", start_time: "2025-12-04T18:00:00-05:00", attended: true },
  {
    id: "aed-17",
    title: "Hospital Shadowing Info Session",
    start_time: "2025-11-20T18:00:00-05:00",
    attended: false,
    description:
      "Overview of the partner hospital shadowing program and how to sign up for rotations.",
  },
  { id: "aed-8", title: "Research Showcase", start_time: "2025-11-13T18:00:00-05:00", attended: true },
  { id: "aed-9", title: "Med School Admissions Q&A", start_time: "2025-10-23T18:00:00-04:00", attended: true },
  { id: "aed-10", title: "Anatomy Trivia Night", start_time: "2025-10-09T18:00:00-04:00", attended: true },
  { id: "aed-18", title: "Fall General Body Meeting", start_time: "2025-09-18T18:00:00-04:00", attended: false },
  { id: "aed-11", title: "Fall Welcome Mixer", start_time: "2025-09-04T18:00:00-04:00", attended: true },
  // Spring 2025
  { id: "aed-12", title: "Volunteer Service Day", start_time: "2025-03-29T10:00:00-04:00", attended: true },
  { id: "aed-13", title: "Pre-Health Career Panel", start_time: "2025-02-20T18:00:00-05:00", attended: true },
  { id: "aed-19", title: "Intro to Clinical Skills", start_time: "2025-02-06T18:00:00-05:00", attended: false },
  { id: "aed-14", title: "Spring Kickoff Social", start_time: "2025-01-23T18:00:00-05:00", attended: true },
];

// ACM — computer science / software theme.
const ACM_CLUB_MEETINGS: Meeting[] = [
  // Spring 2026
  {
    id: "acm-1",
    title: "Intro to Git & GitHub Workshop",
    start_time: "2026-04-15T18:30:00-04:00",
    attended: true,
    description:
      "Hands-on walkthrough of branching, pull requests, and resolving merge conflicts. Attendees set up their first collaborative repo.",
  },
  { id: "acm-2", title: "Spring Hackathon Kickoff", start_time: "2026-04-08T18:30:00-04:00", attended: true },
  {
    id: "acm-3",
    title: "Guest Speaker: SWE at Google",
    start_time: "2026-03-25T18:30:00-04:00",
    attended: true,
    description:
      "A UF alum now at Google talked through the interview loop, leveling, and what day-to-day work looks like on a large infra team.",
  },
  { id: "acm-4", title: "LeetCode Grind Night", start_time: "2026-03-11T18:30:00-04:00", attended: true },
  { id: "acm-13", title: "Cloud Computing 101", start_time: "2026-02-25T18:30:00-05:00", attended: false },
  { id: "acm-5", title: "Resume Review Night", start_time: "2026-02-11T18:30:00-05:00", attended: true },
  { id: "acm-6", title: "Spring Kickoff Social", start_time: "2026-01-21T18:30:00-05:00", attended: true },
  // Fall 2025
  {
    id: "acm-7",
    title: "AI/ML Panel",
    start_time: "2025-11-19T18:30:00-05:00",
    attended: true,
    description:
      "Panelists from research labs and industry compared building with LLMs vs. training models, and where the entry-level roles actually are.",
  },
  { id: "acm-8", title: "Intro to React Workshop", start_time: "2025-11-05T18:30:00-05:00", attended: true },
  { id: "acm-14", title: "Competitive Programming Contest", start_time: "2025-10-22T18:30:00-04:00", attended: false },
  { id: "acm-9", title: "Tech Resume Workshop", start_time: "2025-10-08T18:30:00-04:00", attended: true },
  { id: "acm-15", title: "Fall General Body Meeting", start_time: "2025-09-17T18:30:00-04:00", attended: false },
  { id: "acm-10", title: "Fall Welcome Mixer", start_time: "2025-09-03T18:30:00-04:00", attended: true },
  // Spring 2025
  { id: "acm-11", title: "Intro to Open Source", start_time: "2025-03-26T18:30:00-04:00", attended: true },
  { id: "acm-12", title: "Internship Search Panel", start_time: "2025-02-19T18:30:00-05:00", attended: true },
];

// ColorStack — community for Black & Latinx students in tech.
const COLORSTACK_CLUB_MEETINGS: Meeting[] = [
  // Spring 2026
  {
    id: "cs-1",
    title: "ColorStack Community Meetup",
    start_time: "2026-04-17T18:00:00-04:00",
    attended: true,
    description:
      "Monthly meetup to connect over food, share wins, and welcome new members into the community.",
  },
  {
    id: "cs-2",
    title: "Tech Talk: Breaking into Big Tech",
    start_time: "2026-04-03T18:00:00-04:00",
    attended: true,
    description:
      "Members who landed offers shared their timelines, the resources they used, and how they navigated the recruiting process.",
  },
  { id: "cs-3", title: "Coding Interview Prep", start_time: "2026-03-20T18:00:00-04:00", attended: true },
  { id: "cs-4", title: "Mentorship Mixer", start_time: "2026-03-06T18:00:00-05:00", attended: true },
  { id: "cs-12", title: "Resume & LinkedIn Workshop", start_time: "2026-02-20T18:00:00-05:00", attended: false },
  { id: "cs-5", title: "Family Dinner Social", start_time: "2026-02-06T18:00:00-05:00", attended: true },
  { id: "cs-6", title: "Spring Kickoff", start_time: "2026-01-23T18:00:00-05:00", attended: true },
  // Fall 2025
  {
    id: "cs-7",
    title: "Networking Night with Recruiters",
    start_time: "2025-11-21T18:00:00-05:00",
    attended: true,
    description:
      "Recruiters from partner companies met with members for resume chats and on-the-spot interview opportunities.",
  },
  { id: "cs-8", title: "Intro to Data Structures", start_time: "2025-11-07T18:00:00-05:00", attended: true },
  { id: "cs-13", title: "Internship Panel", start_time: "2025-10-24T18:00:00-04:00", attended: false },
  { id: "cs-9", title: "General Body Meeting", start_time: "2025-10-10T18:00:00-04:00", attended: true },
  { id: "cs-10", title: "Fall Welcome Social", start_time: "2025-09-12T18:00:00-04:00", attended: true },
  // Spring 2025
  { id: "cs-11", title: "Hack the Semester Kickoff", start_time: "2025-02-21T18:00:00-05:00", attended: true },
];

/** Club meetings keyed by org slug. */
const MOCK_CLUB_MEETINGS_BY_SLUG: Record<string, Meeting[]> = {
  aed: AED_CLUB_MEETINGS,
  acm: ACM_CLUB_MEETINGS,
  colorstack: COLORSTACK_CLUB_MEETINGS,
};

/**
 * Mock club + attended meetings for an org slug. Unknown slugs fall back to the
 * ACM set so the page always renders something.
 */
export function getMockMeetings(slug: string): {
  clubMeetings: Meeting[];
  attendedMeetings: Meeting[];
} {
  const clubMeetings = MOCK_CLUB_MEETINGS_BY_SLUG[slug] ?? ACM_CLUB_MEETINGS;
  return {
    clubMeetings,
    attendedMeetings: clubMeetings.filter((meeting) => meeting.attended),
  };
}
