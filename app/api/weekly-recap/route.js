// File: app/api/weekly-recap/route.js
// This API route sends weekly recap SMS messages to all users
// Triggered by Vercel cron on Monday mornings

import { createClient } from '@supabase/supabase-js';

async function sendSMS(phoneNumber, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const response = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: phoneNumber,
      From: twilioNumber,
      Body: message,
    }),
  });

  return response.ok;
}

export async function GET(request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Initialize Supabase client inside the function (runtime, not build time)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Get the most recently completed event
    const eventsResponse = await fetch(
      `https://use.livegolfapi.com/v1/events?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}&tour=pga-tour`
    );
    const events = await eventsResponse.json();

    const now = new Date();
    // Find the most recent event that has ended (within last 7 days)
    const recentCompletedEvent = events.find(event => {
      const endDate = new Date(event.endDatetime);
      const daysSinceEnd = (now - endDate) / (1000 * 60 * 60 * 24);
      return daysSinceEnd >= 0 && daysSinceEnd <= 7;
    });

    if (!recentCompletedEvent) {
      return Response.json({ message: 'No recently completed event found' }, { status: 200 });
    }

    // 2. Get the leaderboard for the completed event
    const leaderboardResponse = await fetch(
      `https://use.livegolfapi.com/v1/events/${recentCompletedEvent.id}/leaderboard?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
    );
    const leaderboard = await leaderboardResponse.json();

    // Create a map of player ID to earnings
    const playerEarnings = {};
    leaderboard.forEach(entry => {
      if (entry.player?.id) {
        playerEarnings[entry.player.id] = entry.earnings || 0;
      }
    });

    // 3. Get all draft picks for this event
    const { data: draftPicks } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('event_id', recentCompletedEvent.id);

    if (!draftPicks || draftPicks.length === 0) {
      return Response.json({ message: 'No draft picks for this event' }, { status: 200 });
    }

    // 4. Calculate weekly earnings for each user
    const userWeeklyEarnings = {};
    draftPicks.forEach(pick => {
      const earnings = playerEarnings[pick.player_id] || 0;
      if (!userWeeklyEarnings[pick.user_id]) {
        userWeeklyEarnings[pick.user_id] = {
          username: pick.username,
          user_id: pick.user_id,
          total: 0
        };
      }
      userWeeklyEarnings[pick.user_id].total += earnings;
    });

    // 5. Determine weekly winner
    const weeklyResults = Object.values(userWeeklyEarnings).sort((a, b) => b.total - a.total);
    const weeklyWinner = weeklyResults[0];

    // 6. Get season standings
    const { data: seasonStandings } = await supabase
      .from('season_standings')
      .select('*')
      .order('total_winnings', { ascending: false });

    // 7. Format the standings for the message
    const standingsText = seasonStandings
      .map((s, idx) => `${idx + 1}. ${s.username}: $${s.total_winnings?.toLocaleString() || '0'}`)
      .join('\n');

    // 8. Create the recap message
    const recapMessage = `Golf Pick'em Weekly Recap!

Congratulations to ${weeklyWinner.username} for winning this week at the ${recentCompletedEvent.name}! They totaled $${weeklyWinner.total.toLocaleString()}.

Season Standings:
${standingsText}

Good luck this week!`;

    // 9. Get all users with phone numbers
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, phone_number')
      .not('phone_number', 'is', null);

    // 10. Send SMS to all users
    let sentCount = 0;
    let failedCount = 0;

    for (const profile of profiles || []) {
      if (profile.phone_number) {
        const success = await sendSMS(profile.phone_number, recapMessage);
        if (success) {
          sentCount++;
        } else {
          failedCount++;
        }
      }
    }

    return Response.json({
      success: true,
      event: recentCompletedEvent.name,
      weeklyWinner: weeklyWinner.username,
      weeklyWinnings: weeklyWinner.total,
      messagesSent: sentCount,
      messagesFailed: failedCount
    });

  } catch (error) {
    console.error('Weekly recap error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
