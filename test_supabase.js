import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
    console.log("Fetching orders...")
    const { data: o, error: e1 } = await supabase.from('orders').select(`
        id, type, status, total_price, is_paid, paid_at, deadline, notes,
        custom_description, dimensions, reference_notes, reference_image_url, stl_url, created_at,
        clients(id, name, phone),
        order_items(id, quantity, unit_price, custom_description, product_id, dimensions, reference_notes, reference_image_url, stl_url, is_composite, fulfilled_quantity, products(id, name, product_type)),
        productions(id, status, description, product_id, is_composite)
    `).order('created_at', { ascending: false })

    if (e1) {
        console.error("Order fetch error:", e1)
    } else {
        console.log("Orders fetched successfully. Count:", o?.length)
    }

    console.log("\nFetching products...")
    const { data: p, error: e2 } = await supabase.from('products').select('id, name, selling_price, category, product_type').eq('is_active', true).order('name')
    if (e2) {
        console.error("Products fetch error:", e2)
    } else {
        console.log("Products fetched successfully. Count:", p?.length)
    }
}

test()
