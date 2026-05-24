// ─── Single source of truth for all cost calculations ───────
export const FILAMENT_PRICE_PER_KG = 35   // TND — update to your real price
export const ELECTRICITY_PER_HOUR = 0.15 // TND — update to your real rate

/**
 * Calculate production cost from raw inputs + BOM materials
 * Used consistently in Products, Productions, and anywhere else
 */
export function calcProductionCost(filamentGrams, printTimeHours, bomItems = [], rates = {}) {
    let grams = 0
    let hours = 0
    let bom = []
    let settings = {}

    if (filamentGrams && typeof filamentGrams === 'object' && !Array.isArray(filamentGrams)) {
        // Object format: calcProductionCost({ filament_grams, support_grams, print_time_hours }, settings)
        const obj = filamentGrams
        const ratesObj = printTimeHours || {}
        
        grams = (parseFloat(obj.filament_grams) || 0) + (parseFloat(obj.support_grams) || 0)
        hours = parseFloat(obj.print_time_hours) || 0
        bom = Array.isArray(bomItems) ? bomItems : []
        settings = ratesObj
    } else {
        // Traditional format: calcProductionCost(filamentGrams, printTimeHours, bomItems, rates)
        grams = parseFloat(filamentGrams) || 0
        hours = parseFloat(printTimeHours) || 0
        bom = Array.isArray(bomItems) ? bomItems : []
        settings = rates || {}
    }

    const filamentRate = settings.filament_price_per_kg ?? 35
    const electricRate = settings.electricity_per_hour ?? 0.15

    const filament = (grams / 1000) * filamentRate
    const electricity = hours * electricRate
    const materials = bom.reduce((sum, b) =>
        sum + ((b.quantity_per_unit || 1) * (b.materials?.cost_per_unit || 0)), 0)

    const total = parseFloat((filament + electricity + materials).toFixed(3))

    // Return a Number object with custom .total property for full compatibility
    const resultNum = new Number(total)
    resultNum.total = total
    return resultNum
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