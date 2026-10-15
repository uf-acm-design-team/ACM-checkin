# Officer Analytics Dashboard — Design Proposal

**Jira Ticket:** ADTCIA-20  
**Status:** Draft — Pending Tech Lead Review

## 1. Overview

The goal of this dashboard is to help club officers understand meeting attendance, member engagement, and participation trends.

The dashboard will be designed primarily for desktop use and will include three proposed charts:

1. Attendance per Meeting
2. New vs. Returning Attendees
3. Members vs. Guests

Each chart will use the reusable `ChartCard` component developed in ADTCIA-21 and will support normal, loading, empty, and error states.

The dashboard design will follow the existing ACM Check-In design system and use organization-specific theme colors.

## 2. Dashboard Location

The proposed design adds a separate **Analytics** tab to the existing officer admin dashboard.

The Overview tab will continue displaying quick statistics, upcoming meetings, and officer information.

The Analytics tab will contain:

- A date range filter at the top.
- A large attendance-per-meeting line chart.
- A new vs. returning attendees stacked bar chart.
- A members vs. guests stacked bar chart.

The attendance-per-meeting chart will appear at the top because it provides an overall view of participation trends.

The other two charts will appear side by side underneath it, allowing officers to compare attendance patterns.

This layout is intended for desktop use and will follow the existing ACM Check-In design system.

## 3. Chart Specifications

### Chart 1: Attendance per Meeting

**Chart Type:** Line chart

**Officer Question:** Is meeting attendance increasing or decreasing over time?

**Description:**

Displays the total number of attendees at each meeting. This helps officers identify attendance trends and understand which meetings attract the most participation.

**Data Required:**

- Organization ID
- Meeting ID and title
- Meeting date
- Total attendance count
- Selected date range

**Database Function:** `get_org_attendance_by_meeting`

**Display:**

- X-axis: Meeting date
- Y-axis: Total attendees
- One line showing attendance over time

**Expected Database Inputs:**

- `p_org_id`: Organization ID
- `p_start_time`: Start of selected date range
- `p_end_time`: End of selected date range

**Expected Database Outputs:**

- `meeting_id`
- `title`
- `start_time`
- `total`
- `members`
- `guests`

### Chart 2: New vs. Returning Attendees

**Chart Type:** Stacked bar chart

**Officer Question:** How many attendees are new versus returning at each meeting?

**Description:**

Compares first-time attendees with returning attendees at each meeting. This helps officers understand participation patterns and whether their meetings attract both new and returning participants.

**Data Required:**

- Organization ID
- Meeting title and date
- First-time attendee count
- Returning attendee count
- Selected date range

**Database Function:** `get_org_retention_by_meeting`

**Display:**

- X-axis: Meeting
- Y-axis: Number of attendees
- Two categories: New and Returning

**Expected Database Inputs:**

- `p_org_id`: Organization ID
- `p_from`: Start of selected date range
- `p_to`: End of selected date range

**Current Database Outputs:**

- `meeting_title`
- `first_time`
- `returning`
- `total`

**Note:** The current function does not return a meeting ID or date. Adding these fields should be discussed with the database developer so meetings can be identified and ordered correctly.

The definition of a returning attendee and the handling of guest attendance should also be confirmed before implementation.

### Chart 3: Members vs. Guests

**Chart Type:** Stacked bar chart

**Officer Question:** How much attendance comes from members versus guests?

**Description:**

Compares member and guest attendance at each meeting. This helps officers understand participation from existing club members and other attendees.

**Data Required:**

- Organization ID
- Meeting title and date
- Member attendance count
- Guest attendance count
- Selected date range

**Database Function:** `get_org_attendance_by_meeting`

**Display:**

- X-axis: Meeting
- Y-axis: Number of attendees
- Two categories: Members and Guests

**Expected Database Inputs:**

- `p_org_id`: Organization ID
- `p_start_time`: Start of selected date range
- `p_end_time`: End of selected date range

**Expected Database Outputs:**

- `meeting_id`
- `title`
- `start_time`
- `members`
- `guests`
- `total`

**Note:** The current database function distinguishes members and guests based on whether `attendee_id` is present.

The team should confirm whether this correctly represents club membership or whether membership records should be used instead.

## 4. Proposed Chart Filters

The Analytics tab will include a date range selector that applies to all three charts.

**Proposed Default:** Last 30 days

**Date Range Options:**

- Last 30 days
- Last 90 days
- Custom date range

### Officer-Only Meetings

The proposed design includes officer-only meetings by default.

The team should confirm whether these meetings should be included in general attendance analytics or excluded from certain charts.

### Guest Attendance

Guests will be included in total attendance and displayed separately in the Members vs. Guests chart.

The team should confirm how guests should be handled in the New vs. Returning Attendees chart.

### Filter Behavior

