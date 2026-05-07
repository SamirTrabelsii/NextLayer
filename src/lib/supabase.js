import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing in .env file')
} else {
    console.log('✅ Supabase connected to:', supabaseUrl)
}

export const supabase = createClient(supabaseUrl, supabaseKey)