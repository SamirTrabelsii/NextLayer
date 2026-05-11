import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, Printer, Clock, Zap, PackagePlus } from 'lucide-react'
import { calcProductionCost, FILAMENT_PRICE_PER_KG, ELECTRICITY_PER_HOUR } from '../lib/costUtils'
// const FILAMENT_PRICE_PER_KG = 35
// const ELECTRICITY_PER_HOUR = 0.15


const STATUSES = [
    { key: 'queued', label: 'Queued', emoji: '⏳', color: 'bg-slate-100 text-slate-600' },
    { key: 'printing', label: 'Printing', emoji: '🖨️', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'done', label: 'Done', emoji: '✅', color: 'bg-emerald-100 text-emerald-700' },
    { key: 'failed', label: 'Failed', emoji: '❌', color: 'bg-red-100 text-red-600' },
]
const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'Resin', 'Other']
const CATEGORIES = ['Keychains', 'Clickers', 'Decorations', 'Custom Orders']


const empty = {
    order_id: '', product_id: '', description: '', quantity: 1,
    material: 'PLA', color: '', filament_grams: '',
    print_time_hours: '', actual_cost: '', status: 'queued', notes: '',
}

const emptyProduct = { name: '', category: 'Custom Orders', selling_price: '', production_cost: '' }

