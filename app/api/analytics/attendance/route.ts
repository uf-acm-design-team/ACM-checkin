
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/app/utils/supabase/server";

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

    const supabase = createClerkSupabaseClient();

    const { data, error } = await supabase.rpc(
      "get_org_attendance_by_meeting",
      {
        p_org_id: orgId,
        p_start_time: startDate.toISOString(),
        p_end_time: endDate.toISOString(),
      },
    );

    if (error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json(
          { error: "You do not have permission to view analytics." },
          { status: 403 },
        );
      }

      console.error("Attendance analytics RPC failed:", error);

      return NextResponse.json(
        { error: "Unable to load attendance data." },
        { status: 500 },
      );
    }

    return NextResponse.json(data ?? [], {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Attendance analytics API error:", error);

    return NextResponse.json(
      { error: "Unable to load attendance data." },
      { status: 500 },
    );
  }
}
