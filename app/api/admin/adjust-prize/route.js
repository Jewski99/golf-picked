// File: app/api/admin/adjust-prize/route.js
// Allows admin to manually adjust user prize money

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
      return Response.json({ error: 'Server configuration error. Please contact administrator.' }, { status: 500 });
    }

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError?.message);
      return Response.json({ error: 'Invalid or expired token. Please sign in again.' }, { status: 401 });
    }

    // Verify admin status
    if (user.email !== ADMIN_EMAIL) {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    // Parse request body
    const { userId, username, amount, reason, eventId, eventName } = await request.json();

    // Validate required fields
    if (!userId || !username || amount === undefined || amount === null) {
      return Response.json({ error: 'Missing required fields: userId, username, and amount are required' }, { status: 400 });
    }

    const adjustmentAmount = parseFloat(amount);
    if (isNaN(adjustmentAmount)) {
      return Response.json({ error: 'Invalid amount: must be a valid number' }, { status: 400 });
    }

    // Get current standings
    const { data: currentStandings } = await supabase
      .from('season_standings')
      .select('total_winnings, manual_adjustment')
      .eq('user_id', userId)
      .single();

    // Try to insert adjustment record (table might not exist)
    try {
      await supabase
        .from('admin_adjustments')
        .insert({
          user_id: userId,
          username: username,
          amount: adjustmentAmount,
          reason: reason || null,
          event_id: eventId || null,
          event_name: eventName || null,
          admin_user_id: user.id,
          admin_email: user.email
        });
    } catch (adjError) {
      console.error('Failed to insert adjustment record (non-fatal):', adjError);
    }

    // Update the season_standings
    if (currentStandings) {
      const newTotalWinnings = (currentStandings.total_winnings || 0) + adjustmentAmount;

      const { error: updateError } = await supabase
        .from('season_standings')
        .update({
          total_winnings: newTotalWinnings
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Update error:', updateError);
        return Response.json({ error: `Database error: ${updateError.message}` }, { status: 500 });
      }
    } else {
      return Response.json({ error: 'User not found in season standings' }, { status: 404 });
    }

    // Try to log the admin action (don't fail if table doesn't exist)
    try {
      await supabase.from('admin_action_log').insert({
        action_type: 'prize_adjustment',
        action_description: `Admin adjusted prize money for ${username}: ${adjustmentAmount >= 0 ? '+' : ''}$${adjustmentAmount.toLocaleString()}`,
        target_user_id: userId,
        target_username: username,
        action_data: {
          amount: adjustmentAmount,
          reason: reason || 'No reason provided',
          eventId,
          eventName,
          previousTotal: currentStandings?.total_winnings || 0,
          newTotal: (currentStandings?.total_winnings || 0) + adjustmentAmount
        },
        admin_user_id: user.id,
        admin_email: user.email
      });
    } catch (logError) {
      console.error('Failed to log admin action (non-fatal):', logError);
    }

    return Response.json({
      success: true,
      message: `Successfully adjusted ${username}'s prize money by ${adjustmentAmount >= 0 ? '+' : ''}$${adjustmentAmount.toLocaleString()}`
    });

  } catch (error) {
    console.error('Admin prize adjustment error:', error);
    return Response.json({ error: `Server error: ${error.message}` }, { status: 500 });
  }
}

// GET endpoint to fetch adjustment history
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

    // Verify admin status
    if (user.email !== ADMIN_EMAIL) {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    // Get URL params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    let query = supabase
      .from('admin_adjustments')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: adjustments, error } = await query.limit(50);

    if (error) {
      // If table doesn't exist, return empty array
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return Response.json({ adjustments: [] });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ adjustments: adjustments || [] });

  } catch (error) {
    console.error('Admin get adjustments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