- Changing the date range updates all three charts.
- Each chart uses the same selected date range.
- Charts display an empty state when no relevant data exists.
- Date filtering and attendance calculations will be handled by PostgreSQL functions.

These filtering decisions are proposals and require tech lead approval before implementation.

## 5. Chart States

Each chart will support four states using the reusable `ChartCard` component from ADTCIA-21.

### Normal State

- Displays the chart with attendance data.
- Shows the chart title and description.
- Uses the organization's accent color for the primary data series.
- Uses neutral theme colors for additional series.
- Displays data corresponding to the selected date range.

### Loading State

- Displays a `Skeleton` placeholder while data is loading.
- Keeps the chart title and layout visible.
- Prevents the dashboard from appearing broken while waiting for data.

### Empty State

- Displays "No data available" when no relevant chart data exists for the selected date range.
- Explains that there is no chart data to display yet.
- Uses the existing `EmptyState` component.

### Error State

- Displays "Chart unavailable" if attendance data cannot be retrieved.
- Shows a helpful error message.
- Uses the existing `Notice` component.

### State Behavior

Each chart will manage its own state independently.

For example, if the attendance-per-meeting chart loads successfully but the retention chart encounters an error, the working chart should remain visible.

This prevents one failed request from making the entire dashboard unavailable.

## 6. Design Requirements

The dashboard will follow these design constraints:

- Desktop-first layout for club officers.
- Reuse the existing `ChartCard` component.
- Use the organization's accent color for the primary data series.
- Use neutral theme colors for additional series.
- Avoid hardcoded hex colors or chart-specific palettes.
- Keep each chart as a separate component.
- Use PostgreSQL functions for attendance calculations.
- Keep calculations out of Next.js so mobile can reuse the database functions.
- Follow the existing ACM Check-In design system.
- Support normal, loading, empty, and error states for every chart.

The design should work with different organization themes, including the default purple accent and UF orange accent.

## 7. Items Requiring Tech Lead Review

Before implementation, the following decisions need confirmation:

1. Whether the charts should appear in a separate Analytics tab or within the existing Overview tab.
2. Whether the proposed three charts are the best choices for the first version.
3. Whether officer-only meetings should be included in attendance calculations.
4. Whether guest attendance should count toward new and returning attendee statistics.
5. Whether the current database definition of members and guests matches the intended membership definition.
6. Whether the date range options should be 30 days, 90 days, and custom.
7. Whether the retention database function should return meeting IDs and dates.

## 8. Next Steps

After the design is reviewed and approved:

1. Finalize the dashboard layout and chart specifications.
2. Confirm the PostgreSQL function inputs and outputs with the database developers.
3. Create Sprint 3 implementation tickets for each chart.
4. Implement the charts using the reusable `ChartCard` component.
5. Connect the charts to the PostgreSQL functions.
6. Test the charts with real attendance data and different organization themes.

**Current Status:** Design proposal and visual mockups completed. Database specifications documented. Sprint 3 implementation tickets and tech lead approval are pending.

## 9. Database Function Specifications

Each chart will be implemented as a separate component in Sprint 3. Attendance calculations will be handled by PostgreSQL functions rather than Next.js.

### Chart 1: Attendance per Meeting

**PostgreSQL Function:** `get_org_attendance_by_meeting`

**Inputs:** Organization ID (`p_org_id`), start date (`p_start_time`), and end date (`p_end_time`).

**Outputs:** Meeting ID, meeting title, meeting start time, total attendance count, member attendance count, and guest attendance count.

**Purpose:** Provides attendance totals for each meeting within the selected date range.

### Chart 2: New vs. Returning Attendees

**PostgreSQL Function:** `get_org_retention_by_meeting`

**Inputs:** Organization ID (`p_org_id`), start date (`p_from`), and end date (`p_to`).

**Outputs:** Meeting title, first-time attendee count, returning attendee count, and total identified attendee count.

**Purpose:** Compares first-time and returning attendees at each meeting to help officers understand participation patterns.

**Note:** The current function does not return a meeting ID or date, so those may need to be added if the chart requires them.

### Chart 3: Members vs. Guests

**PostgreSQL Function:** `get_org_attendance_by_meeting`

**Inputs:** Organization ID (`p_org_id`), start date (`p_start_time`), and end date (`p_end_time`).

**Outputs:** Meeting ID, meeting title, meeting start time, member attendance count, and guest attendance count.

**Purpose:** Compares member and guest participation at each meeting.

### Database Handoff Notes

- The attendance and retention functions are being developed on teammates' feature branches and may change before merging.
- Each chart will have its own frontend component and database query.
- Charts 1 and 3 can reuse the same PostgreSQL function with different visualizations.
- Date-range filtering will be passed into the database functions.
- Officer-only meeting inclusion and guest-counting rules require confirmation from the tech lead.
- Function authorization and access controls should be verified before Sprint 3 implementation.