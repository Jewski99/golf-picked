/**
 * PGA Tour Field API Endpoint
 * ===========================
 *
 * This endpoint fetches tournament field data from the PGA Tour's GraphQL API
 * and stores it in Supabase for early draft visibility (Mon-Wed before
 * the tournament starts).
 *
 * Endpoints:
 * - GET /api/scrape-field?event=tournament-slug&year=2026&eventId=123&eventName=Name
 * - GET /api/scrape-field?cron=true (auto-detects upcoming event)
 *
 * Once the tournament starts (Thursday), the main app switches to
 * LiveGolf API for live scoring and complete player data.
 */

import { createClient } from "@supabase/supabase-js";

// Lazily initialize Supabase client to avoid build-time errors
let supabase = null;

function getSupabase() {
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase configuration missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables."
      );
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// PGA Tour GraphQL API endpoint
const PGA_TOUR_API = "https://orchestrator.pgatour.com/graphql";

/**
 * Fetch tournament schedule to find tournament ID
 */
async function fetchTournamentSchedule(year) {
  const query = `
    query Schedule($tourCode: TourCode!, $year: String!) {
      schedule(tourCode: $tourCode, year: $year) {
        completed {
          id
          tournamentName
          startDate
          endDate
        }
        upcoming {
          id
          tournamentName
          startDate
          endDate
        }
        inProgress {
          id
          tournamentName
          startDate
          endDate
        }
      }
    }
  `;

  const response = await fetch(PGA_TOUR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "da2-gsrx5bibzbb4njvhl7t37wqyl4",
    },
    body: JSON.stringify({
      query,
      variables: { tourCode: "R", year: String(year) },
    }),
  });

  const data = await response.json();
  return data?.data?.schedule;
}

/**
 * Fetch tournament field from PGA Tour GraphQL API
 */
async function fetchTournamentField(tournamentId) {
  const query = `
    query TournamentField($tournamentId: ID!) {
      field(tournamentId: $tournamentId) {
        id
        firstName
        lastName
        country
        countryFlag
      }
    }
  `;

  const response = await fetch(PGA_TOUR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "da2-gsrx5bibzbb4njvhl7t37wqyl4",
    },
    body: JSON.stringify({
      query,
      variables: { tournamentId },
    }),
  });

  const data = await response.json();
  return data?.data?.field || [];
}

/**
 * Alternative: Fetch field using tournament permalink
 */
async function fetchFieldByPermalink(year, tournamentId) {
  // Try the leaderboard endpoint which often has field data before tournament starts
  const query = `
    query Leaderboard($tournamentId: ID!) {
      leaderboardV2(tournamentId: $tournamentId) {
        players {
          id
          player {
            id
            firstName
            lastName
            country
            countryFlag
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(PGA_TOUR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "da2-gsrx5bibzbb4njvhl7t37wqyl4",
      },
      body: JSON.stringify({
        query,
        variables: { tournamentId },
      }),
    });

    const data = await response.json();
    const players = data?.data?.leaderboardV2?.players || [];

    return players.map((p) => ({
      id: p.player?.id || p.id,
      firstName: p.player?.firstName,
      lastName: p.player?.lastName,
      country: p.player?.country || p.player?.countryFlag,
    }));
  } catch (error) {
    console.error("[Scraper] Leaderboard fetch failed:", error);
    return [];
  }
}

/**
 * Find tournament in schedule by name matching
 */
function findTournamentInSchedule(schedule, eventName) {
  if (!schedule) return null;

  const allTournaments = [
    ...(schedule.upcoming || []),
    ...(schedule.inProgress || []),
    ...(schedule.completed || []),
  ];

  // Try exact match first
  let match = allTournaments.find(
    (t) => t.tournamentName.toLowerCase() === eventName.toLowerCase()
  );

  // Try partial match
  if (!match) {
    const searchTerms = eventName.toLowerCase().split(" ");
    match = allTournaments.find((t) => {
      const tournName = t.tournamentName.toLowerCase();
      return searchTerms.some(
        (term) => term.length > 3 && tournName.includes(term)
      );
    });
  }

  return match;
}

/**
 * Stores players in Supabase
 */
async function storePlayersInSupabase(
  players,
  eventId,
  eventName,
  eventSlug,
  year,
  sourceUrl
) {
  const records = players.map((player) => ({
    event_id: eventId,
    event_name: eventName,
    event_slug: eventSlug,
    event_year: year,
    player_name: `${player.firstName} ${player.lastName}`.trim(),
    player_country: player.country,
    player_pga_id: player.id,
    source_url: sourceUrl || "pga-tour-api",
    scraped_at: new Date().toISOString(),
  }));

  // Delete existing records for this event to avoid duplicates
  const { error: deleteError } = await getSupabase()
    .from("scraped_fields")
    .delete()
    .eq("event_id", eventId);

  if (deleteError) {
    console.error(
      "[Scraper] Warning: Could not delete existing records:",
      deleteError
    );
  }

  // Insert new records
  const { data, error } = await getSupabase()
    .from("scraped_fields")
    .insert(records)
    .select();

  if (error) {
    console.error("[Scraper] Error storing players:", error);
    throw error;
  }

  console.log(`[Scraper] Stored ${data.length} players in Supabase`);
  return data;
}

/**
 * Logs scrape attempt to scrape_logs table
 */
async function logScrapeAttempt(
  eventName,
  eventSlug,
  playersFound,
  status,
  errorMessage = null
) {
  try {
    await getSupabase().from("scrape_logs").insert({
      event_name: eventName,
      event_slug: eventSlug,
      players_found: playersFound,
      status: status,
      error_message: errorMessage,
    });
  } catch (e) {
    console.error("[Scraper] Could not log scrape attempt:", e);
  }
}

/**
 * Main function to fetch field data
 */
async function fetchField(eventSlug, year, eventId, eventName) {
  console.log(`[Scraper] Fetching field for: ${eventName} (${year})`);

  try {
    // Step 1: Get tournament schedule to find the PGA Tour tournament ID
    const schedule = await fetchTournamentSchedule(year);

    if (!schedule) {
      throw new Error("Could not fetch PGA Tour schedule");
    }

    // Step 2: Find the tournament in the schedule
    const tournament = findTournamentInSchedule(schedule, eventName);

    if (!tournament) {
      console.log("[Scraper] Available tournaments:",
        [...(schedule.upcoming || []), ...(schedule.inProgress || [])]
          .map(t => t.tournamentName)
          .join(", ")
      );
      throw new Error(`Tournament "${eventName}" not found in PGA Tour schedule`);
    }

    console.log(`[Scraper] Found tournament: ${tournament.tournamentName} (ID: ${tournament.id})`);

    // Step 3: Fetch the field
    let players = await fetchTournamentField(tournament.id);

    // If field endpoint doesn't return data, try leaderboard
    if (!players || players.length === 0) {
      console.log("[Scraper] Field empty, trying leaderboard endpoint...");
      players = await fetchFieldByPermalink(year, tournament.id);
    }

    if (!players || players.length === 0) {
      throw new Error("No players found for this tournament");
    }

    console.log(`[Scraper] Found ${players.length} players`);

    // Step 4: Store in Supabase
    const storedPlayers = await storePlayersInSupabase(
      players,
      eventId,
      eventName,
      eventSlug,
      year,
      `pga-tour-api:${tournament.id}`
    );

    // Log successful scrape
    await logScrapeAttempt(eventName, eventSlug, players.length, "success");

    return {
      success: true,
      event: {
        id: eventId,
        name: eventName,
        slug: eventSlug,
        year: year,
        pgaTourId: tournament.id,
      },
      players: storedPlayers,
      count: storedPlayers.length,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Scraper] Failed:`, error);

    // Log failed scrape
    await logScrapeAttempt(eventName, eventSlug, 0, "failed", error.message);

    throw error;
  }
}

