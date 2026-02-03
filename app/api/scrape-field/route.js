/**
 * PGA Tour Field API Endpoint
 * ===========================
 *
 * This endpoint fetches tournament field data from the PGA Tour's public APIs
 * and stores it in Supabase for early draft visibility (Mon-Wed before
 * the tournament starts).
 *
 * Endpoints:
 * - GET /api/scrape-field?event=tournament-slug&year=2026&eventId=123&eventName=Name
 * - GET /api/scrape-field?cron=true (auto-detects upcoming event)
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

/**
 * Fetch tournament schedule from PGA Tour stats API
 */
async function fetchTournamentSchedule(year) {
  try {
    // Try the PGA Tour schedule endpoint
    const response = await fetch(
      `https://statdata.pgatour.com/r/current/schedule-v2.json`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!response.ok) {
      console.log(`[Scraper] Schedule API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Scraper] Error fetching schedule:", error.message);
    return null;
  }
}

/**
 * Fetch tournament field from PGA Tour stats API
 */
async function fetchTournamentField(tournamentId) {
  try {
    // Try the field endpoint
    const response = await fetch(
      `https://statdata.pgatour.com/r/${tournamentId}/field.json`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!response.ok) {
      console.log(`[Scraper] Field API returned ${response.status}`);
      return [];
    }

    const data = await response.json();

    // Extract players from the field data
    if (data.Tournament?.Players) {
      return data.Tournament.Players.map(p => ({
        id: p.TournamentPlayerId || p.PlayerId,
        firstName: p.PlayerFirstName,
        lastName: p.PlayerLastName,
        country: p.PlayerCountry || p.Country
      }));
    }

    return [];
  } catch (error) {
    console.error("[Scraper] Error fetching field:", error.message);
    return [];
  }
}

/**
 * Alternative: Fetch from leaderboard endpoint (works during tournament)
 */
async function fetchFromLeaderboard(tournamentId) {
  try {
    const response = await fetch(
      `https://statdata.pgatour.com/r/${tournamentId}/leaderboard-v2.json`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (data.leaderboard?.players) {
      return data.leaderboard.players.map(p => ({
        id: p.player_id,
        firstName: p.player_bio?.first_name || p.first_name,
        lastName: p.player_bio?.last_name || p.last_name,
        country: p.player_bio?.country || p.country
      }));
    }

    return [];
  } catch (error) {
    console.error("[Scraper] Error fetching leaderboard:", error.message);
    return [];
  }
}

/**
 * Find tournament in schedule by name matching
 */
function findTournamentInSchedule(schedule, eventName) {
  if (!schedule?.years?.[0]?.tours) return null;

  const searchName = eventName.toLowerCase();
  const searchTerms = searchName.split(' ').filter(t => t.length > 2);

  // Look through all tours (primarily PGA Tour)
  for (const tour of schedule.years[0].tours) {
    if (!tour.trns) continue;

    for (const tournament of tour.trns) {
      const tournName = (tournament.trnName?.long || tournament.trnName?.short || '').toLowerCase();

      // Exact match
      if (tournName === searchName) {
        return tournament;
      }

      // Partial match - check if key terms match
      const matchCount = searchTerms.filter(term => tournName.includes(term)).length;
      if (matchCount >= 2 || (searchTerms.length === 1 && matchCount === 1)) {
        return tournament;
      }
    }
  }

  return null;
}

/**
 * Get current/upcoming tournament from schedule
 */
function getCurrentTournament(schedule) {
  if (!schedule?.years?.[0]?.tours) return null;

  const now = new Date();

  for (const tour of schedule.years[0].tours) {
    if (tour.tourCodeLc !== 'r') continue; // Only PGA Tour
    if (!tour.trns) continue;

    for (const tournament of tour.trns) {
      const startDate = new Date(tournament.date?.start);
      const endDate = new Date(tournament.date?.end);

      // Currently in progress or upcoming within next 7 days
      if (now <= endDate) {
        return tournament;
      }
    }
  }

  return null;
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
    player_name: `${player.firstName || ''} ${player.lastName || ''}`.trim(),
    player_country: player.country,
    player_pga_id: player.id,
    source_url: sourceUrl || "pga-tour-api",
    scraped_at: new Date().toISOString(),
  }));

  // Filter out any records with empty names
  const validRecords = records.filter(r => r.player_name.length > 1);

  if (validRecords.length === 0) {
    throw new Error("No valid player records to store");
  }

  // Delete existing records for this event to avoid duplicates
  const { error: deleteError } = await getSupabase()
    .from("scraped_fields")
    .delete()
    .eq("event_id", eventId);

  if (deleteError) {
    console.error("[Scraper] Warning: Could not delete existing records:", deleteError);
  }

  // Insert new records
  const { data, error } = await getSupabase()
    .from("scraped_fields")
    .insert(validRecords)
    .select();

  if (error) {
    console.error("[Scraper] Error storing players:", error);
    throw error;
  }

  console.log(`[Scraper] Stored ${data.length} players in Supabase`);
  return data;
}

