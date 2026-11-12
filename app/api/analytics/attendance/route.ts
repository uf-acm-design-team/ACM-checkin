
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrgAttendance } from "@/lib/analytics-data";

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json(
        { error: "Invalid date range." },
        { status: 400 },
      );
    }

    const data = await getOrgAttendance(
      orgId,
      startDate.toISOString(),
      endDate.toISOString(),
    );

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Attendance analytics API error:", error);

    if (
      error instanceof Error &&
      error.message.includes("Unauthorized")
    ) {
      return NextResponse.json(
        { error: "You do not have permission to view analytics." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Unable to load attendance data." },
      { status: 500 },
    );
  }
}
