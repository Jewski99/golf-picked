/**
 * PGA Tour Field Scraper API Endpoint
 * ===================================
 *
 * This endpoint scrapes tournament field data from the PGA Tour website
 * and stores it in Supabase for early draft visibility (Mon-Wed before
 * the tournament starts).
 *
 * Endpoints:
 * - GET /api/scrape-field?event=tournament-slug&year=2026
 * - POST /api/scrape-field (with JSON body: { eventSlug, year, eventId, eventName })
 *
 * The scraper extracts:
 * - Player names
 * - Player countries
 * - PGA Tour player IDs (when available in data attributes)
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
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.");
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// Configuration
const CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5 * 60 * 1000, // 5 minutes between retries
  REQUEST_TIMEOUT_MS: 30000, // 30 second timeout
  PGA_TOUR_BASE_URL: "https://www.pgatour.com",
};

/**
 * Delays execution for specified milliseconds
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches HTML from PGA Tour with retry logic
 */
async function fetchWithRetry(url, attempt = 1) {
  try {
    console.log(`[Scraper] Fetching URL (attempt ${attempt}): ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONFIG.REQUEST_TIMEOUT_MS
    );

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error(`[Scraper] Attempt ${attempt} failed:`, error.message);

    if (attempt < CONFIG.MAX_RETRIES) {
      console.log(`[Scraper] Waiting before retry...`);
      await delay(CONFIG.RETRY_DELAY_MS);
      return fetchWithRetry(url, attempt + 1);
    }

    throw error;
  }
}

/**
 * Parses player data from PGA Tour field page HTML
 *
 * The PGA Tour website uses various structures, so we try multiple
 * parsing strategies to extract player information.
 */
function parsePlayersFromHTML(html, eventName) {
  const players = [];

  // Strategy 1: Look for JSON data embedded in the page (Next.js data)
  // PGA Tour often embeds data in <script id="__NEXT_DATA__"> tags
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (nextDataMatch) {
    try {
      const jsonData = JSON.parse(nextDataMatch[1]);
      const extractedPlayers = extractPlayersFromNextData(jsonData);
      if (extractedPlayers.length > 0) {
        console.log(
          `[Scraper] Found ${extractedPlayers.length} players via __NEXT_DATA__`
        );
        return extractedPlayers;
      }
    } catch (e) {
      console.log("[Scraper] Could not parse __NEXT_DATA__:", e.message);
    }
  }

  // Strategy 2: Look for player list containers with specific patterns
  // Match player name patterns in the HTML

  // Pattern: Look for player cards/items with names and countries
  // Common patterns: data-player-name, class containing "player", aria-label with player info
  const playerPatterns = [
    // Pattern for player cards with name and country
    /<div[^>]*class="[^"]*player[^"]*"[^>]*>[\s\S]*?<span[^>]*>([A-Z][a-z]+ [A-Z][a-z]+(?:[-'][A-Z][a-z]+)?)<\/span>[\s\S]*?<span[^>]*>([A-Z]{2,3})<\/span>/gi,

    // Pattern for list items with player names
    /<li[^>]*>[\s\S]*?<a[^>]*href="\/players\/[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*>([A-Z]{2,3})<\/span>/gi,

    // Pattern for player name links followed by country
    /href="\/players\/([^"\/]+)"[^>]*>([^<]+)<\/a>[\s\S]{0,200}?<span[^>]*class="[^"]*country[^"]*"[^>]*>([A-Z]{2,3})<\/span>/gi,
  ];

  for (const pattern of playerPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      // Extract player info based on capture groups
      let playerName, country, playerId;

      if (match[3]) {
        // Pattern with player ID in URL
        playerId = match[1];
        playerName = match[2].trim();
        country = match[3];
      } else {
        playerName = match[1].trim();
        country = match[2];
      }

      // Validate player name (should be at least two words, no HTML)
      if (
        playerName &&
        playerName.length > 3 &&
        !playerName.includes("<") &&
        /^[A-Za-z\s'\-\.]+$/.test(playerName)
      ) {
        const existing = players.find(
          (p) => p.player_name.toLowerCase() === playerName.toLowerCase()
        );
        if (!existing) {
          players.push({
            player_name: playerName,
            player_country: country || null,
            player_pga_id: playerId || null,
          });
        }
      }
    }
  }

  // Strategy 3: Simple name extraction with common golf player name patterns
  // Look for patterns like "First Last" or "First Last Jr." near country codes
  const simplePattern =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+(?:\s+(?:Jr\.|Sr\.|III|IV|II))?)\s*(?:<[^>]*>)*\s*(?:<[^>]*class="[^"]*(?:country|flag)[^"]*"[^>]*>)?\s*([A-Z]{2,3})?/g;
  let simpleMatch;
  while ((simpleMatch = simplePattern.exec(html)) !== null) {
    const name = simpleMatch[1]?.trim();
    const country = simpleMatch[2];

    if (
      name &&
      name.length > 5 &&
      name.split(" ").length >= 2 &&
      !name.includes("Copyright") &&
      !name.includes("Privacy") &&
      !name.includes("Terms")
    ) {
      const existing = players.find(
        (p) => p.player_name.toLowerCase() === name.toLowerCase()
      );
      if (!existing) {
        players.push({
          player_name: name,
          player_country: country || null,
          player_pga_id: null,
        });
      }
    }
  }

  console.log(`[Scraper] Extracted ${players.length} players from HTML`);
  return players;
}

/**
 * Extracts player data from Next.js __NEXT_DATA__ JSON
 */
function extractPlayersFromNextData(data) {
  const players = [];

  // Recursive function to search for player arrays in nested data
  function searchForPlayers(obj, path = "") {
    if (!obj || typeof obj !== "object") return;

    // Check if this object looks like a player
    if (obj.firstName && obj.lastName) {
      players.push({
        player_name: `${obj.firstName} ${obj.lastName}`.trim(),
        player_country: obj.country || obj.countryCode || null,
        player_pga_id: obj.id || obj.playerId || obj.playerID || null,
      });
      return;
    }

    // Check if this is a player with a "name" field
    if (obj.name && obj.country && typeof obj.name === "string") {
      players.push({
        player_name: obj.name.trim(),
        player_country: obj.country || null,
        player_pga_id: obj.id || obj.playerId || null,
      });
      return;
    }

    // Check if this is an array of players
    if (Array.isArray(obj)) {
      // Check if array contains player-like objects
      const isPlayerArray = obj.some(
        (item) =>
          item &&
          typeof item === "object" &&
          ((item.firstName && item.lastName) ||
            (item.name && typeof item.name === "string"))
      );

      if (isPlayerArray) {
        for (const item of obj) {
          if (item.firstName && item.lastName) {
            players.push({
              player_name: `${item.firstName} ${item.lastName}`.trim(),
              player_country: item.country || item.countryCode || null,
              player_pga_id: item.id || item.playerId || item.playerID || null,
            });
          } else if (item.name && typeof item.name === "string") {
            players.push({
              player_name: item.name.trim(),
              player_country: item.country || null,
              player_pga_id: item.id || item.playerId || null,
            });
          }
        }
        return;
      }
    }

    // Recursively search in nested objects/arrays
    // Focus on likely field names
    const relevantKeys = [
      "players",
      "field",
      "entries",
      "participants",
      "competitors",
      "pageProps",
      "props",
      "data",
      "tournament",
      "event",
      "roster",
    ];

    for (const key of Object.keys(obj)) {
      if (
        relevantKeys.some(
          (rk) => key.toLowerCase().includes(rk.toLowerCase())
        ) ||
        Array.isArray(obj[key])
      ) {
        searchForPlayers(obj[key], `${path}.${key}`);
      }
    }
  }

  searchForPlayers(data);

  // Deduplicate players
  const uniquePlayers = [];
  const seen = new Set();
  for (const player of players) {
    const key = player.player_name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniquePlayers.push(player);
    }
  }

  return uniquePlayers;
}

/**
 * Stores scraped players in Supabase
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
    player_name: player.player_name,
    player_country: player.player_country,
    player_pga_id: player.player_pga_id,
    source_url: sourceUrl,
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
 * Main scraper function
 */
async function scrapeField(eventSlug, year, eventId, eventName) {
  const url = `${CONFIG.PGA_TOUR_BASE_URL}/tournaments/${year}/${eventSlug}/field`;
  console.log(`[Scraper] Starting scrape for: ${eventName}`);
  console.log(`[Scraper] URL: ${url}`);

  try {
    // Fetch the HTML
    const html = await fetchWithRetry(url);
    console.log(`[Scraper] Fetched ${html.length} bytes of HTML`);

    // Parse players from HTML
    const players = parsePlayersFromHTML(html, eventName);

    if (players.length === 0) {
      // Try alternative URL patterns
      const altUrls = [
        `${CONFIG.PGA_TOUR_BASE_URL}/tournaments/${year}/${eventSlug}`,
        `${CONFIG.PGA_TOUR_BASE_URL}/tournaments/${eventSlug}/field`,
        `${CONFIG.PGA_TOUR_BASE_URL}/tournaments/${eventSlug}`,
      ];

      for (const altUrl of altUrls) {
        try {
          console.log(`[Scraper] Trying alternative URL: ${altUrl}`);
          const altHtml = await fetchWithRetry(altUrl);
          const altPlayers = parsePlayersFromHTML(altHtml, eventName);
          if (altPlayers.length > 0) {
            console.log(
              `[Scraper] Found ${altPlayers.length} players from alternative URL`
            );
            players.push(...altPlayers);
            break;
          }
        } catch (e) {
          console.log(`[Scraper] Alternative URL failed: ${e.message}`);
        }
      }
    }

    if (players.length === 0) {
      throw new Error("No players found on page. Page structure may have changed.");
    }

    // Store in Supabase
    const storedPlayers = await storePlayersInSupabase(
      players,
      eventId,
      eventName,
      eventSlug,
      year,
      url
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
      },
      players: storedPlayers,
      count: storedPlayers.length,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Scraper] Scrape failed:`, error);

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

    return null;
  } catch (error) {
    console.error("[Scraper] Error fetching upcoming event:", error);
    return null;
  }
}

