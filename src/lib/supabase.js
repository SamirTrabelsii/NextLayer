import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('🔍 Supabase URL:', supabaseUrl)
console.log('🔍 Supabase Key length:', supabaseKey ? supabaseKey.length : 0)
console.log('🔍 Supabase Key type:', typeof supabaseKey)
console.log('🔍 Supabase Key value (first 5 chars):', supabaseKey ? supabaseKey.substring(0, 5) + '...' : 'none')

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'undefined' || supabaseKey === 'undefined') {
    console.error('❌ Supabase credentials missing or invalid in environment variables.')
} else {
    console.log('✅ Supabase credentials detected successfully')
}

export const supabase = (supabaseUrl && supabaseKey && supabaseUrl !== 'undefined' && supabaseKey !== 'undefined')
    ? createClient(supabaseUrl, supabaseKey)
    : null