export default function Productions() {
    const [productions, setProductions] = useState([])
    const [orders, setOrders] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [form, setForm] = useState(empty)
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [saving, setSaving] = useState(false)
    const [filterStatus, setFilter] = useState('active')
    const [showNewProduct, setShowNewProduct] = useState(false)
    const [newProduct, setNewProduct] = useState(emptyProduct)
    const [savingProduct, setSavingProduct] = useState(false)
    const [stockError, setStockError] = useState('')

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        const [{ data: pr }, { data: or }, { data: pd }] = await Promise.all([
            supabase.from('productions').select(`
        *, orders(id, custom_description, type, status, clients(name)),
        products(name, id)
      `).order('created_at', { ascending: false }),
            supabase.from('orders')
                .select('id, custom_description, type, status, clients(name)')
                .not('status', 'in', '("paid","cancelled","delivered")')
                .order('created_at', { ascending: false }),
            supabase.from('products').select('id,name,selling_price,category').eq('is_active', true).order('name'),
        ])
        setProductions(pr || [])
        setOrders(or || [])
        setProducts(pd || [])
        setLoading(false)
    }

    function openAdd() { setForm(empty); setEditing(null); setShowModal(true) }
    function openEdit(p) {
        setForm({
            order_id: p.order_id || '', product_id: p.product_id || '',
            description: p.description || '', quantity: p.quantity || 1,
            material: p.material || 'PLA', color: p.color || '',
            filament_grams: p.filament_grams || '', print_time_hours: p.print_time_hours || '',
            actual_cost: p.actual_cost || '', status: p.status, notes: p.notes || '',
        })
        setEditing(p.id); setShowModal(true)
    }
    function closeModal() { setShowModal(false); setForm(empty); setEditing(null); setShowNewProduct(false) }

    function handleChange(e) {
        const { name, value } = e.target
        const updated = { ...form, [name]: value }

        // Auto-calculate cost whenever filament or time changes
        if (name === 'filament_grams' || name === 'print_time_hours') {
            updated.actual_cost = calcProductionCost(
                name === 'filament_grams' ? value : form.filament_grams,
                name === 'print_time_hours' ? value : form.print_time_hours
                // Note: BOM materials not included here since they're on the product
                // The product's cost already includes materials
            )
        }

        if (name === 'order_id' && value && !updated.description) {
            const order = orders.find(o => o.id === value)
            if (order) updated.description = order.custom_description || ''
        }

        setForm(updated)
    }

    async function createProductInline() {
        if (!newProduct.name.trim()) return
        setSavingProduct(true)
        const { data } = await supabase.from('products').insert([{
            ...newProduct,
            selling_price: parseFloat(newProduct.selling_price) || null,
            production_cost: parseFloat(newProduct.production_cost) || null,
            is_active: true,
        }]).select().single()
        if (data) {
            await fetchAll()
            setForm(f => ({ ...f, product_id: data.id }))
        }
        setNewProduct(emptyProduct); setShowNewProduct(false); setSavingProduct(false)
    }

    // ── ADD TO STOCK when production done without order ──
    async function addToStock(prod) {
        if (!prod.product_id) return
        const qty = parseInt(prod.quantity) || 1
        const { data: existing, error } = await supabase
            .from('stock').select('*').eq('product_id', prod.product_id).single()

        if (existing) {
            await supabase.from('stock').update({
                quantity_available: (existing.quantity_available || 0) + qty,
                updated_at: new Date().toISOString(),
            }).eq('product_id', prod.product_id)
        } else {
            await supabase.from('stock').insert([{
                product_id: prod.product_id,
                quantity_available: qty,
                quantity_with_reseller: 0,
            }])
        }

        // Log movement
        await supabase.from('stock_movements').insert([{
            product_id: prod.product_id,
            type: 'produced',
            quantity: qty,
            is_positive: true,
            notes: `Production completed — ${prod.products?.name || prod.description}`,
        }])
    }

    async function saveProd() {
        if (!form.description && !form.product_id) return
        setSaving(true)
        const payload = {
            ...form,
            order_id: form.order_id || null,
            product_id: form.product_id || null,
            quantity: parseInt(form.quantity) || 1,
            filament_grams: parseFloat(form.filament_grams) || null,
            print_time_hours: parseFloat(form.print_time_hours) || null,
            actual_cost: parseFloat(form.actual_cost) || null,
        }
        if (editing) {
            await supabase.from('productions').update(payload).eq('id', editing)
        } else {
            await supabase.from('productions').insert([payload])
        }
        setSaving(false); closeModal(); fetchAll()
    }

    async function updateStatus(id, status) {
        const prod = productions.find(p => p.id === id)
        if (!prod) return

        // ── When marking DONE ──────────────────────────────────────
        if (status === 'done') {

            // 1. Consume materials via atomic DB function
            if (prod.product_id) {
                const qty = parseInt(prod.quantity) || 1
                const { data: matResult } = await supabase.rpc('consume_materials_atomic', {
                    p_product_id: prod.product_id,
                    p_quantity: qty,
                    p_production_id: id,
                })
                if (matResult && !matResult.success) {
                    const reason = matResult.reason === 'insufficient_material'
                        ? `Not enough ${matResult.material}. Need ${matResult.needed}, have ${matResult.available}.`
                        : 'Material consumption failed.'
                    alert(`⚠️ ${reason}\n\nProduction marked done but materials were not consumed. Please adjust stock manually.`)
                }
            }

            // 2. Calculate actual cost and sync to product
            const calculatedCost = calcProductionCost(prod.filament_grams, prod.print_time_hours)

            if (prod.product_id) {
                const actualCost = parseFloat(prod.actual_cost) || calculatedCost

                // Fetch BOM to include material costs in the product cost
                const { data: bom } = await supabase
                    .from('product_materials')
                    .select('quantity_per_unit, materials(cost_per_unit)')
                    .eq('product_id', prod.product_id)

                const bomCost = (bom || []).reduce((s, b) =>
                    s + ((b.quantity_per_unit || 1) * (b.materials?.cost_per_unit || 0)), 0)

                const fullCost = parseFloat((actualCost + bomCost).toFixed(3))

                // Sync to product — now includes filament + electricity + materials
                await supabase.from('products')
                    .update({ production_cost: fullCost })
                    .eq('id', prod.product_id)
            }

            // Update the production with the final cost
            await supabase.from('productions')
                .update({ status, actual_cost: actualCost > 0 ? actualCost : prod.actual_cost })
                .eq('id', id)

            // 3. If no order → add to stock
            if (!prod.order_id && prod.product_id) {
                await addToStock(prod)
            }

            // 4. If has order → advance order to 'ready'
            if (prod.order_id) {
                const { data: order } = await supabase
                    .from('orders').select('status').eq('id', prod.order_id).single()
                if (order?.status === 'in_production') {
                    await supabase.from('orders')
                        .update({ status: 'ready' })
                        .eq('id', prod.order_id)
                }
            }

        } else {
            // Other status changes
            await supabase.from('productions').update({ status }).eq('id', id)

            // When marking PRINTING → sync order to in_production
            if (status === 'printing' && prod.order_id) {
                const { data: order } = await supabase
                    .from('orders').select('status').eq('id', prod.order_id).single()
                if (order && ['confirmed', 'quoted', 'new'].includes(order.status)) {
                    await supabase.from('orders')
                        .update({ status: 'in_production' })
                        .eq('id', prod.order_id)
                }
            }
        }

        fetchAll()
    }

    async function deleteProd(id) {
        await supabase.from('productions').delete().eq('id', id)
        setDeleting(null); fetchAll()
    }

    const filtered = productions.filter(p => {
        if (filterStatus === 'active') return ['queued', 'printing'].includes(p.status)
        if (filterStatus === 'done') return p.status === 'done'
        return true
    })

    const queued = productions.filter(p => p.status === 'queued').length
    const printing = productions.filter(p => p.status === 'printing').length
    const done = productions.filter(p => p.status === 'done').length
    const totalGrams = productions.filter(p => p.status === 'done')
        .reduce((s, p) => s + (p.filament_grams || 0), 0)

    const si = key => STATUSES.find(s => s.key === key) || STATUSES[0]

    return (
        <div className="max-w-4xl mx-auto">
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

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-slate-700">{queued}</p>
                    <p className="text-xs text-slate-400 mt-0.5">⏳ Queued</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-yellow-500">{printing}</p>
                    <p className="text-xs text-slate-400 mt-0.5">🖨️ Printing</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-500">{done}</p>
                    <p className="text-xs text-slate-400 mt-0.5">✅ Done</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-sky-500">{totalGrams.toFixed(0)}g</p>
                    <p className="text-xs text-slate-400 mt-0.5">🧵 Filament Used</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-5">
                {[{ key: 'active', label: '🔥 Active' }, { key: 'done', label: '✅ Done' }, { key: 'all', label: 'All' }].map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors
              ${filterStatus === f.key ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Print queue view */}
            {filterStatus === 'active' && filtered.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
                    <p className="text-sm font-bold text-amber-700 mb-3">
                        🖨️ Print Queue — {filtered.length} job{filtered.length > 1 ? 's' : ''}
                    </p>
                    <div className="space-y-2">
                        {[...filtered]
                            .sort((a, b) => a.status === 'printing' ? -1 : b.status === 'printing' ? 1 : 0)
                            .map((p, idx) => (
                                <div key={p.id} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-amber-100">
                                    <span className="text-slate-400 text-xs font-bold w-4">{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">
                                            {p.products?.name || p.description || 'Custom job'}
                                            {p.quantity > 1 ? ` ×${p.quantity}` : ''}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {p.orders?.clients?.name ? `📋 ${p.orders.clients.name}` : '📦 Stock production'}
                                            {p.material ? ` · ${p.material}` : ''}
                                        </p>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0 ${si(p.status).color}`}>
                                        {si(p.status).emoji}
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
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map(p => {
                        const s = si(p.status)
                        return (
                            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                                                {s.emoji} {s.label}
                                            </span>
                                            {p.material && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{p.material}</span>}
                                            {p.color && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{p.color}</span>}
                                            {!p.order_id && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">📦 Stock</span>}
                                        </div>
                                        <h3 className="font-semibold text-slate-800">
                                            {p.products?.name || p.description || 'Custom job'}
                                            {(p.quantity || 1) > 1 && <span className="text-slate-400 font-normal"> ×{p.quantity}</span>}
                                        </h3>
                                        {p.orders?.clients?.name && (
                                            <p className="text-xs text-slate-400 mt-0.5">📋 {p.orders.clients.name}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                        <button onClick={() => openEdit(p)}
                                            className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg text-xs">✏️</button>
                                        <button onClick={() => setDeleting(p)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-4 text-sm py-3 border-t border-b border-slate-50 mb-3">
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
                                        </div>
                                    )}
                                </div>

                                {/* Quick status buttons */}
                                <div className="flex gap-2">
                                    {STATUSES.filter(s => s.key !== p.status).map(s => (
                                        <button key={s.key} onClick={() => updateStatus(p.id, s.key)}
                                            className="flex-1 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-500 transition-colors">
                                            {s.emoji} {s.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Stock note */}
                                {p.status === 'done' && !p.order_id && p.product_id && (
                                    <p className="text-xs text-emerald-600 mt-2 font-medium">
                                        ✅ Added to stock automatically
                                    </p>
                                )}

                                {p.notes && <p className="text-xs text-slate-400 mt-2 italic">"{p.notes}"</p>}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">
                                {editing ? 'Edit Job' : 'New Print Job'}
                            </h2>
                            <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
                        </div>

                        <div className="p-5 space-y-4">

                            {/* Linked order */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">
                                    Linked Order <span className="text-slate-400 font-normal">(leave empty for stock production)</span>
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
                                    <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                                        <p className="text-xs text-emerald-700 font-medium">
                                            📦 When marked Done, quantity will be automatically added to stock
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Product selection + inline create */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Product</label>
                                <select name="product_id" value={form.product_id} onChange={handleChange}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                    <option value="">Custom / not in catalogue</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>

                                <button onClick={() => setShowNewProduct(true)}
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
                                                placeholder="Selling price (TND)"
                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowNewProduct(false)}
                                                className="flex-1 py-2 text-xs border border-slate-200 rounded-lg hover:bg-white">Cancel</button>
                                            <button onClick={createProductInline}
                                                disabled={savingProduct || !newProduct.name.trim()}
                                                className="flex-1 py-2 text-xs bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 font-medium">
                                                {savingProduct ? 'Adding...' : '+ Create & Select'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Description */}
                            {!form.product_id && (
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Description *</label>
                                    <input name="description" value={form.description} onChange={handleChange}
                                        placeholder="What are you printing?"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            )}

                            {/* Quantity + Material + Color */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Quantity</label>
                                    <input name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Material</label>
                                    <select name="material" value={form.material} onChange={handleChange}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                        {MATERIALS.map(m => <option key={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Color</label>
                                    <input name="color" value={form.color} onChange={handleChange}
                                        placeholder="e.g. Black"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            {/* Filament + Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Filament used (g)</label>
                                    <input name="filament_grams" type="number" value={form.filament_grams} onChange={handleChange}
                                        placeholder="e.g. 85"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Print time (h)</label>
                                    <input name="print_time_hours" type="number" value={form.print_time_hours} onChange={handleChange}
                                        placeholder="e.g. 3.5"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">
                                    Production Cost (TND) <span className="text-xs text-sky-500">auto-calculated</span>
                                </label>
                                <input name="actual_cost" type="number" value={form.actual_cost} onChange={handleChange}
                                    placeholder="0.00"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-sky-50 font-semibold" />
                                <p className="text-xs text-slate-400 mt-1">
                                    {FILAMENT_PRICE_PER_KG} TND/kg filament + {ELECTRICITY_PER_HOUR} TND/hr electricity
                                </p>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-2">Status</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {STATUSES.map(s => (
                                        <button key={s.key}
                                            onClick={() => setForm(f => ({ ...f, status: s.key }))}
                                            className={`py-2.5 rounded-xl text-sm font-medium border transition-all
                        ${form.status === s.key ? 'border-sky-400 bg-sky-50 text-sky-700 ring-2 ring-sky-200' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
                                            {s.emoji} {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                                <textarea name="notes" value={form.notes} onChange={handleChange}
                                    placeholder="Any notes about this print job..."
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                            </div>
                        </div>

                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={closeModal}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={saveProd}
                                disabled={saving || (!form.description && !form.product_id)}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Job'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleting && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete job?</h3>
                        <p className="text-slate-500 text-sm mb-5">
                            "{deleting.products?.name || deleting.description}" will be removed.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleting(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={() => deleteProd(deleting.id)}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}