/**
 * Converts event name to URL slug
 * e.g., "The Sentry" -> "the-sentry"
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
 * GET handler - scrape field with query parameters
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

      const result = await scrapeField(
        slug,
        eventYear,
        upcomingEvent.id,
        upcomingEvent.name
      );

      return Response.json(result);
    }

    // Manual trigger requires event parameter
    if (!eventSlug) {
      return Response.json(
        {
          success: false,
          error:
            'Missing required parameter: event (tournament slug, e.g., "the-sentry")',
          example:
            "/api/scrape-field?event=the-sentry&year=2026&eventId=123&eventName=The%20Sentry",
        },
        { status: 400 }
      );
    }

    const result = await scrapeField(
      eventSlug,
      parseInt(year),
      eventId || eventSlug,
      eventName || eventSlug
    );

    return Response.json(result);
  } catch (error) {
    console.error("[Scraper] API Error:", error);

    return Response.json(
      {
        success: false,
        error: error.message,
        details: "Scraping failed. The PGA Tour website may have changed structure or be temporarily unavailable.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler - scrape field with JSON body
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

    if (!eventSlug) {
      return Response.json(
        {
          success: false,
          error: "Missing required field: eventSlug",
          example: {
            eventSlug: "the-sentry",
            year: 2026,
            eventId: "123",
            eventName: "The Sentry",
          },
        },
        { status: 400 }
      );
    }

    const result = await scrapeField(
      eventSlug,
      parseInt(year),
      eventId || eventSlug,
      eventName || eventSlug
    );

    return Response.json(result);
  } catch (error) {
    console.error("[Scraper] API Error:", error);

    return Response.json(
      {
        success: false,
        error: error.message,
        details: "Scraping failed. Check server logs for more information.",
      },
      { status: 500 }
    );
  }
}
