import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, Printer, Clock, Zap, PackagePlus, ArrowRight } from 'lucide-react'
import { useSettings } from '../lib/SettingsContext'

// ─── CONSTANTS ────────────────────────────────────────────────
const STATUSES = [
    { key: 'queued', label: 'Queued', emoji: '⏳', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
    { key: 'printing', label: 'Printing', emoji: '🖨️', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    { key: 'done', label: 'Done', emoji: '✅', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    { key: 'failed', label: 'Failed', emoji: '❌', color: 'bg-red-100 text-red-600', dot: 'bg-red-400' },
]

const FLOW = ['queued', 'printing', 'done']
const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'Resin', 'Other']
const CATEGORIES = ['Keychains', 'Clickers', 'Decorations', 'Custom Orders']

// Pure function — rates passed as arguments from settings context
function calcCost(grams, hours, filamentRate = 35, electricRate = 0.15) {
    const f = ((parseFloat(grams) || 0) / 1000) * filamentRate
    const e = (parseFloat(hours) || 0) * electricRate
    return parseFloat((f + e).toFixed(2))
}

const si = key => STATUSES.find(s => s.key === key) ?? STATUSES[0]

const getNext = status => {
    const idx = FLOW.indexOf(status)
    if (idx < 0 || idx >= FLOW.length - 1) return null
    return FLOW[idx + 1]
}

// ─── EMPTY FORMS ──────────────────────────────────────────────
const emptyForm = {
    order_id: '', product_id: '', description: '', quantity: 1,
    material: 'PLA', color: '', filament_grams: '',
    print_time_hours: '', actual_cost: '', status: 'queued', notes: '',
}
const emptyProduct = { name: '', category: 'Custom Orders', selling_price: '', production_cost: '' }

// ─── COMPONENT ────────────────────────────────────────────────
export default function Productions() {
    const [productions, setProductions] = useState([])
    const [orders, setOrders] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [filterStatus, setFilter] = useState('active')
    const [showModal, setShowModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [saving, setSaving] = useState(false)
    const [advancing, setAdvancing] = useState(null) // id of production being advanced

    const [showNewProduct, setShowNewProduct] = useState(false)
    const [newProduct, setNewProduct] = useState(emptyProduct)
    const [savingProduct, setSavingProduct] = useState(false)

    const { settings } = useSettings()

    useEffect(() => { fetchAll() }, [])

    // ─── FETCH ──────────────────────────────────────────────────
    async function fetchAll() {
        setLoading(true)
        try {
            const [{ data: pr }, { data: or }, { data: pd }] = await Promise.all([
                supabase.from('productions').select(`
          id, order_id, product_id, description, quantity,
          material, color, filament_grams, print_time_hours,
          actual_cost, status, notes, created_at,
          orders(id, custom_description, type, status, clients(name)),
          products(id, name, production_cost)
        `).order('created_at', { ascending: false }),

                supabase.from('orders')
                    .select('id, custom_description, type, status, clients(name)')
                    .not('status', 'in', '("paid","cancelled","delivered")')
                    .order('created_at', { ascending: false }),

                supabase.from('products')
                    .select('id, name, selling_price, category, production_cost')
                    .eq('is_active', true)
                    .order('name'),
            ])
            setProductions(pr || [])
            setOrders(or || [])
            setProducts(pd || [])
        } catch (err) {
            console.error(err)
            setError('Failed to load. Please refresh.')
        } finally {
            setLoading(false)
        }
    }

    // ─── MODAL ──────────────────────────────────────────────────
    function openAdd() {
        setForm(emptyForm)
        setEditing(null)
        setShowNewProduct(false)
        setShowModal(true)
    }

    function openEdit(p) {
        setForm({
            order_id: p.order_id || '',
            product_id: p.product_id || '',
            description: p.description || '',
            quantity: p.quantity || 1,
            material: p.material || 'PLA',
            color: p.color || '',
            filament_grams: p.filament_grams || '',
            print_time_hours: p.print_time_hours || '',
            actual_cost: p.actual_cost || '',
            status: p.status,
            notes: p.notes || '',
        })
        setEditing(p.id)
        setShowModal(true)
    }

    function closeModal() {
        setShowModal(false)
        setForm(emptyForm)
        setEditing(null)
        setShowNewProduct(false)
    }

    // ─── FORM CHANGE ────────────────────────────────────────────
    function handleChange(e) {
        const { name, value } = e.target
        setForm(prev => {
            const updated = { ...prev, [name]: value }
            // Auto-calculate cost
            if (name === 'filament_grams' || name === 'print_time_hours') {
                const g = parseFloat(name === 'filament_grams' ? value : prev.filament_grams) || 0
                const h = parseFloat(name === 'print_time_hours' ? value : prev.print_time_hours) || 0
                updated.actual_cost = calcCost(g, h, settings.filament_price_per_kg, settings.electricity_per_hour) || ''
            }
            // Auto-fill description from order
            if (name === 'order_id' && value && !updated.description) {
                const order = orders.find(o => o.id === value)
                if (order) updated.description = order.custom_description || ''
            }
            return updated
        })
    }

    // ─── INLINE PRODUCT CREATE ───────────────────────────────────
    async function createProductInline() {
        if (!newProduct.name.trim()) return
        setSavingProduct(true)
        try {
            const { data, error } = await supabase.from('products').insert([{
                name: newProduct.name,
                category: newProduct.category,
                selling_price: parseFloat(newProduct.selling_price) || null,
                production_cost: parseFloat(newProduct.production_cost) || null,
                is_active: true,
            }]).select().single()
            if (error) throw error
            setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
            setForm(f => ({ ...f, product_id: data.id }))
            setShowNewProduct(false)
            setNewProduct(emptyProduct)
        } catch (err) {
            console.error(err)
        } finally {
            setSavingProduct(false)
        }
    }

    // ─── SAVE ───────────────────────────────────────────────────
    async function saveProd() {
        if (!form.description && !form.product_id) return
        setSaving(true)
        try {
            const payload = {
                order_id: form.order_id || null,
                product_id: form.product_id || null,
                description: form.description || null,
                quantity: parseInt(form.quantity) || 1,
                material: form.material,
                color: form.color || null,
                filament_grams: parseFloat(form.filament_grams) || null,
                print_time_hours: parseFloat(form.print_time_hours) || null,
                actual_cost: parseFloat(form.actual_cost) || null,
                status: form.status,
                notes: form.notes || null,
            }
            if (editing) {
                await supabase.from('productions').update(payload).eq('id', editing)
            } else {
                await supabase.from('productions').insert([payload])
            }
            closeModal()
            await fetchAll()
        } catch (err) {
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    // ─── ADVANCE TO NEXT STATUS ──────────────────────────────────
    async function advanceProduction(prod) {
        const next = getNext(prod.status)
        if (!next) return

        setAdvancing(prod.id)
        setError('')
        try {
            // ── When moving to DONE ────────────────────────────────
            if (next === 'done') {

                // 1. Consume BOM materials if product linked
                if (prod.product_id) {
                    const qty = parseInt(prod.quantity) || 1
                    const { data: bom } = await supabase
                        .from('product_materials')
                        .select('material_id, quantity_per_unit, materials(id, name, quantity_available)')
                        .eq('product_id', prod.product_id)

                    const materialProblems = []
                    for (const b of (bom || [])) {
                        const needed = (b.quantity_per_unit || 1) * qty
                        const available = b.materials?.quantity_available ?? 0
                        if (available < needed) {
                            materialProblems.push(`${b.materials?.name}: need ${needed}, have ${available}`)
                        }
                    }

                    if (materialProblems.length > 0) {
                        setError(
                            `⚠️ Low materials — production still marked done but check your stock:\n` +
                            materialProblems.map(p => `• ${p}`).join('\n')
                        )
                        // Don't block — just warn. User can adjust manually.
                    }

                    // Consume regardless (warn only)
                    for (const b of (bom || [])) {
                        const needed = (b.quantity_per_unit || 1) * qty
                        const mat = b.materials
                        if (!mat) continue
                        await supabase.from('materials').update({
                            quantity_available: Math.max(0, (mat.quantity_available || 0) - needed),
                        }).eq('id', mat.id)
                        await supabase.from('material_movements').insert([{
                            material_id: mat.id,
                            type: 'used',
                            quantity: needed,
                            is_positive: false,
                            notes: `Production — ${prod.products?.name || prod.description || ''} ×${qty}`,
                        }])
                    }
                }

                // 2. Sync product production_cost if actual_cost known
                if (prod.product_id && prod.actual_cost) {
                    await supabase.from('products')
                        .update({ production_cost: prod.actual_cost })
                        .eq('id', prod.product_id)
                }

                // 3a. No order → add finished items to stock
                if (!prod.order_id && prod.product_id) {
                    const qty = parseInt(prod.quantity) || 1
                    const { data: existing } = await supabase
                        .from('stock')
                        .select('id, quantity_available')
                        .eq('product_id', prod.product_id)
                        .maybeSingle()

                    if (existing) {
                        await supabase.from('stock').update({
                            quantity_available: (existing.quantity_available || 0) + qty,
                            updated_at: new Date().toISOString(),
                        }).eq('id', existing.id)
                    } else {
                        await supabase.from('stock').insert([{
                            product_id: prod.product_id,
                            quantity_available: qty,
                            quantity_with_reseller: 0,
                        }])
                    }
                    await supabase.from('stock_movements').insert([{
                        product_id: prod.product_id,
                        type: 'produced',
                        quantity: qty,
                        is_positive: true,
                        notes: `Production completed`,
                    }])
                }

                // 3b. Has order → advance order to 'ready'
                if (prod.order_id) {
                    const { data: order } = await supabase
                        .from('orders')
                        .select('status')
                        .eq('id', prod.order_id)
                        .single()

                    if (order?.status === 'in_production') {
                        await supabase.from('orders')
                            .update({ status: 'ready' })
                            .eq('id', prod.order_id)
                    }
                }
            }

            // ── When moving to PRINTING ───────────────────────────
            if (next === 'printing' && prod.order_id) {
                const { data: order } = await supabase
                    .from('orders')
                    .select('status')
                    .eq('id', prod.order_id)
                    .single()

                if (order && ['confirmed', 'quoted', 'new'].includes(order.status)) {
                    await supabase.from('orders')
                        .update({ status: 'in_production' })
                        .eq('id', prod.order_id)
                }
            }

            // ── Update production status ──────────────────────────
            await supabase.from('productions')
                .update({ status: next })
                .eq('id', prod.id)

            await fetchAll()

        } catch (err) {
            console.error(err)
            setError(err.message || 'Failed to update production.')
        } finally {
            setAdvancing(null)
        }
    }

    // ─── MARK AS FAILED ─────────────────────────────────────────
    async function markFailed(prod) {
        setAdvancing(prod.id)
        try {
            await supabase.from('productions').update({ status: 'failed' }).eq('id', prod.id)
            // If order was in_production, revert to confirmed
            if (prod.order_id) {
                const { data: order } = await supabase
                    .from('orders').select('status').eq('id', prod.order_id).single()
                if (order?.status === 'in_production') {
                    await supabase.from('orders')
                        .update({ status: 'confirmed' })
                        .eq('id', prod.order_id)
                }
            }
            await fetchAll()
        } catch (err) {
            console.error(err)
        } finally {
            setAdvancing(null)
        }
    }

    async function deleteProd(id) {
        await supabase.from('productions').delete().eq('id', id)
        setDeleting(null)
        fetchAll()
    }

    // ─── FILTERS ────────────────────────────────────────────────
    const filtered = productions.filter(p => {
        if (filterStatus === 'active') return ['queued', 'printing'].includes(p.status)
        if (filterStatus === 'done') return p.status === 'done'
        if (filterStatus === 'failed') return p.status === 'failed'
        return true
    })

    const count = key => productions.filter(p => p.status === key).length

    // ─── RENDER ─────────────────────────────────────────────────
    return (
        <div className="max-w-4xl mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Productions</h1>
                    <p className="text-sm text-slate-500">Print job tracker</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
                    <Plus size={18} /> New Job
                </button>
            </div>

            {/* Global error */}
            {error && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700 whitespace-pre-line">
                    {error}
                    <button onClick={() => setError('')} className="block mt-1 text-amber-500 underline text-xs">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                    { key: 'queued', label: '⏳ Queued', value: count('queued'), cls: 'text-slate-700' },
                    { key: 'printing', label: '🖨️ Printing', value: count('printing'), cls: 'text-yellow-600' },
                    { key: 'done', label: '✅ Done', value: count('done'), cls: 'text-emerald-600' },
                    { key: 'failed', label: '❌ Failed', value: count('failed'), cls: 'text-red-500' },
                ].map(s => (
                    <div key={s.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                        <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {[
                    { key: 'active', label: '🔥 Active' },
                    { key: 'done', label: '✅ Done' },
                    { key: 'failed', label: '❌ Failed' },
                    { key: 'all', label: 'All' },
                ].map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-colors
              ${filterStatus === f.key
                                ? 'bg-sky-500 text-white'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Print queue */}
            {filterStatus === 'active' && filtered.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
                    <p className="text-sm font-bold text-amber-700 mb-3">
                        🖨️ Queue — {filtered.length} job{filtered.length > 1 ? 's' : ''}
                    </p>
                    <div className="space-y-2">
                        {[...filtered]
                            .sort((a, b) => a.status === 'printing' ? -1 : b.status === 'printing' ? 1 : 0)
                            .map((p, idx) => (
                                <div key={p.id}
                                    className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-amber-100">
                                    <span className="text-slate-400 text-xs font-bold w-5">{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">
                                            {p.products?.name || p.description || 'Custom job'}
                                            {(p.quantity || 1) > 1 && (
                                                <span className="text-slate-400 font-normal"> ×{p.quantity}</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {p.orders?.clients?.name
                                                ? `📋 ${p.orders.clients.name}`
                                                : '📦 Stock production'}
                                            {p.material && ` · ${p.material}`}
                                        </p>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-lg font-semibold flex-shrink-0 ${si(p.status).color}`}>
                                        {si(p.status).emoji} {si(p.status).label}
                                    </span>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Productions list */}
            {loading ? (
                <div className="text-center py-20 text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <Printer size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-400 font-medium">No productions here</p>
                    <p className="text-slate-400 text-sm">Create a new print job to get started</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map(p => {
                        const s = si(p.status)
                        const next = getNext(p.status)
                        const nextSI = next ? si(next) : null
                        const isActive = advancing === p.id
                        const flowIdx = FLOW.indexOf(p.status)

                        return (
                            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                                <div className="p-4">

                                    {/* Top row */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                                                    {s.emoji} {s.label}
                                                </span>
                                                {p.material && (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                                        {p.material}
                                                    </span>
                                                )}
                                                {p.color && (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                                        {p.color}
                                                    </span>
                                                )}
                                                {!p.order_id && (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
                                                        📦 For stock
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-semibold text-slate-800">
                                                {p.products?.name || p.description || 'Custom job'}
                                                {(p.quantity || 1) > 1 && (
                                                    <span className="text-slate-400 font-normal text-sm"> ×{p.quantity}</span>
                                                )}
                                            </h3>
                                            {p.orders?.clients?.name && (
                                                <p className="text-xs text-slate-400 mt-0.5">
                                                    📋 Order: {p.orders.clients.name}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex gap-1 ml-2 flex-shrink-0">
                                            <button onClick={() => openEdit(p)}
                                                className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-colors text-sm">
                                                ✏️
                                            </button>
                                            <button onClick={() => setDeleting(p)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Stats row */}
                                    {(p.filament_grams || p.print_time_hours || p.actual_cost) && (
                                        <div className="flex flex-wrap gap-4 text-sm py-2.5 border-t border-b border-slate-50 mb-3">
                                            {p.filament_grams && (
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <span>🧵</span>
                                                    <span className="font-semibold">{p.filament_grams}g</span>
                                                </div>
                                            )}
                                            {p.print_time_hours && (
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <Clock size={14} className="text-slate-400" />
                                                    <span className="font-semibold">{p.print_time_hours}h</span>
                                                </div>
                                            )}
                                            {p.actual_cost && (
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <Zap size={14} className="text-slate-400" />
                                                    <span className="font-semibold">{p.actual_cost} TND</span>
                                                    <span className="text-slate-400 text-xs">cost</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Progress bar */}
                                    {p.status !== 'failed' && (
                                        <div className="flex gap-1 mb-3">
                                            {FLOW.map((key, idx) => (
                                                <div key={key}
                                                    className={`h-1 flex-1 rounded-full transition-colors
                            ${idx <= flowIdx ? si(key).dot : 'bg-slate-100'}`} />
                                            ))}
                                        </div>
                                    )}

                                    {/* Notes */}
                                    {p.notes && (
                                        <p className="text-xs text-slate-400 italic mb-3">"{p.notes}"</p>
                                    )}

                                    {/* Done message */}
                                    {p.status === 'done' && (
                                        <div className="text-xs text-emerald-600 font-medium mb-3">
                                            {p.order_id ? '✅ Order advanced to Ready' : '✅ Added to stock'}
                                        </div>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div className="px-4 pb-4 space-y-2">

                                    {/* Primary: advance to next */}
                                    {next && p.status !== 'failed' && (
                                        <button
                                            onClick={() => advanceProduction(p)}
                                            disabled={!!advancing}
                                            className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all border
                        ${next === 'done'
                                                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                                    : next === 'printing'
                                                        ? 'bg-yellow-400 hover:bg-yellow-500 text-white border-yellow-400 shadow-sm'
                                                        : 'bg-slate-50 hover:bg-sky-50 hover:text-sky-600 border-slate-200 hover:border-sky-200 text-slate-600'}
                        disabled:opacity-50`}>
                                            {isActive ? (
                                                <span className="animate-pulse">Updating...</span>
                                            ) : (
                                                <>
                                                    <ArrowRight size={15} />
                                                    {next === 'printing' ? '🖨️ Start Printing' : '✅ Mark as Done'}
                                                </>
                                            )}
                                        </button>
                                    )}

                                    {/* Secondary: mark as failed (only when active) */}
                                    {['queued', 'printing'].includes(p.status) && (
                                        <button
                                            onClick={() => markFailed(p)}
                                            disabled={!!advancing}
                                            className="w-full py-2 rounded-xl text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all disabled:opacity-50">
                                            ❌ Mark as failed
                                        </button>
                                    )}

                                    {/* Retry from failed */}
                                    {p.status === 'failed' && (
                                        <button
                                            onClick={async () => {
                                                setAdvancing(p.id)
                                                await supabase.from('productions').update({ status: 'queued' }).eq('id', p.id)
                                                await fetchAll()
                                                setAdvancing(null)
                                            }}
                                            disabled={!!advancing}
                                            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-all disabled:opacity-50">
                                            🔄 Retry — Back to Queue
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════
          ADD / EDIT MODAL
      ═══════════════════════════════════════════════════════ */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl
            max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">

                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">
                                {editing ? 'Edit Job' : 'New Print Job'}
                            </h2>
                            <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">

                            {/* Linked order */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Linked Order
                                    <span className="text-slate-400 font-normal ml-1">(leave empty for stock production)</span>
                                </label>
                                <select name="order_id" value={form.order_id} onChange={handleChange}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                    <option value="">📦 No order — producing for stock</option>
                                    {orders.map(o => (
                                        <option key={o.id} value={o.id}>
                                            {o.clients?.name} — {o.custom_description || 'Standard order'}
                                        </option>
                                    ))}
                                </select>
                                {!form.order_id && (
                                    <p className="text-xs text-emerald-600 mt-1 font-medium">
                                        📦 When marked Done, quantity will be added to stock automatically
                                    </p>
                                )}
                            </div>

                            {/* Product */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Product</label>
                                <select name="product_id" value={form.product_id} onChange={handleChange}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                    <option value="">Custom / not in catalogue</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>

                                <button onClick={() => setShowNewProduct(!showNewProduct)}
                                    className="mt-1.5 text-xs text-sky-500 hover:text-sky-700 flex items-center gap-1">
                                    <PackagePlus size={12} /> Add new product to catalogue
                                </button>

                                {showNewProduct && (
                                    <div className="mt-2 bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2">
                                        <p className="text-xs font-bold text-sky-700">New Product</p>
                                        <input value={newProduct.name}
                                            onChange={e => setNewProduct(f => ({ ...f, name: e.target.value }))}
                                            placeholder="Product name *"
                                            className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                        <div className="grid grid-cols-2 gap-2">
                                            <select value={newProduct.category}
                                                onChange={e => setNewProduct(f => ({ ...f, category: e.target.value }))}
                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none">
                                                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                            </select>
                                            <input type="number" value={newProduct.selling_price}
                                                onChange={e => setNewProduct(f => ({ ...f, selling_price: e.target.value }))}
                                                placeholder="Price (TND)"
                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowNewProduct(false)}
                                                className="flex-1 py-2 text-xs border border-slate-200 rounded-lg hover:bg-white">
                                                Cancel
                                            </button>
                                            <button onClick={createProductInline}
                                                disabled={savingProduct || !newProduct.name.trim()}
                                                className="flex-1 py-2 text-xs bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 font-semibold">
                                                {savingProduct ? 'Adding...' : '+ Create & Select'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Description (when no product) */}
                            {!form.product_id && (
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Description *</label>
                                    <input name="description" value={form.description} onChange={handleChange}
                                        placeholder="What are you printing?"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            )}

                            {/* Quantity + Material + Color */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Quantity</label>
                                    <input name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Material</label>
                                    <select name="material" value={form.material} onChange={handleChange}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                        {MATERIALS.map(m => <option key={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Color</label>
                                    <input name="color" value={form.color} onChange={handleChange}
                                        placeholder="Black..."
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            {/* Filament + Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Filament (g)</label>
                                    <input name="filament_grams" type="number" value={form.filament_grams} onChange={handleChange}
                                        placeholder="e.g. 85"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Print time (h)</label>
                                    <input name="print_time_hours" type="number" value={form.print_time_hours} onChange={handleChange}
                                        placeholder="e.g. 3.5"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            {/* Cost */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Production Cost (TND)
                                    <span className="text-xs text-sky-500 ml-1 font-normal">auto-calculated</span>
                                </label>
                                <input name="actual_cost" type="number" value={form.actual_cost} onChange={handleChange}
                                    placeholder="0.00"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-sky-50 font-semibold" />
                                <p className="text-xs text-slate-400 mt-1">
                                    Based on {settings.filament_price_per_kg} TND/kg filament + {settings.electricity_per_hour} TND/hr electricity
                                </p>
                            </div>

                            {/* Status */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-2">Status</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {STATUSES.map(s => (
                                        <button key={s.key}
                                            onClick={() => setForm(f => ({ ...f, status: s.key }))}
                                            className={`py-2.5 rounded-xl text-sm font-medium border transition-all
                        ${form.status === s.key
                                                    ? 'border-sky-400 bg-sky-50 text-sky-700 ring-2 ring-sky-200'
                                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
                                            {s.emoji} {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Notes</label>
                                <textarea name="notes" value={form.notes} onChange={handleChange}
                                    placeholder="Any notes about this print job..."
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                            </div>
                        </div>

                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={closeModal}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={saveProd}
                                disabled={saving || (!form.description && !form.product_id)}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Job'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleting && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete job?</h3>
                        <p className="text-slate-500 text-sm mb-5">
                            "{deleting.products?.name || deleting.description}" will be removed.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleting(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={() => deleteProd(deleting.id)}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}