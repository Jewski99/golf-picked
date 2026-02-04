// File: app/api/admin/load-field/route.js
// Allows admin to manually load player field data

import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'dangajewski99@gmail.com';

// Helper to create Supabase client with error checking
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request) {
  console.log('[load-field] POST request received');

  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[load-field] No auth token provided');
      return Response.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    console.log('[load-field] Token received, length:', token?.length);

    // Create Supabase client with service role
    let supabase;
    try {
      supabase = getSupabaseClient();
      console.log('[load-field] Supabase client created');
    } catch (configError) {
      console.error('[load-field] Supabase config error:', configError.message);
      return Response.json({ error: 'Server configuration error. Please contact administrator.' }, { status: 500 });
    }

    // Verify the JWT and get user
    console.log('[load-field] Verifying user token...');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[load-field] Auth error:', authError?.message);
      return Response.json({ error: 'Invalid or expired token. Please sign in again.' }, { status: 401 });
    }
    console.log('[load-field] User verified:', user.email);

    // Verify admin status
    if (user.email !== ADMIN_EMAIL) {
      console.log('[load-field] User is not admin:', user.email);
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    // Parse request body
    console.log('[load-field] Parsing request body...');
    const { eventId, eventName, players, clearExisting } = await request.json();
    console.log('[load-field] Event:', eventName, 'Players count:', players?.length);

    // Validate required fields
    if (!eventId || !eventName || !players || !Array.isArray(players)) {
      return Response.json({ error: 'Missing required fields: eventId, eventName, and players array are required' }, { status: 400 });
    }

    // Parse player data (format: "Player Name, Country" per line)
    const parsedPlayers = players.map((playerStr, index) => {
      const trimmed = typeof playerStr === 'string' ? playerStr.trim() : '';
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
      return Response.json({ error: 'No valid players found in input. Format: "Player Name, Country" per line' }, { status: 400 });
    }

    // Optionally clear existing manual entries for this event
    if (clearExisting) {
      const { error: deleteError } = await supabase
        .from('manual_fields')
        .delete()
        .eq('event_id', eventId);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        // Continue anyway - table might not exist yet
      }
    }

    // Insert players (upsert to handle duplicates)
    console.log('[load-field] Inserting', parsedPlayers.length, 'players into manual_fields...');
    const { data: insertedPlayers, error: insertError } = await supabase
      .from('manual_fields')
      .upsert(parsedPlayers, {
        onConflict: 'event_id,player_name',
        ignoreDuplicates: false
      })
      .select();

    console.log('[load-field] Insert complete. Error:', insertError ? insertError.message : 'none');

    if (insertError) {
      console.error('[load-field] Insert error:', insertError);
      // If table doesn't exist, provide helpful message
      if (insertError.message?.includes('relation') && insertError.message?.includes('does not exist')) {
        return Response.json({
          error: 'Database table not found. Please run the SQL setup script (supabase_admin_tables.sql) in your Supabase dashboard.'
        }, { status: 500 });
      }
      return Response.json({ error: `Database error: ${insertError.message}` }, { status: 500 });
    }

    // Try to log the admin action (don't fail if table doesn't exist)
    try {
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
    } catch (logError) {
      console.error('Failed to log admin action (non-fatal):', logError);
    }

    console.log('[load-field] SUCCESS - Loaded', parsedPlayers.length, 'players');
    return Response.json({
      success: true,
      count: insertedPlayers?.length || parsedPlayers.length,
      players: insertedPlayers || parsedPlayers,
      message: `Successfully loaded ${parsedPlayers.length} players for ${eventName}`
    });

  } catch (error) {
    console.error('[load-field] FATAL ERROR:', error);
    return Response.json({ error: `Server error: ${error.message}` }, { status: 500 });
  }
}

// GET endpoint to fetch manual field for an event
export async function GET(request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // Create Supabase client with service role
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch (configError) {
      console.error('Supabase config error:', configError.message);
      return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Get URL params
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return Response.json({ error: 'eventId parameter is required' }, { status: 400 });
    }

    const { data: players, error } = await supabase
      .from('manual_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('player_name');

    if (error) {
      // If table doesn't exist, return empty array instead of error
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return Response.json({ players: [] });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
      players: (players || []).map(p => ({
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
      return Response.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // Create Supabase client with service role
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch (configError) {
      console.error('Supabase config error:', configError.message);
      return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Verify admin status
    if (user.email !== ADMIN_EMAIL) {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    // Get URL params
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return Response.json({ error: 'eventId parameter is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('manual_fields')
      .delete()
      .eq('event_id', eventId);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Log the admin action
    try {
      await supabase.from('admin_action_log').insert({
        action_type: 'field_clear',
        action_description: `Admin cleared manual field for event ${eventId}`,
        action_data: { eventId },
        admin_user_id: user.id,
        admin_email: user.email
      });
    } catch (logError) {
      console.error('Failed to log admin action (non-fatal):', logError);
    }

    return Response.json({
      success: true,
      message: `Successfully cleared manual field for event ${eventId}`
    });

  } catch (error) {
    console.error('Admin clear field error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
