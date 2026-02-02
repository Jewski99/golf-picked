// File: app/api/update-standings/route.js
// This API route automatically updates season standings after a tournament
// Call this endpoint after a tournament completes to update all user winnings

import { createClient } from '@supabase/supabase-js';

const API_BASE_URL = 'https://use.livegolfapi.com/v1';

// Create Supabase client lazily to avoid build-time errors
const getSupabase = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
};

export async function POST(request) {
  try {
    const supabase = getSupabase();
    const { eventId } = await request.json();

    if (!eventId) {
      return Response.json({ error: 'eventId is required' }, { status: 400 });
    }

    // Fetch final leaderboard from LiveGolf API
    const leaderboardResponse = await fetch(
      `${API_BASE_URL}/events/${eventId}/leaderboard?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
    );

    if (!leaderboardResponse.ok) {
      return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
    }

    const leaderboard = await leaderboardResponse.json();

    // Create a map of player earnings from the leaderboard
    const playerEarningsMap = new Map();
    leaderboard.forEach(entry => {
      if (entry.player?.id && entry.earnings) {
        playerEarningsMap.set(entry.player.id, entry.earnings);
      }
    });

    // Fetch all draft picks for this event
    const { data: draftPicks, error: draftError } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('event_id', eventId);

    if (draftError) {
      return Response.json({ error: 'Failed to fetch draft picks' }, { status: 500 });
    }

    // Calculate earnings per user for this event
    const userEarningsForEvent = new Map();

    draftPicks.forEach(pick => {
      const earnings = playerEarningsMap.get(pick.player_id) || 0;
      const currentTotal = userEarningsForEvent.get(pick.user_id) || 0;
      userEarningsForEvent.set(pick.user_id, currentTotal + earnings);
    });

    // Update season standings for each user
    const updates = [];

    for (const [userId, eventEarnings] of userEarningsForEvent) {
      // Fetch current standings
      const { data: currentStanding } = await supabase
        .from('season_standings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (currentStanding) {
        // Update existing standings
        const { error: updateError } = await supabase
          .from('season_standings')
          .update({
            total_winnings: (currentStanding.total_winnings || 0) + eventEarnings,
            events_played: (currentStanding.events_played || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (!updateError) {
          updates.push({ userId, eventEarnings, status: 'updated' });
        }
      }
    }

    // Mark the event as processed (optional: you could add an events_processed table)
    // This prevents double-counting if the endpoint is called multiple times

    return Response.json({
      success: true,
      eventId,
      usersUpdated: updates.length,
      updates,
    });

  } catch (error) {
    console.error('Update standings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to check standings without updating
export async function GET() {
  try {
    const supabase = getSupabase();
    const { data: standings, error } = await supabase
      .from('season_standings')
      .select('*')
      .order('total_winnings', { ascending: false });

    if (error) {
      return Response.json({ error: 'Failed to fetch standings' }, { status: 500 });
    }

    return Response.json({ standings });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
