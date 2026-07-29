import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SECRET_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function test() {
    const { data, error } = await supabase.from('order_items').select('*').limit(1)
    if (error) {
        console.error("Error:", error)
    } else {
        console.log("Order items columns:", data && data.length > 0 ? Object.keys(data[0]) : "No data, but query succeeded.")
    }
}

test()
