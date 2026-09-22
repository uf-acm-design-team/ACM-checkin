#!/usr/bin/env node
/**
 * One-off import of legacy check-in attendance (Fall 2026) into the new schema.
 *
 *     node scripts/import-legacy-attendance.mjs            # dry run, writes nothing
 *     node scripts/import-legacy-attendance.mjs --apply    # actually writes
 *
 * WHAT THIS DOES
 * --------------
 * The old system exported a flat CSV of (name, email, grad year, meeting).
 * There is no "attendance count" column anywhere in this schema -- every count
 * the app shows is derived by aggregating rows in `attendance` (see
 * resolveAndUpdateMembershipStatus in app/[orgSlug]/checkin/actions.ts, which
 * does a `count: "exact"` over that table). So "increase someone's attendance
 * count" means inserting one attendance row per CSV line; the count follows.
 *
 * Three steps, each idempotent so a partial run can simply be re-run:
 *   1. meetings   -- upserted by (org_id, title)
 *   2. attendees  -- inserted only when lower(email) is not already present
 *   3. attendance -- inserted with ignoreDuplicates against the
 *                    (meeting_id, attendee_id) unique constraint from
 *                    20260813000000_add_integrity_constraints.sql
 *
 * WHY SERVICE ROLE
 * ----------------
 * RLS (20260813000100_enable_rls_clerk.sql) gates writes on current_clerk_id().
 * A migration script has no Clerk session, so anon/authenticated would be
 * denied on every insert. service_role bypasses RLS -- which is also why this
 * file must never be imported by the Next app.
 *
 * MEMBERSHIPS ARE DELIBERATELY NOT TOUCHED
 * ----------------------------------------
 * memberships.user_id is a Clerk user id (text, per 20260518000200), not an
 * attendee uuid. Imported people have no Clerk account yet, so there is no id
 * to write. Their history attaches on first sign-in: the check-in page relinks
 * an orphaned attendee row to a Clerk user by email. That works precisely
 * because this CSV carries real @ufl.edu addresses.
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const APPLY = process.argv.includes("--apply");

const ORG_ID = "3b8a50f7-5971-40e9-b8ec-e2a96521b283"; // acm
const CSV_PATH = join(__dirname, "migration-data", "acm_attendance_fall2026.csv");
const REPORT_PATH = join(__dirname, "migration-data", "import-report.json");

// Marks every row this script creates, so imported history stays
// distinguishable from real check-ins forever -- and so a bad run can be
// found and deleted with a single WHERE clause.
const SOURCE_TAG = "legacy-import-fall2026";

/**
 * Meeting times, supplied out of band (the CSV has no timestamps).
 *
 * Both columns are timestamptz (see 20260827000000_timestamptz_meeting_times.sql),
 * so these are true instants. September 2026 is EDT = UTC-4, NOT the UTC-5 that
 * "EST" literally means -- 5pm Eastern on 9/2 is 21:00Z. Getting this wrong by
 * an hour would misorder the meeting list, which sorts on start_time.
 *
 * status:false          -- historical, must not accept live check-ins.
 * is_officer_only:false -- visible to everyone, like any past GBM.
 */
const MEETINGS = [
  {
    csvTitle: "GBM 1 Fall 2026",
    title: "GBM 1 Fall 2026",
    start_time: "2026-09-02T21:00:00Z", // 5:00pm EDT
    end_time: "2026-09-02T22:00:00Z",   // 6:00pm EDT
  },
  {
    csvTitle: "Workshop Resume LinkedIn Backup",
    title: "Workshop Resume LinkedIn Backup",
    start_time: "2026-09-03T22:00:00Z", // 6:00pm EDT
    end_time: "2026-09-03T23:00:00Z",   // 7:00pm EDT
  },
];

// CSV meetings not listed above are skipped. "Workshop ReliaQuest Recruiter
// Event" is excluded on purpose (3 rows) -- an org meeting already covers it.
const WANTED_TITLES = new Set(MEETINGS.map((m) => m.csvTitle));

