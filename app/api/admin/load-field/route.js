// File: app/api/admin/load-field/route.js
// Allows admin to manually load player field data

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
    const { eventId, eventName, players, clearExisting } = await request.json();

    // Validate required fields
    if (!eventId || !eventName || !players || !Array.isArray(players)) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Parse player data (format: "Player Name, Country" per line)
    const parsedPlayers = players.map((playerStr, index) => {
      const trimmed = playerStr.trim();
      if (!trimmed) return null;

      // Split by comma - first part is name, second is country
      const parts = trimmed.split(',').map(p => p.trim());
      const name = parts[0];
      const country = parts[1] || 'Unknown';

      if (!name) return null;

      return {
        event_id: eventId,
        event_name: eventName,
        player_name: name,
        player_country: country,
        player_id: `manual_${Date.now()}_${index}`,
        added_by_user_id: user.id,
        added_by_email: user.email
      };
    }).filter(Boolean);

    if (parsedPlayers.length === 0) {
      return Response.json({ error: 'No valid players found in input' }, { status: 400 });
    }

    // Optionally clear existing manual entries for this event
    if (clearExisting) {
      await supabase
        .from('manual_fields')
        .delete()
        .eq('event_id', eventId);
    }

    // Insert players (upsert to handle duplicates)
    const { data: insertedPlayers, error: insertError } = await supabase
      .from('manual_fields')
      .upsert(parsedPlayers, {
        onConflict: 'event_id,player_name',
        ignoreDuplicates: false
      })
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    // Log the admin action
    await supabase.from('admin_action_log').insert({
      action_type: 'field_load',
      action_description: `Admin manually loaded ${parsedPlayers.length} players for ${eventName}`,
      action_data: {
        eventId,
        eventName,
        playerCount: parsedPlayers.length,
        playerNames: parsedPlayers.map(p => p.player_name),
        clearedExisting: clearExisting || false
      },
      admin_user_id: user.id,
      admin_email: user.email
    });

    return Response.json({
      success: true,
      count: insertedPlayers?.length || parsedPlayers.length,
      players: insertedPlayers || parsedPlayers,
      message: `Successfully loaded ${parsedPlayers.length} players for ${eventName}`
    });

  } catch (error) {
    console.error('Admin load field error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to fetch manual field for an event
export async function GET(request) {
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

    // Get URL params
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return Response.json({ error: 'eventId required' }, { status: 400 });
    }

    const { data: players, error } = await supabase
      .from('manual_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('player_name');

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
      players: players.map(p => ({
        id: p.player_id,
        name: p.player_name,
        country: p.player_country
      }))
    });

  } catch (error) {
    console.error('Admin get field error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE endpoint to clear manual field
export async function DELETE(request) {
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

    // Get URL params
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return Response.json({ error: 'eventId required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('manual_fields')
      .delete()
      .eq('event_id', eventId);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Log the admin action
    await supabase.from('admin_action_log').insert({
      action_type: 'field_clear',
      action_description: `Admin cleared manual field for event ${eventId}`,
      action_data: { eventId },
      admin_user_id: user.id,
      admin_email: user.email
    });

    return Response.json({
      success: true,
      message: `Successfully cleared manual field for event ${eventId}`
    });

  } catch (error) {
    console.error('Admin clear field error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
