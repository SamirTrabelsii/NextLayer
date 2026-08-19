import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Only allow POST and DELETE
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  // Keys
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error: missing Supabase keys in Vercel Environment Variables' });
  }

  // Initialize standard Supabase client with anon key for verifying the user
  const supabase = createClient(supabaseUrl, anonKey);
  
  // Verify the user is logged in using their token
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // Initialize admin client to query profiles and manage users
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Check if the caller is an admin
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required to manage users' });
  }

  // --- CREATE USER ---
  if (req.method === 'POST') {
    const { email, password, full_name, role, reseller_client_id } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      // 1. Create auth user via Supabase admin API
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) throw authError;

      // 2. Insert into profiles
      const { error: insertError } = await supabaseAdmin.from('profiles').insert([{
        id: authData.user.id,
        email,
        full_name,
        role: role || 'reseller',
        reseller_client_id: role === 'reseller' ? reseller_client_id : null,
      }]);

      if (insertError) {
        // Rollback user creation if profile insertion fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw insertError;
      }

      return res.status(200).json({ success: true, user: authData.user });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  // --- DELETE USER ---
  if (req.method === 'DELETE') {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    try {
      // Delete auth user (profiles record usually deletes via cascade, but we delete it explicitly just in case)
      const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delError) throw delError;

      const { error: profileDelError } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
      if (profileDelError) console.error('Failed to explicitly delete profile (might have cascaded):', profileDelError);

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
}
