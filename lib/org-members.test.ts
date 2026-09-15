import { describe, it, expect } from "vitest";
import { buildOrgMemberRoster } from "./org-members";

// "acm" has a configured threshold of 3 (see lib/membership.ts). "nope" has none.

describe("buildOrgMemberRoster", () => {
  it("excludes an attendee with zero attendance and no role", () => {
    const attendees = [
      { id: "a1", user_id: "user_1", first_name: "Ada", last_name: "L", email: "ada@x.com", grad_year: "2027" },
    ];
    const roster = buildOrgMemberRoster(attendees, {}, [], "acm");
    expect(roster).toHaveLength(0);
  });

  it("shows a guest below threshold as pending, unauthenticated", () => {
    const attendees = [
      { id: "a1", user_id: null, first_name: "Guest", last_name: "One", email: "g1@x.com", grad_year: "2028" },
    ];
    const roster = buildOrgMemberRoster(attendees, { a1: 1 }, [], "acm");
    expect(roster).toEqual([
      expect.objectContaining({ attendee_id: "a1", authenticated: false, role: null, status: "pending" }),
    ]);
  });

  it("shows a guest at/above threshold as active, still unauthenticated", () => {
    const attendees = [
      { id: "a1", user_id: null, first_name: "Guest", last_name: "Two", email: "g2@x.com", grad_year: "2028" },
    ];
    const roster = buildOrgMemberRoster(attendees, { a1: 3 }, [], "acm");
    expect(roster).toEqual([
      expect.objectContaining({ attendee_id: "a1", authenticated: false, status: "active" }),
    ]);
  });

  it("authenticated attendee with no memberships row is pending/active purely by attendance", () => {
    const attendees = [
      { id: "a1", user_id: "user_1", first_name: "Ada", last_name: "L", email: "ada@x.com", grad_year: "2027" },
    ];
    const pending = buildOrgMemberRoster(attendees, { a1: 1 }, [], "acm");
    expect(pending[0]).toEqual(
      expect.objectContaining({ authenticated: true, role: null, status: "pending" }),
    );

    const active = buildOrgMemberRoster(attendees, { a1: 3 }, [], "acm");
    expect(active[0]).toEqual(
      expect.objectContaining({ authenticated: true, role: null, status: "active" }),
    );
  });

  it("a zero-attendance role-holder (e.g. an officer) still appears via the union with memberships", () => {
    const attendees = [
      { id: "a1", user_id: "user_officer", first_name: "Oscar", last_name: "F", email: "oscar@x.com", grad_year: "2026" },
    ];
    const memberships = [{ user_id: "user_officer", role: "officer", status: "active" }];
    const roster = buildOrgMemberRoster(attendees, {}, memberships, "acm");
    expect(roster).toEqual([
      expect.objectContaining({
        user_id: "user_officer", authenticated: true, role: "officer", status: "active", attendance_count: 0,
      }),
    ]);
  });

  it("a memberships row with no matching attendees row falls back to an orphan placeholder", () => {
    const memberships = [{ user_id: "user_ghost", role: "owner", status: "active" }];
    const roster = buildOrgMemberRoster([], {}, memberships, "acm");
    expect(roster).toEqual([
      expect.objectContaining({
        attendee_id: "orphan:user_ghost", user_id: "user_ghost", authenticated: true,
        role: "owner", status: "active", first_name: "Unknown",
      }),
    ]);
  });

  it("orgs without a configured threshold never auto-promote pure attendance to active", () => {
    const attendees = [
      { id: "a1", user_id: null, first_name: "Guest", last_name: "Three", email: "g3@x.com", grad_year: "2028" },
    ];
    const roster = buildOrgMemberRoster(attendees, { a1: 99 }, [], "nope");
    expect(roster).toEqual([
      expect.objectContaining({ status: "pending" }),
    ]);
  });

  it("sorts officer -> signed in -> everyone else, alphabetically within each tier", () => {
    const attendees = [
      { id: "a-guest-z", user_id: null, first_name: "Zed", last_name: "Guest", email: "z@x.com", grad_year: "2028" },
      { id: "a-guest-a", user_id: null, first_name: "Amy", last_name: "Guest", email: "a@x.com", grad_year: "2028" },
      { id: "a-signed-z", user_id: "user_z", first_name: "Zed", last_name: "Signed", email: "zs@x.com", grad_year: "2027" },
      { id: "a-signed-a", user_id: "user_a", first_name: "Amy", last_name: "Signed", email: "as@x.com", grad_year: "2027" },
      { id: "a-officer-z", user_id: "user_oz", first_name: "Zed", last_name: "Officer", email: "zo@x.com", grad_year: "2026" },
      { id: "a-officer-a", user_id: "user_oa", first_name: "Amy", last_name: "Officer", email: "ao@x.com", grad_year: "2026" },
      // An explicitly-invited plain 'member' role belongs in the "signed in"
      // tier, not the "officer" tier.
      { id: "a-plainmember", user_id: "user_pm", first_name: "Pat", last_name: "Plain", email: "pm@x.com", grad_year: "2025" },
    ];
    const memberships = [
      { user_id: "user_oz", role: "officer", status: "active" },
      { user_id: "user_oa", role: "owner", status: "active" },
      { user_id: "user_pm", role: "member", status: "active" },
    ];
    const counts = {
      "a-guest-z": 1, "a-guest-a": 1, "a-signed-z": 1, "a-signed-a": 1,
      "a-officer-z": 0, "a-officer-a": 0, "a-plainmember": 1,
    };
    const roster = buildOrgMemberRoster(attendees, counts, memberships, "acm");
    expect(roster.map((m) => m.attendee_id)).toEqual([
      "a-officer-a", "a-officer-z", // officers, alphabetical
      "a-plainmember", "a-signed-a", "a-signed-z", // signed in, alphabetical
      "a-guest-a", "a-guest-z", // guests, alphabetical
    ]);
  });

  it("an explicit active memberships row keeps someone active regardless of a later attendance dip", () => {
    const attendees = [
      { id: "a1", user_id: "user_1", first_name: "Ada", last_name: "L", email: "ada@x.com", grad_year: "2027" },
    ];
    const memberships = [{ user_id: "user_1", role: "member", status: "active" }];
    const roster = buildOrgMemberRoster(attendees, { a1: 0 }, memberships, "acm");
    expect(roster).toEqual([
      expect.objectContaining({ status: "active", attendance_count: 0 }),
    ]);
  });
});
