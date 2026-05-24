import { supabase } from './supabase'

export async function deductFilamentFromSpools(production) {
    if (!production.filament_data?.length) return

    for (const fil of production.filament_data) {
        if (!fil.spool_id || !fil.grams) continue

        const { data: spool } = await supabase
            .from('filament_spools')
            .select('id, current_weight_g, name')
            .eq('id', fil.spool_id)
            .maybeSingle()

        if (!spool) continue

        const newWeight = Math.max(0, (spool.current_weight_g || 0) - fil.grams)

        await supabase.from('filament_spools')
            .update({ current_weight_g: newWeight })
            .eq('id', fil.spool_id)

        await supabase.from('filament_spool_logs').insert([{
            spool_id: fil.spool_id,
            production_id: production.id,
            grams_used: fil.grams,
            notes: `${production.products?.name || production.description || 'Production'} — auto-deducted`,
        }])
    }
}