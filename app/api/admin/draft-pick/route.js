// File: app/api/admin/draft-pick/route.js
// Allows admin to manually create draft picks for users

import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'dangajewski99@gmail.com';

export async function POST(request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'No authorization token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Verify admin status
    if (user.email !== ADMIN_EMAIL) {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    // Parse request body
    const { userId, username, playerId, playerName, eventId, eventName, pickNumber } = await request.json();

    // Validate required fields
    if (!userId || !username || !playerId || !playerName || !eventId || !eventName) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if player is already drafted in this event
    const { data: existingPick } = await supabase
      .from('draft_picks')
      .select('id')
      .eq('event_id', eventId)
      .eq('player_id', playerId)
      .single();

    if (existingPick) {
      return Response.json({ error: 'Player already drafted in this event' }, { status: 400 });
    }

    // Check how many picks the user already has
    const { data: userPicks } = await supabase
      .from('draft_picks')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (userPicks && userPicks.length >= 4) {
      return Response.json({ error: 'User already has 4 picks for this event' }, { status: 400 });
    }

    // Get current pick count for the event to determine pick number
    const { data: allPicks } = await supabase
      .from('draft_picks')
      .select('pick_number')
      .eq('event_id', eventId)
      .order('pick_number', { ascending: false })
      .limit(1);

    const nextPickNumber = pickNumber || (allPicks && allPicks.length > 0 ? allPicks[0].pick_number + 1 : 1);

    // Insert the draft pick
    const { data: newPick, error: insertError } = await supabase
      .from('draft_picks')
      .insert({
        event_id: eventId,
        event_name: eventName,
        user_id: userId,
        username: username,
        player_id: playerId,
        player_name: playerName,
        pick_number: nextPickNumber,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    // Log the admin action
    await supabase.from('admin_action_log').insert({
      action_type: 'draft_pick',
      action_description: `Admin manually added draft pick: ${playerName} for ${username}`,
      target_user_id: userId,
      target_username: username,
      action_data: {
        eventId,
        eventName,
        playerId,
        playerName,
        pickNumber: nextPickNumber
      },
      admin_user_id: user.id,
      admin_email: user.email
    });

    // Try to send SMS notification
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_number')
        .eq('id', userId)
        .single();

      if (profile?.phone_number) {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: profile.phone_number,
            username: username,
            pickNumber: (userPicks?.length || 0) + 1,
            eventName: eventName,
          }),
        });
      }
    } catch (notifyError) {
      console.error('Notification error (non-fatal):', notifyError);
    }

    return Response.json({
      success: true,
      pick: newPick,
      message: `Successfully drafted ${playerName} for ${username}`
    });

  } catch (error) {
    console.error('Admin draft pick error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