/**
 * Logs scrape attempt
 */
async function logScrapeAttempt(eventName, eventSlug, playersFound, status, errorMessage = null) {
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
    // Step 1: Get tournament schedule
    const schedule = await fetchTournamentSchedule(year);

    let tournament = null;
    let pgaTournamentId = null;

    if (schedule) {
      // Step 2: Find the tournament in the schedule
      tournament = findTournamentInSchedule(schedule, eventName);

      if (tournament) {
        pgaTournamentId = tournament.permNum || tournament.trnId;
        console.log(`[Scraper] Found tournament: ${tournament.trnName?.long} (ID: ${pgaTournamentId})`);
      } else {
        console.log("[Scraper] Tournament not found in schedule, trying current tournament...");
        tournament = getCurrentTournament(schedule);
        if (tournament) {
          pgaTournamentId = tournament.permNum || tournament.trnId;
          console.log(`[Scraper] Using current tournament: ${tournament.trnName?.long} (ID: ${pgaTournamentId})`);
        }
      }
    }

    // Step 3: Try to fetch field data
    let players = [];

    if (pgaTournamentId) {
      // Try field endpoint first
      players = await fetchTournamentField(pgaTournamentId);

      // If field is empty, try leaderboard
      if (players.length === 0) {
        console.log("[Scraper] Field empty, trying leaderboard...");
        players = await fetchFromLeaderboard(pgaTournamentId);
      }
    }

    // Step 4: If still no players, try the "current" tournament ID format
    if (players.length === 0) {
      console.log("[Scraper] Trying 'current' tournament endpoint...");
      players = await fetchTournamentField("current");

      if (players.length === 0) {
        players = await fetchFromLeaderboard("current");
      }
    }

    if (players.length === 0) {
      throw new Error(
        "No players found. The field may not be published yet, or try again closer to the tournament."
      );
    }

    console.log(`[Scraper] Found ${players.length} players`);

    // Step 5: Store in Supabase
    const storedPlayers = await storePlayersInSupabase(
      players,
      eventId,
      eventName,
      eventSlug,
      year,
      pgaTournamentId ? `pga-stats:${pgaTournamentId}` : "pga-stats:current"
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
        pgaTourId: pgaTournamentId,
      },
      players: storedPlayers,
      count: storedPlayers.length,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Scraper] Failed:`, error);
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

    for (const event of events) {
      const startDate = new Date(event.startDatetime);
      if (startDate > now) {
        return event;
      }
    }

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

    if (cron === "true") {
      console.log("[Scraper] Cron job triggered");

      const upcomingEvent = await getUpcomingEvent();
      if (!upcomingEvent) {
        return Response.json({ success: false, error: "No upcoming event found" }, { status: 404 });
      }

      const eventYear = new Date(upcomingEvent.startDatetime).getFullYear();
      const slug = eventNameToSlug(upcomingEvent.name);

      const result = await fetchField(slug, eventYear, upcomingEvent.id, upcomingEvent.name);
      return Response.json(result);
    }

    if (!eventName) {
      return Response.json(
        {
          success: false,
          error: "Missing required parameter: eventName",
          example: "/api/scrape-field?eventName=WM%20Phoenix%20Open&year=2026&eventId=123",
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
        details: "Failed to fetch field data. The field may not be published yet.",
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
    const { eventSlug, year = new Date().getFullYear(), eventId, eventName } = body;

    if (!eventName) {
      return Response.json(
        {
          success: false,
          error: "Missing required field: eventName",
          example: { eventName: "WM Phoenix Open", year: 2026, eventId: "123" },
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
        details: "Failed to fetch field data.",
      },
      { status: 500 }
    );
  }
}
