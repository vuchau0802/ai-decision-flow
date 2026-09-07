import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/inngest/runStore";

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId query param required" }, { status: 400 });
  }
  const run = getRun(eventId);
  if (!run) {
    return NextResponse.json({ error: "run not found (yet)" }, { status: 404 });
  }
  return NextResponse.json(run);
}