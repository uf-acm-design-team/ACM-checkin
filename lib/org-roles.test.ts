import { describe, it, expect } from "vitest";
import {
  ROLE_LEVEL,
  ROLE_ORDER,
  appointmentCeiling,
  callerLevel,
  canRemove,
  demoteTarget,
  promoteTarget,
  roleBadgeLabel,
} from "./org-roles";

// These mirror the SQL permission matrix. Each case here was also asserted
// directly against Postgres via the RPCs while building the migration -- this
// file guards against the client drifting away from that.

const ADMIN = true;
const NOT_ADMIN = false;

// What the caller may GRANT, per role.
const ceiling = (role: string | null, admin = NOT_ADMIN) =>
  appointmentCeiling(role, admin);

describe("appointmentCeiling", () => {
  it("lets a global admin appoint up to co-owner", () => {
    expect(ceiling(null, ADMIN)).toBe(ROLE_LEVEL["co-owner"]);
  });

  it("never lets anyone appoint an owner directly", () => {
    // Ownership moves only via transfer_org_ownership.
    for (const role of ["owner", "co-owner", "officer", "member", null]) {
      for (const admin of [ADMIN, NOT_ADMIN]) {
        expect(ceiling(role, admin)).toBeLessThan(ROLE_LEVEL.owner);
      }
    }
  });

  it("lets an owner appoint officers but not co-owners", () => {
    expect(ceiling("owner")).toBe(ROLE_LEVEL.officer);
    expect(ceiling("owner")).toBeLessThan(ROLE_LEVEL["co-owner"]);
  });

  it("stops officers and co-owners at plain members", () => {
    expect(ceiling("officer")).toBe(ROLE_LEVEL.member);
    expect(ceiling("co-owner")).toBe(ROLE_LEVEL.member);
  });

  it("gives a plain member and a non-member no appointment power", () => {
    expect(ceiling("member")).toBe(-1);
    expect(ceiling(null)).toBe(-1);
  });

  it("gives an admin who is only an officer full admin appointment power", () => {
    // The dual-role case: holding a club role never reduces platform authority.
    expect(ceiling("officer", ADMIN)).toBe(ROLE_LEVEL["co-owner"]);
    expect(ceiling("member", ADMIN)).toBe(ROLE_LEVEL["co-owner"]);
  });
});

describe("promoteTarget (appointment)", () => {
  it("blocks an officer from promoting a member to officer", () => {
    expect(promoteTarget("member", ceiling("officer"))).toBeNull();
  });

  it("blocks a co-owner from promoting to officer", () => {
    expect(promoteTarget("member", ceiling("co-owner"))).toBeNull();
  });

  it("lets an owner promote a member to officer", () => {
    expect(promoteTarget("member", ceiling("owner"))).toBe("officer");
  });

  it("blocks an owner from minting a co-owner", () => {
    expect(promoteTarget("officer", ceiling("owner"))).toBeNull();
  });

  it("lets a global admin appoint both tiers", () => {
    expect(promoteTarget("member", ceiling(null, ADMIN))).toBe("officer");
    expect(promoteTarget("officer", ceiling(null, ADMIN))).toBe("co-owner");
  });

  it("offers nothing above co-owner", () => {
    expect(promoteTarget("co-owner", ceiling(null, ADMIN))).toBeNull();
    expect(promoteTarget("owner", ceiling(null, ADMIN))).toBeNull();
  });
});

describe("demoteTarget (unchanged by the appointment restriction)", () => {
  const level = (role: string | null, admin = NOT_ADMIN) =>
    callerLevel(role, admin);

  it("still blocks officers from demoting", () => {
    expect(demoteTarget("member", level("officer"), NOT_ADMIN)).toBeNull();
    expect(demoteTarget("co-owner", level("officer"), NOT_ADMIN)).toBeNull();
  });

  it("still lets a co-owner demote officers and co-owner peers", () => {
    expect(demoteTarget("officer", level("co-owner"), NOT_ADMIN)).toBe("member");
    expect(demoteTarget("co-owner", level("co-owner"), NOT_ADMIN)).toBe("officer");
  });

  it("keeps demoting an owner admin-only", () => {
    expect(demoteTarget("owner", level("co-owner"), NOT_ADMIN)).toBeNull();
    expect(demoteTarget("owner", level("owner"), NOT_ADMIN)).toBeNull();
    expect(demoteTarget("owner", level(null, ADMIN), ADMIN)).toBe("co-owner");
  });

  it("lets an owner demote without being able to appoint the same tier", () => {
    // The asymmetry the migration is built around: stripping authority stays
    // local, granting it does not.
    expect(demoteTarget("co-owner", level("owner"), NOT_ADMIN)).toBe("officer");
    expect(promoteTarget("officer", ceiling("owner"))).toBeNull();
  });
});

describe("canRemove (unchanged)", () => {
  const level = (role: string | null, admin = NOT_ADMIN) =>
    callerLevel(role, admin);

  it("lets an officer remove members only", () => {
    expect(canRemove("member", level("officer"), NOT_ADMIN)).toBe(true);
    expect(canRemove("officer", level("officer"), NOT_ADMIN)).toBe(false);
  });

  it("lets a co-owner remove officers and co-owner peers", () => {
    expect(canRemove("officer", level("co-owner"), NOT_ADMIN)).toBe(true);
    expect(canRemove("co-owner", level("co-owner"), NOT_ADMIN)).toBe(true);
  });

  it("keeps removing an owner admin-only", () => {
    expect(canRemove("owner", level("co-owner"), NOT_ADMIN)).toBe(false);
    expect(canRemove("owner", level(null, ADMIN), ADMIN)).toBe(true);
  });
});

describe("invitable roles follow the ceiling", () => {
  const invitable = (role: string | null, admin = NOT_ADMIN) =>
    ROLE_ORDER.filter((r) => ROLE_LEVEL[r] <= appointmentCeiling(role, admin));

  it("officer sees member only", () => {
    expect(invitable("officer")).toEqual(["member"]);
  });

  it("co-owner sees member only", () => {
    expect(invitable("co-owner")).toEqual(["member"]);
  });

  it("owner sees member and officer", () => {
    expect(invitable("owner")).toEqual(["member", "officer"]);
  });

  it("global admin sees all three assignable roles", () => {
    expect(invitable(null, ADMIN)).toEqual(["member", "officer", "co-owner"]);
  });

  it("a plain member sees nothing", () => {
    expect(invitable("member")).toEqual([]);
  });
});

describe("roleBadgeLabel (dual role display)", () => {
  it("shows the real club role for an admin who holds one", () => {
    expect(roleBadgeLabel("officer", ADMIN)).toBe("Officer · Global admin");
    expect(roleBadgeLabel("co-owner", ADMIN)).toBe("Co-owner · Global admin");
  });

  it("shows just Global admin when they hold no club role", () => {
    // The dashboard stores the sentinel "admin" when there is no membership row.
    expect(roleBadgeLabel("admin", ADMIN)).toBe("Global admin");
    expect(roleBadgeLabel(null, ADMIN)).toBe("Global admin");
  });

  it("shows the plain club role for a non-admin", () => {
    expect(roleBadgeLabel("owner", NOT_ADMIN)).toBe("Owner");
    expect(roleBadgeLabel("co-owner", NOT_ADMIN)).toBe("Co-owner");
  });

  it("renders nothing for an ordinary member with no admin flag", () => {
    expect(roleBadgeLabel(null, NOT_ADMIN)).toBeNull();
  });
});