/**
 * Names where splitting on the last space produces the wrong surname.
 *
 * The default rule (everything before the last space is the first name) is
 * right for 162 of the 169 people here, but wrong for compound surnames --
 * Spanish/Portuguese double surnames and "St. John". The email local-parts
 * corroborate each of these (cstjohn1@, albertoriefkohlz@, vasconcelosferrl@,
 * eholostalo@). Keyed by email because that is the only stable identifier.
 */
const NAME_OVERRIDES = {
  "cstjohn1@ufl.edu": ["Christopher", "St. John"],
  "albertoriefkohlz@ufl.edu": ["Alberto", "Riefkohl Zambrana"],
  "vasconcelosferrl@ufl.edu": ["Lourival", "Vasconcelos Ferreira"],
  "eholostalo@ufl.edu": ["Evan", "Ho Lostalo"],
  // Brigid O'Sullivan arrives as "Brigid OâSullivan" -- the export was UTF-8
  // read as Windows-1252, so the curly apostrophe (U+2019) became "â".
  // Spelled out here rather than repaired by a generic mojibake pass, because
  // one known row does not justify guessing at byte-level re-decoding.
  "brigid.osullivan@ufl.edu": ["Brigid", "O'Sullivan"],
};

/**
 * Corrections applied to attendee rows that ALREADY EXIST in the database.
 *
 * The rule for existing rows is "keep what the DB has" -- but these three are
 * demonstrably mis-entered, so they are repaired by name. All three came from
 * guest check-in (created days after the events, user_id null), where an
 * officer or the attendee typed the name at a table -- which is where typos
 * come from. The CSV spelling is the better record in each case:
 *
 *   Rishi pinapaka   -> Rishi Pinapaka     (lowercase surname)
 *   mahadev sagi     -> Mahadev Sagi       (fully lowercase)
 *   Rudr Tuljapurkar -> Rudra Tuljapurkar  ("Rudr" is a truncation)
 *
 * Deliberately NOT corrected, and left as the database has them:
 *   - grad_year, on all four rows where the two sources disagree (Ken Liu,
 *     Jack Lenhart, Rishi Pinapaka, Leo Shee). Neither source can be verified
 *     from the data -- three are off-by-one and one is a four-year gap -- and
 *     a wrong guess overwrites a right value. Users can correct it themselves.
 *   - "Ken Liu" and "Timothy Choy", where the DB is already correct and the
 *     CSV is the lowercase one.
 *   - "Joseph Pope" vs CSV "Joey Pope" -- a nickname, not an error.
 */
const EXISTING_ROW_FIXES = {
  "r.pinapaka@ufl.edu": { first_name: "Rishi", last_name: "Pinapaka" },
  "mahadev.sagi@ufl.edu": { first_name: "Mahadev", last_name: "Sagi" },
  "r.tuljapurkar@ufl.edu": { first_name: "Rudra", last_name: "Tuljapurkar" },
};

function loadEnv() {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

/**
 * Minimal CSV parse. Safe here only because this specific file has no quoted
 * fields, embedded commas or newlines -- verified before writing this. Do not
 * reuse for an arbitrary export.
 */
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = {
    name: header.indexOf("Full Name"),
    email: header.indexOf("Email"),
    grad: header.indexOf("Graduation Year"),
    meeting: header.indexOf("Meeting"),
  };
  for (const [key, value] of Object.entries(idx)) {
    if (value === -1) throw new Error(`CSV is missing the "${key}" column`);
  }
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",");
    return {
      row: i + 2, // 1-based, +1 for the header -- matches what an editor shows
      name: cells[idx.name].trim(),
      email: cells[idx.email].trim().toLowerCase(),
      gradYear: cells[idx.grad].trim(),
      meeting: cells[idx.meeting].trim(),
    };
  });
}

/**
 * Split a display name into the schema's separate NOT NULL first/last columns.
 * Overrides win; otherwise everything before the last space is the first name.
 * Single-token names put the token in first_name and a placeholder in
 * last_name, since the column cannot be null or empty.
 */