/**
 * Fetches upcoming event from LiveGolf API for cron job
 */
async function getUpcomingEvent() {
  try {
    const response = await fetch(
      `https://use.livegolfapi.com/v1/events?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}&tour=pga-tour`
    );
    const events = await response.json();
    const now = new Date();

    // Find the next upcoming event that hasn't started yet
    for (const event of events) {
      const startDate = new Date(event.startDatetime);
      if (startDate > now) {
        return event;
      }
    }

    // If no upcoming, return current in-progress event
    for (const event of events) {
      const startDate = new Date(event.startDatetime);
      const endDate = new Date(event.endDatetime);
      if (now >= startDate && now <= endDate) {
        return event;
      }
    }

    return null;
  } catch (error) {
    console.error("[Scraper] Error fetching upcoming event:", error);
    return null;
  }
}

/**
 * Converts event name to URL slug
 */
function eventNameToSlug(eventName) {
  return eventName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/**
 * GET handler
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventSlug = searchParams.get("event");
    const year = searchParams.get("year") || new Date().getFullYear();
    const eventId = searchParams.get("eventId");
    const eventName = searchParams.get("eventName");
    const cron = searchParams.get("cron");

    // If this is a cron job trigger, auto-detect the upcoming event
    if (cron === "true") {
      console.log("[Scraper] Cron job triggered - finding upcoming event");

      const upcomingEvent = await getUpcomingEvent();
      if (!upcomingEvent) {
        return Response.json(
          {
            success: false,
            error: "No upcoming event found",
          },
          { status: 404 }
        );
      }

      const eventYear = new Date(upcomingEvent.startDatetime).getFullYear();
      const slug = eventNameToSlug(upcomingEvent.name);

      const result = await fetchField(
        slug,
        eventYear,
        upcomingEvent.id,
        upcomingEvent.name
      );

      return Response.json(result);
    }

    // Manual trigger requires eventName
    if (!eventName) {
      return Response.json(
        {
          success: false,
          error: "Missing required parameter: eventName",
          example:
            "/api/scrape-field?eventName=WM%20Phoenix%20Open&year=2026&eventId=123",
        },
        { status: 400 }
      );
    }

    const result = await fetchField(
      eventSlug || eventNameToSlug(eventName),
      parseInt(year),
      eventId || eventSlug || eventNameToSlug(eventName),
      eventName
    );

    return Response.json(result);
  } catch (error) {
    console.error("[Scraper] API Error:", error);

    return Response.json(
      {
        success: false,
        error: error.message,
        details:
          "Failed to fetch field data. The tournament may not be available yet.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      eventSlug,
      year = new Date().getFullYear(),
      eventId,
      eventName,
    } = body;

    if (!eventName) {
      return Response.json(
        {
          success: false,
          error: "Missing required field: eventName",
          example: {
            eventName: "WM Phoenix Open",
            year: 2026,
            eventId: "123",
          },
        },
        { status: 400 }
      );
    }

    const result = await fetchField(
      eventSlug || eventNameToSlug(eventName),
      parseInt(year),
      eventId || eventSlug || eventNameToSlug(eventName),
      eventName
    );

    return Response.json(result);
  } catch (error) {
    console.error("[Scraper] API Error:", error);

    return Response.json(
      {
        success: false,
        error: error.message,
        details: "Failed to fetch field data. Check server logs for details.",
      },
      { status: 500 }
    );
  }
}
