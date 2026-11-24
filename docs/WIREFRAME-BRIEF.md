# Wireframe Brief — ACM Check-In

Input for a Claude Design canvas. This is the **inventory of screens and states**
a redesign has to cover, derived from the shipped app — not a visual spec.

Read this first, then design. The trap in this product is that the screen count
is small but the **state** count is large: most pages have four or five distinct
renders, and the empty/error ones are where the current UI is weakest.

---

## Who uses it

| Persona | Reality of use | Designs for |
|---|---|---|
| **Guest** | Standing in a room, phone in hand, wants out in <15s. May never return. | Speed. No account. Thumb-reachable. |
| **Member** | Same room, signed in. Checks in ~weekly, checks stats occasionally. | One tap to check in. |
| **Officer** | Laptop before/during a meeting. Creates meetings, watches check-ins arrive. | Density, scanning, bulk actions. |
| **Owner / Co-owner** | Officer plus roster and branding control. | Same as officer + destructive-action safety. |
| **Global admin** | Platform operator across all orgs. | Utility over polish. |

**Mobile-first for guest and member. Desktop-first for officer.** These are the
two ends of the product and they should not share a layout.

---

## Screen inventory

### Public / auth

**1. Landing (`/`)**
Pure redirector today — signed in → dashboard, else sign-in. Decide in the
redesign whether this should become a real marketing/entry page or stay a
pass-through.

**2. Sign in / Sign up (`/sign-in`, `/sign-up`)**
Clerk-hosted components. Styleable via tokens and element class overrides, not
freely composable. Design the *frame* around them: background, logo lockup,
page furniture. Note these render outside any org, so they cannot be org-branded.

**3. Onboarding (`/onboarding`)**
First-run profile capture: first name, last name, grad year. Every signed-in
user is forced here until an attendee record exists.
*States:* loading · form · saving · error.

---

### Guest & member

**4. Check-in (`/[orgSlug]/checkin`) — the most important screen in the product**

The only public app route. Optimise this above everything else. It is a
multi-step, multi-branch flow:

- **Guest path:** email → (if unknown) name + grad year → questions → submit
- **Member path:** one confirm button → questions → submit

Conditional elements, any combination of which may appear:
- **Meeting password** field (when the meeting requires one)
- **Location check** (when geo-locked — needs a permission-request state, a
  checking state, and a "you're too far away, move Xm closer" failure)
- **Custom questions** (0–N, see form types below)

*States to draw:* loading · **no active meeting** · form (each step) ·
validating · location denied · location too far · wrong password ·
already checked in · success · error.

The **no active meeting** and **success** states deserve real attention. Success
is the last thing most guests ever see, and "no active meeting" is what people
hit when they arrive early.

**5. Org home (`/[orgSlug]`)**
Org identity, attendance count, buttons to check in and view stats.
*States:* loading · loaded · org not found.

**6. My dashboard (`/dashboard`)**
List of the user's orgs. Per-org card shows attendance count and actions
(Check In, Stats, and Admin for officers).
*States:* loading · list · **no orgs yet** (currently a bare sentence — this is a
first-run moment worth designing).

**7. Stats (`/[orgSlug]/stats`)**
Personal attendance history. Membership badge with progress toward the org's
threshold (e.g. 2/3 meetings), term tabs (Fall/Spring), attended-vs-missed
toggle, paginated meeting list, and a per-meeting detail modal showing that
person's submitted answers.
*States:* loading · populated · empty term · non-member.

**8. Account settings (`/settings`)**
First name, last name, grad year. Thin — consider whether it merges into
onboarding or the user menu.

---

### Officer & owner

**9. Admin dashboard (`/[orgSlug]/admin-dashboard`)**
Sidebar shell (off-canvas drawer below `lg`) with six tabs:

| Tab | Content |
|---|---|
| **Overview** | Stat tiles, next meeting, officer roster |
| **Meetings** | Filterable table (upcoming/past/all) + row actions: Open/Close, Edit, Delete. Badges for geo-locked, officer-only, password |
| **Attendance** | Per-meeting check-in list, answers, CSV export |
| **Members** | Roster, search, role assignment |
| **Audit Log** | Chronological record of officer actions |
| **Branding** | Per-org colours and logos, with live preview |

*States per tab:* loading · populated · empty · permission-denied.

The **Meetings table** is the officer's main workspace — six columns plus three
row actions. On a laptop this is fine; below `lg` it needs a genuinely different
treatment (cards, not a squeezed table).

**10. Meeting editor (`/[orgSlug]/admin-dashboard/meetings/[meetingId]`)**
Full-page editor: scheduling, geolock (with "use current location"), officer-only
and password toggles, and the **form builder** — add, reorder, delete, and
configure questions.

Question types to support: `short_text`, `long_text`, `multiple_choice`,
`checkboxes`, `dropdown`, `scale`.

Each question card needs: type selector, label, required toggle, options editor
(for choice types), reorder handle, delete. Plus an empty state and a preview of
what the attendee will see.

This is the densest screen in the app and the one most likely to need a rethink.

**11. Developer console (`/developer`)**
Global-admin only. Organizations list, org creation, cross-org audit log.
Utility screen — low design priority.

---

## Cross-cutting

**Per-org branding.** Every screen under `/[orgSlug]` themes from the org's
stored palette (primary, background, background-secondary, accent, text) plus
crest and wordmark logos. **Design against at least two contrasting palettes.**
A layout that only works in UF orange/blue is not finished. Non-org pages
(sign-in, dashboard, settings) fall back to the default theme.

**Current visual language** — inherit or deliberately replace: dark blue/orange
gradient, animated particle background, glassmorphic cards
(`bg-white/10` + `backdrop-blur`), white text. The admin dashboard already
breaks from this with a light, dense, slate-on-white treatment. **That
inconsistency is a real problem and the redesign should resolve it** — either
one system throughout, or a deliberate public/admin split with a shared spine.

**Navigation.** `OrgNav` for org pages; sidebar for admin. There is no global
nav — moving between orgs means returning to `/dashboard`.

---

## Priorities

1. **Check-in** — highest traffic, worst current UX, most states
2. **Meeting editor / form builder** — densest, most novel interaction
3. **Admin meetings table** — officer's daily surface, weak on mobile
4. **Dashboard + stats** — frequent, currently plain
5. **Onboarding, settings, developer** — lower stakes

---

## Constraints

- **Next.js + Tailwind 4.** Design in tokens that map to CSS variables — org
  branding is injected at runtime, so hard-coded colour cannot work.
- **Clerk components** for sign-in/up are styleable, not replaceable.
- Guest check-in must **stay usable without an account** and without location
  permission (unless the meeting is geo-locked).
- Times display in **EST**; meetings are stored without timezone.
- Real meetings produce **bursts** — thirty people checking in within a minute.
  Success and error states get read at a glance, in a crowd.

---

## What to produce

Artboards for each screen above, at **mobile (390) and desktop (1440)** for
anything an officer touches; mobile-only is acceptable for pure guest flows.

Include the empty, error, and loading artboards — not just the happy path. The
current app's weakest moments are all states, not layouts: a blank meetings tab
that means "wrong filter", a spinner that never resolves, a "Club does not
exist" that actually meant a network failure.