function splitName(fullName, email) {
  const override = NAME_OVERRIDES[email];
  if (override) return { first_name: override[0], last_name: override[1] };

  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "Unknown", last_name: "-" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "-" };
  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts[parts.length - 1],
  };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
    );
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n${APPLY ? "APPLY" : "DRY RUN"} -- target ${url}`);
  console.log(`org ${ORG_ID}\n`);

  // --- Guard: the org must exist. attendance.org_id and meetings.org_id are
  // both NOT NULL FKs, so a wrong id would fail late and half-imported.
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .select("id, slug, name")
    .eq("id", ORG_ID)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) throw new Error(`No organization with id ${ORG_ID}`);
  console.log(`organization: ${org.name} (${org.slug})`);

  // --- Parse and filter ----------------------------------------------------
  const allRows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const rows = allRows.filter((r) => WANTED_TITLES.has(r.meeting));
  const skipped = allRows.length - rows.length;
  console.log(
    `csv: ${allRows.length} rows, ${rows.length} in scope, ${skipped} skipped (excluded meetings)`
  );

  // People are unique by email. Where the same email appears at several
  // meetings, the first occurrence supplies the profile -- verified to be
  // consistent across this file, so the choice does not matter here.
  const people = new Map();
  for (const r of rows) {
    if (!people.has(r.email)) {
      people.set(r.email, { ...splitName(r.name, r.email), email: r.email, grad_year: r.gradYear });
    }
  }
  console.log(`distinct people: ${people.size}\n`);

  // --- 1. Meetings ---------------------------------------------------------
  const { data: existingMeetings, error: mErr } = await sb
    .from("meetings")
    .select("id, title")
    .eq("org_id", ORG_ID);
  if (mErr) throw mErr;
  const meetingIdByTitle = new Map(existingMeetings.map((m) => [m.title, m.id]));

  const toCreate = MEETINGS.filter((m) => !meetingIdByTitle.has(m.title));
  console.log(
    `meetings: ${MEETINGS.length - toCreate.length} already exist, ${toCreate.length} to create`
  );
  for (const m of toCreate) console.log(`   + ${m.title}  (${m.start_time})`);

  if (APPLY && toCreate.length > 0) {
    const { data: inserted, error } = await sb
      .from("meetings")
      .insert(
        toCreate.map((m) => ({
          org_id: ORG_ID,
          title: m.title,
          start_time: m.start_time,
          end_time: m.end_time,
          status: false,
          is_officer_only: false,
        }))
      )
      .select("id, title");
    if (error) throw error;
    for (const m of inserted) meetingIdByTitle.set(m.title, m.id);
  }

  // --- 2. Attendees --------------------------------------------------------
  // Existing rows are never modified. The DB is the newer system and may hold
  // details a user corrected themselves, so it outranks a legacy export.
  // Differences are reported, not applied.
  const emails = [...people.keys()];
  const existingAttendees = [];
  for (let i = 0; i < emails.length; i += 100) {
    const { data, error } = await sb
      .from("attendees")
      .select("id, email, first_name, last_name, grad_year")
      .in("email", emails.slice(i, i + 100));
    if (error) throw error;
    existingAttendees.push(...data);
  }
  const attendeeIdByEmail = new Map(
    existingAttendees.map((a) => [a.email.toLowerCase(), a.id])
  );

  const conflicts = [];
  const fixes = [];
  for (const a of existingAttendees) {
    const email = a.email.toLowerCase();
    const csv = people.get(email);
    if (!csv) continue;
    const dbName = `${a.first_name} ${a.last_name}`.trim();
    const csvName = `${csv.first_name} ${csv.last_name}`.trim();

    const fix = EXISTING_ROW_FIXES[email];
    if (fix && (a.first_name !== fix.first_name || a.last_name !== fix.last_name)) {
      fixes.push({
        id: a.id,
        email: a.email,
        from: dbName,
        to: `${fix.first_name} ${fix.last_name}`,
        ...fix,
      });
      continue; // repaired below, so not also reported as an unresolved conflict
    }

    if (dbName !== csvName || String(a.grad_year) !== csv.grad_year) {
      conflicts.push({
        email: a.email,
        db: { name: dbName, grad_year: a.grad_year },
        csv: { name: csvName, grad_year: csv.grad_year },
      });
    }
  }

  const newPeople = emails.filter((e) => !attendeeIdByEmail.has(e));
  console.log(
    `\nattendees: ${attendeeIdByEmail.size} already exist, ${newPeople.length} to create`
  );
  if (fixes.length > 0) {
    console.log(`   ${fixes.length} existing rows REPAIRED (mis-entered names):`);
    for (const f of fixes) {
      console.log(`     ${f.email}  "${f.from}" -> "${f.to}"`);
    }
  }
  if (conflicts.length > 0) {
    console.log(
      `   ${conflicts.length} existing rows differ from the CSV -- KEEPING DB VALUES:`
    );
    for (const c of conflicts) {
      console.log(
        `     ${c.email}\n       db  "${c.db.name}" / ${c.db.grad_year}\n       csv "${c.csv.name}" / ${c.csv.grad_year}`
      );
    }
  }

  if (APPLY && fixes.length > 0) {
    for (const f of fixes) {
      const { error } = await sb
        .from("attendees")
        .update({ first_name: f.first_name, last_name: f.last_name })
        .eq("id", f.id);
      if (error) throw error;
    }
  }

  if (APPLY && newPeople.length > 0) {
    const payload = newPeople.map((e) => people.get(e));
    for (let i = 0; i < payload.length; i += 100) {
      const { data, error } = await sb
        .from("attendees")
        .insert(payload.slice(i, i + 100))
        .select("id, email");
      if (error) throw error;
      for (const a of data) attendeeIdByEmail.set(a.email.toLowerCase(), a.id);
    }
  }

  // --- 3. Attendance -------------------------------------------------------
  // checked_in_at is set to the meeting's start time rather than left to
  // default to now(), so historical check-ins do not all appear to have
  // happened at import time.
  const startByTitle = new Map(MEETINGS.map((m) => [m.title, m.start_time]));

  let attendanceRows = [];
  const orphans = [];
  for (const r of rows) {
    const meetingId = meetingIdByTitle.get(r.meeting);
    const attendeeId = attendeeIdByEmail.get(r.email);
    if (!meetingId || !attendeeId) {
      // Expected on a dry run (nothing was created yet); a real problem if it
      // happens under --apply.
      orphans.push({ row: r.row, email: r.email, meeting: r.meeting });
      continue;
    }
    attendanceRows.push({
      org_id: ORG_ID,
      meeting_id: meetingId,
      attendee_id: attendeeId,
      checked_in_at: startByTitle.get(r.meeting),
      source: SOURCE_TAG,
    });
  }

  console.log(`\nattendance: ${rows.length} rows in scope`);
  if (!APPLY) {
    console.log(
      `   (dry run: ${orphans.length} rows reference records that do not exist yet -- they are created by --apply)`
    );
  }

  let insertedCount = 0;
  if (APPLY) {
    // ignoreDuplicates leans on attendance_meeting_attendee_key, so re-running
    // this script inserts nothing the second time instead of erroring.
    for (let i = 0; i < attendanceRows.length; i += 100) {
      const { data, error } = await sb
        .from("attendance")
        .upsert(attendanceRows.slice(i, i + 100), {
          onConflict: "meeting_id,attendee_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw error;
      insertedCount += data.length;
    }
    console.log(
      `   inserted ${insertedCount}, skipped ${attendanceRows.length - insertedCount} already present`
    );
    if (orphans.length > 0) {
      console.log(`   WARNING: ${orphans.length} rows could not be resolved`);
    }
  }

  // --- Report --------------------------------------------------------------
  const report = {
    ranAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    org: { id: ORG_ID, slug: org.slug },
    csv: { total: allRows.length, inScope: rows.length, skipped },
    people: { distinct: people.size, alreadyExisted: emails.length - newPeople.length, created: newPeople.length },
    meetings: MEETINGS.map((m) => ({ title: m.title, id: meetingIdByTitle.get(m.title) ?? null })),
    attendance: { inScope: rows.length, inserted: APPLY ? insertedCount : null },
    namesRepaired: fixes.map(({ email, from, to }) => ({ email, from, to })),
    conflictsKeptFromDb: conflicts,
    unresolvedRows: APPLY ? orphans : [],
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nreport written to ${REPORT_PATH}`);

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply to commit.\n");
  } else {
    console.log("\nDone.\n");
  }
}

main().catch((err) => {
  console.error("\nImport failed:", err.message ?? err);
  process.exit(1);
});
