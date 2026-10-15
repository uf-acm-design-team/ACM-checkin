# Sprint 3 — Officer Analytics Implementation Ticket Drafts

**Related Jira Ticket:** ADTCIA-20  
**Status:** Proposed — Pending Tech Lead Review

These tickets outline the work needed to implement the officer analytics dashboard in Sprint 3. They are proposals and have not yet been created as separate Jira work items.

## Ticket 1: Implement Attendance per Meeting Chart

**Description:** Build a line chart showing attendance totals across meetings.

**Scope:**
- Create a reusable Attendance per Meeting chart component.
- Use the `ChartCard` wrapper from ADTCIA-21.
- Retrieve attendance data through `get_org_attendance_by_meeting`.
- Display meeting dates on the X-axis and attendance counts on the Y-axis.
- Support organization theme colors and date-range filtering.
- Handle normal, loading, empty, and error states.

**Done When:**
- The chart displays attendance totals from the database.
- Date-range filtering works correctly.
- All four states work.
- The chart follows the approved design.

## Ticket 2: Implement New vs. Returning Attendees Chart

**Description:** Build a stacked bar chart comparing first-time and returning attendees.

**Scope:**
- Create a separate New vs. Returning chart component.
- Use the `ChartCard` wrapper.
- Retrieve data through `get_org_retention_by_meeting`.
- Display first-time and returning attendee counts for each meeting.
- Use the organization accent color for the primary series and neutral colors for the secondary series.
- Support date-range filtering and all four chart states.
- Coordinate with the database developer about returning meeting IDs and dates.

**Done When:**
- The chart correctly displays first-time and returning counts.
- The database function provides the required data.
- All four states work.
- The chart follows the approved design.

## Ticket 3: Implement Members vs. Guests Chart

**Description:** Build a stacked bar chart comparing member and guest attendance.

**Scope:**
- Create a separate Members vs. Guests chart component.
- Use the `ChartCard` wrapper.
- Retrieve data through `get_org_attendance_by_meeting`.
- Display member and guest counts for each meeting.
- Use the organization accent color for members and neutral colors for guests.
- Support date-range filtering and all four chart states.
- Confirm the membership definition with the tech lead.

**Done When:**
- The chart correctly displays member and guest attendance.
- Date-range filtering works.
- All four states work.
- The chart follows the approved design.

## Ticket 4: Integrate Analytics Charts into Officer Dashboard

**Description:** Add the approved analytics dashboard layout to the officer admin console.

**Scope:**
- Add an Analytics tab or approved alternative location.
- Integrate all three chart components.
- Add a shared date-range selector.
- Ensure charts use the selected organization's data.
- Preserve the existing Overview, Meetings, and Attendance functionality.
- Follow the existing desktop-first design system.
- Test with different organization accent colors.

**Done When:**
- Officers can access the analytics dashboard.
- All three charts display correctly.
- The date-range selector updates the charts.
- Existing dashboard functionality remains unaffected.
- The layout is reviewed and approved.

## Dependencies and Review Notes

- ADTCIA-20 design approval is required before implementation.
- ADTCIA-21 provides the reusable `ChartCard` wrapper.
- Attendance and retention PostgreSQL functions must be available and verified.
- The team must confirm officer-only meeting rules, guest handling, and membership definitions.
- These tickets should be reviewed by the web tech lead before being added to the Sprint 3 backlog.