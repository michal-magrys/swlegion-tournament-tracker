import { fetchArmyList } from "@/lib/scraper";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const player = request.nextUrl.searchParams.get("player");
  const event = request.nextUrl.searchParams.get("event");

  if (!player || !event) {
    return NextResponse.json(
      { error: "Missing player or event parameter" },
      { status: 400 }
    );
  }

  const playerId = parseInt(player, 10);
  const eventId = parseInt(event, 10);

  if (isNaN(playerId) || isNaN(eventId)) {
    return NextResponse.json(
      { error: "Invalid player or event parameter" },
      { status: 400 }
    );
  }

  const list = await fetchArmyList(playerId, eventId);

  if (!list) {
    return NextResponse.json(
      { error: "Army list not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(list);
}
