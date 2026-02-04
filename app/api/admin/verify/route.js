// File: app/api/admin/verify/route.js
// Verifies if the current user is an admin (commissioner)

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

export async function GET(request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ isAdmin: false, error: 'No authorization token provided' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // Create Supabase client with service role for verification
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch (configError) {
      console.error('Supabase config error:', configError.message);
      return Response.json({ isAdmin: false, error: 'Server configuration error' }, { status: 500 });
    }

    // Verify the JWT and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return Response.json({ isAdmin: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    // Check if user email matches admin email
    const isAdmin = user.email === ADMIN_EMAIL;

    return Response.json({
      isAdmin,
      email: user.email,
      userId: user.id
    });

  } catch (error) {
    console.error('Admin verification error:', error);
    return Response.json({ isAdmin: false, error: error.message }, { status: 500 });
  }
}
