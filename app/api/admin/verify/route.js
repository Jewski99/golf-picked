// File: app/api/admin/verify/route.js
// Verifies if the current user is an admin (commissioner)

import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'dangajewski99@gmail.com';

export async function GET(request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ isAdmin: false, error: 'No authorization token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // Create Supabase client with service role for verification
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify the JWT and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return Response.json({ isAdmin: false, error: 'Invalid token' }, { status: 401 });
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
