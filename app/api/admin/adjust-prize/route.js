// File: app/api/admin/adjust-prize/route.js
// Allows admin to manually adjust user prize money

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
    const { userId, username, amount, reason, eventId, eventName } = await request.json();

    // Validate required fields
    if (!userId || !username || amount === undefined || amount === null) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const adjustmentAmount = parseFloat(amount);
    if (isNaN(adjustmentAmount)) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Insert the adjustment record
    const { data: adjustment, error: insertError } = await supabase
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
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    // Update the season_standings manual_adjustment column
    const { data: currentStandings } = await supabase
      .from('season_standings')
      .select('total_winnings, manual_adjustment')
      .eq('user_id', userId)
      .single();

    if (currentStandings) {
      const newManualAdjustment = (currentStandings.manual_adjustment || 0) + adjustmentAmount;
      const newTotalWinnings = (currentStandings.total_winnings || 0) + adjustmentAmount;

      await supabase
        .from('season_standings')
        .update({
          manual_adjustment: newManualAdjustment,
          total_winnings: newTotalWinnings
        })
        .eq('user_id', userId);
    }

    // Log the admin action
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

    return Response.json({
      success: true,
      adjustment: adjustment,
      message: `Successfully adjusted ${username}'s prize money by ${adjustmentAmount >= 0 ? '+' : ''}$${adjustmentAmount.toLocaleString()}`
    });

  } catch (error) {
    console.error('Admin prize adjustment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// GET endpoint to fetch adjustment history
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
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ adjustments });

  } catch (error) {
    console.error('Admin get adjustments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
