// ─── Single source of truth for all cost calculations ───────
export const FILAMENT_PRICE_PER_KG = 35   // TND — update to your real price
export const ELECTRICITY_PER_HOUR = 0.15 // TND — update to your real rate

/**
 * Calculate production cost from raw inputs + BOM materials
 * Used consistently in Products, Productions, and anywhere else
 */
export function calcProductionCost(filamentGrams, printTimeHours, bomItems = []) {
    const filament = ((parseFloat(filamentGrams) || 0) / 1000) * FILAMENT_PRICE_PER_KG
    const electricity = (parseFloat(printTimeHours) || 0) * ELECTRICITY_PER_HOUR
    const materials = bomItems.reduce((sum, b) =>
        sum + ((b.quantity_per_unit || 1) * (b.materials?.cost_per_unit || 0)), 0)
    return parseFloat((filament + electricity + materials).toFixed(3))
}

/**
 * Calculate margin percentage
 * Returns null if data is incomplete
 */
export function calcMargin(sellingPrice, productionCost) {
    const sp = parseFloat(sellingPrice) || 0
    const pc = parseFloat(productionCost) || 0
    if (sp <= 0) return null
    return parseFloat(((sp - pc) / sp * 100).toFixed(1))
}

/**
 * Format cost for display
 */
export function fmtCost(value) {
    if (value == null || isNaN(value)) return '—'
    return `${parseFloat(value).toFixed(2)} TND`
}