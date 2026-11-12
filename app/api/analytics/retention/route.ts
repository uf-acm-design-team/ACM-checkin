import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getOrgRetention } from "@/lib/analytics-data";

// Data for the New vs. Returning chart. A route rather than a direct browser
// RPC because getOrgRetention runs on the Clerk server client; the database
// function itself enforces is_org_officer(), so this route only has to pass
// the caller's identity through and translate the failure modes.
export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "You must be signed in to view analytics." },
      { status: 401 },
    );
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("orgId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!orgId || !start || !end) {
    return NextResponse.json(
      { error: "Missing organization or date range." },
      { status: 400 },
    );
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  try {
    const data = await getOrgRetention(
      orgId,
      startDate.toISOString(),
      endDate.toISOString(),
    );

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    // get_org_retention_by_meeting raises 'Unauthorized' for non-officers.
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "You do not have permission to view analytics." },
        { status: 403 },
      );
    }

    console.error("Retention analytics failed:", error);

    return NextResponse.json(
      { error: "Unable to load new vs. returning data." },
      { status: 500 },
    );
  }
}
