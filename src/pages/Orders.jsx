import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Search, ChevronRight, Trash2, ArrowRight, Phone, UserPlus, PackagePlus } from 'lucide-react'

const STATUSES = [
    { key: 'new', label: 'New', emoji: '🆕', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
    { key: 'designing', label: 'Designing', emoji: '✏️', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
    { key: 'quoted', label: 'Quoted', emoji: '💬', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400' },
    { key: 'confirmed', label: 'Confirmed', emoji: '✅', color: 'bg-sky-100 text-sky-700', dot: 'bg-sky-400' },
    { key: 'in_production', label: 'In Production', emoji: '🖨️', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
    { key: 'ready', label: 'Ready', emoji: '📦', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
    { key: 'delivered', label: 'Delivered', emoji: '🚚', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-400' },
    { key: 'paid', label: 'Paid', emoji: '💰', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
    { key: 'cancelled', label: 'Cancelled', emoji: '❌', color: 'bg-red-100 text-red-600', dot: 'bg-red-400' },
]

const FLOW = ['new', 'designing', 'quoted', 'confirmed', 'in_production', 'ready', 'delivered', 'paid']
const ORDER_TO_PROD = { in_production: 'printing', ready: 'done', cancelled: 'failed' }

const emptyForm = { type: 'custom', client_id: '', custom_description: '', dimensions: '', reference_notes: '', deadline: '', total_price: '', notes: '', status: 'new' }
const emptyItem = { product_id: '', custom_description: '', quantity: 1, unit_price: '' }
const emptyClient = { name: '', phone: '', email: '' }
const emptyProduct = { name: '', category: 'Custom Orders', selling_price: '', production_cost: '' }
const CATEGORIES = ['Keychains', 'Clickers', 'Decorations', 'Custom Orders']

export default function Orders() {
    const [orders, setOrders] = useState([])
    const [clients, setClients] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterStatus, setFilter] = useState('active')
    const [showModal, setShowModal] = useState(false)
    const [selected, setSelected] = useState(null)
    const [form, setForm] = useState(emptyForm)
    const [items, setItems] = useState([{ ...emptyItem }])
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(null)
    const [showNewClient, setShowNewClient] = useState(false)
    const [newClient, setNewClient] = useState(emptyClient)
    const [showNewProduct, setShowNewProduct] = useState(null)
    const [newProduct, setNewProduct] = useState(emptyProduct)
    const [savingInline, setSavingInline] = useState(false)
    const [clientSearch, setClientSearch] = useState('')
    const [showClientDrop, setShowClientDrop] = useState(false)

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        const [{ data: o }, { data: c }, { data: p }] = await Promise.all([
            supabase.from('orders').select(`*, clients(name,phone), order_items(*, products(name))`).order('created_at', { ascending: false }),
            supabase.from('clients').select('id,name,phone').order('name'),
            supabase.from('products').select('id,name,selling_price,category').eq('is_active', true).order('name'),
        ])
        setOrders(o || [])
        setClients(c || [])
        setProducts(p || [])
        setLoading(false)
    }

    const si = key => STATUSES.find(s => s.key === key) || STATUSES[0]

    function openAdd() {
        setForm(emptyForm); setItems([{ ...emptyItem }])
        setSelected(null); setClientSearch(''); setShowModal(true)
    }
    function closeModal() {
        setShowModal(false); setShowNewClient(false)
        setShowNewProduct(null); setClientSearch('')
    }

    async function createClientInline() {
        if (!newClient.name.trim()) return
        setSavingInline(true)
        const { data } = await supabase.from('clients').insert([newClient]).select().single()
        if (data) {
            await fetchAll()
            setForm(f => ({ ...f, client_id: data.id }))
            setClientSearch(data.name)
        }
        setNewClient(emptyClient); setShowNewClient(false); setSavingInline(false)
    }

    async function createProductInline(itemIdx) {
        if (!newProduct.name.trim()) return
        setSavingInline(true)
        const { data } = await supabase.from('products').insert([{
            ...newProduct,
            selling_price: parseFloat(newProduct.selling_price) || null,
            production_cost: parseFloat(newProduct.production_cost) || null,
            is_active: true,
        }]).select().single()
        if (data) { await fetchAll(); updateItem(itemIdx, 'product_id', data.id) }
        setNewProduct(emptyProduct); setShowNewProduct(null); setSavingInline(false)
    }

    function updateItem(idx, field, val) {
        setItems(prev => {
            const u = [...prev]
            u[idx] = { ...u[idx], [field]: val }
            if (field === 'product_id') {
                const prod = products.find(p => p.id === val)
                if (prod) u[idx].unit_price = prod.selling_price || ''
            }
            return u
        })
    }

    function calcTotal(its) {
        return its.reduce((s, i) => s + ((parseFloat(i.unit_price) || 0) * (parseInt(i.quantity) || 1)), 0)
    }

    // ── AUTO-CREATE PRODUCTION when order is saved ──
    async function autoCreateProduction(order, orderItems) {
        let description = ''
        let product_id = null
        let quantity = 1

        if (order.type === 'custom') {
            description = order.custom_description || 'Custom order'
        } else {
            // Standard: build description from items
            description = orderItems
                .map(i => {
                    const prod = products.find(p => p.id === i.product_id)
                    return prod ? `${i.quantity}× ${prod.name}` : i.custom_description
                })
                .filter(Boolean).join(', ')
            // If single product, link it
            if (orderItems.length === 1 && orderItems[0].product_id)
                product_id = orderItems[0].product_id
            quantity = orderItems.reduce((s, i) => s + (parseInt(i.quantity) || 1), 0)
        }

        await supabase.from('productions').insert([{
            order_id: order.id,
            description,
            product_id,
            quantity,
            status: 'queued',
            material: 'PLA',
        }])
    }

    async function saveOrder() {
        if (!form.client_id) return
        setSaving(true)
        const total = form.type === 'standard'
            ? calcTotal(items) || null
            : (parseFloat(form.total_price) || null)

        const { data: order } = await supabase.from('orders')
            .insert([{ ...form, total_price: total }])
            .select().single()

        let savedItems = []
        if (order) {
            if (form.type === 'standard') {
                const valid = items.filter(i => i.product_id || i.custom_description)
                if (valid.length) {
                    await supabase.from('order_items')
                        .insert(valid.map(i => ({ ...i, order_id: order.id })))
                    savedItems = valid
                }
            }
            // Auto-create production
            await autoCreateProduction(order, savedItems)
        }
        setSaving(false); closeModal(); fetchAll()
    }

    // ── SYNC PRODUCTION STATUS when order status changes ──
    async function syncProduction(orderId, newOrderStatus) {
        const prodStatus = ORDER_TO_PROD[newOrderStatus]
        if (!prodStatus) return
        await supabase.from('productions')
            .update({ status: prodStatus })
            .eq('order_id', orderId)
    }

    // ── REDUCE STOCK when standard order is paid ──
    async function reduceStockForOrder(order) {
        if (order.type !== 'standard') return
        const { data: orderItems } = await supabase
            .from('order_items').select('*, products(id)')
            .eq('order_id', order.id)
        if (!orderItems) return

        for (const item of orderItems) {
            if (!item.product_id) continue
            const qty = parseInt(item.quantity) || 1
            const { data: stock } = await supabase
                .from('stock').select('*').eq('product_id', item.product_id).single()
            if (stock) {
                await supabase.from('stock').update({
                    quantity_available: Math.max(0, (stock.quantity_available || 0) - qty),
                    updated_at: new Date().toISOString(),
                }).eq('product_id', item.product_id)
                // Log movement
                await supabase.from('stock_movements').insert([{
                    product_id: item.product_id,
                    type: 'sold',
                    quantity: qty,
                    order_id: order.id,
                    is_positive: false,
                    notes: `Order sold — ${order.clients?.name || ''}`,
                }])
            }
        }
    }

    async function advanceStatus(order) {
        const idx = FLOW.indexOf(order.status)
        if (idx < 0 || idx >= FLOW.length - 1) return
        const next = FLOW[idx + 1]
        await supabase.from('orders')
            .update({ status: next, is_paid: next === 'paid' })
            .eq('id', order.id)
        await syncProduction(order.id, next)
        if (next === 'paid') await reduceStockForOrder(order)
        fetchAll()
        if (selected?.id === order.id) setSelected(p => ({ ...p, status: next }))
    }

    async function setStatus(id, status) {
        const order = orders.find(o => o.id === id)
        await supabase.from('orders')
            .update({ status, is_paid: status === 'paid' })
            .eq('id', id)
        await syncProduction(id, status)
        if (status === 'paid' && order) await reduceStockForOrder(order)
        fetchAll()
        if (selected?.id === id) setSelected(p => ({ ...p, status }))
    }

    async function deleteOrder(id) {
        // Productions cascade-deleted automatically by DB
        await supabase.from('orders').delete().eq('id', id)
        setDeleting(null); setSelected(null); fetchAll()
    }

    const activeStatuses = ['new', 'designing', 'quoted', 'confirmed', 'in_production', 'ready', 'delivered']

    const filtered = orders.filter(o => {
        const name = o.clients?.name?.toLowerCase() || ''
        const desc = (o.custom_description || '').toLowerCase()
        const matchSearch = name.includes(search.toLowerCase()) || desc.includes(search.toLowerCase())
        if (filterStatus === 'active') return matchSearch && activeStatuses.includes(o.status)
        if (filterStatus === 'paid') return matchSearch && o.status === 'paid'
        if (filterStatus === 'cancelled') return matchSearch && o.status === 'cancelled'
        return matchSearch
    })

    const isOverdue = o =>
        o.deadline && !['paid', 'delivered', 'cancelled'].includes(o.status) &&
        new Date(o.deadline) < new Date()

    const fmt = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null
    const nextLabel = o => {
        const idx = FLOW.indexOf(o.status)
        if (idx < 0 || idx >= FLOW.length - 1) return null
        return si(FLOW[idx + 1]).label
    }

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.phone && c.phone.includes(clientSearch))
    )
    const selectedClient = clients.find(c => c.id === form.client_id)

    return (
        <div className="max-w-4xl mx-auto">

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
                    <p className="text-sm text-slate-500">
                        {orders.filter(o => activeStatuses.includes(o.status)).length} active
                    </p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
                    <Plus size={18} /> New Order
                </button>
            </div>

            {/* Status counts */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-5">
                {STATUSES.filter(s => s.key !== 'cancelled').map(s => (
                    <div key={s.key} className="bg-white rounded-xl border border-slate-100 p-2 text-center">
                        <div className="text-base">{s.emoji}</div>
                        <div className="text-sm font-bold text-slate-700">
                            {orders.filter(o => o.status === s.key).length}
                        </div>
                        <div className="text-xs text-slate-400 hidden sm:block leading-tight">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="flex gap-2">
                    {[{ key: 'active', label: 'Active' }, { key: 'paid', label: 'Paid' }, { key: 'all', label: 'All' }].map(f => (
                        <button key={f.key} onClick={() => setFilter(f.key)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors
                ${filterStatus === f.key ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by client or description..."
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
            </div>

            {/* Orders list */}
            {loading ? (
                <div className="text-center py-20 text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-slate-400">No orders found</div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map(o => {
                        const s = si(o.status)
                        const overdue = isOverdue(o)
                        const nl = nextLabel(o)
                        return (
                            <div key={o.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                                <div className="p-4 cursor-pointer" onClick={() => setSelected(o)}>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                                                    {s.emoji} {s.label}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${o.type === 'custom' ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-600'}`}>
                                                    {o.type === 'custom' ? '✏️ Custom' : '📦 Standard'}
                                                </span>
                                                {overdue && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                                                        ⚠️ Overdue
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-semibold text-slate-800">{o.clients?.name || '—'}</h3>
                                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                                                {o.custom_description ||
                                                    o.order_items?.map(i => i.products?.name || i.custom_description).filter(Boolean).join(', ') ||
                                                    'No description'}
                                            </p>
                                        </div>
                                        <div className="text-right ml-3 flex-shrink-0">
                                            <p className="font-bold text-slate-800">
                                                {o.total_price ? `${o.total_price} TND` : <span className="text-slate-300 text-sm font-normal">TBD</span>}
                                            </p>
                                            {o.deadline && (
                                                <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                                                    📅 {fmt(o.deadline)}
                                                </p>
                                            )}
                                        </div>
                                        <ChevronRight size={16} className="text-slate-300 ml-2 mt-1 flex-shrink-0" />
                                    </div>
                                    <div className="mt-3 flex gap-0.5">
                                        {FLOW.map((key, idx) => {
                                            const currentIdx = FLOW.indexOf(o.status)
                                            return (
                                                <div key={key}
                                                    className={`h-1 flex-1 rounded-full ${idx <= currentIdx ? si(key).dot : 'bg-slate-100'}`} />
                                            )
                                        })}
                                    </div>
                                </div>
                                {nl && (
                                    <div className="px-4 pb-3">
                                        <button onClick={e => { e.stopPropagation(); advanceStatus(o) }}
                                            className="w-full py-2 bg-slate-50 hover:bg-sky-50 hover:text-sky-600 border border-slate-200 hover:border-sky-200 rounded-xl text-xs font-medium text-slate-500 transition-all flex items-center justify-center gap-1">
                                            <ArrowRight size={13} /> Move to {nl}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* NEW ORDER MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">New Order</h2>
                            <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">

                            {/* Type */}
                            <div className="grid grid-cols-2 gap-2">
                                {[{ key: 'custom', label: '✏️ Custom', sub: 'Design required' }, { key: 'standard', label: '📦 Standard', sub: 'From catalogue' }].map(t => (
                                    <button key={t.key} onClick={() => setForm(f => ({ ...f, type: t.key }))}
                                        className={`p-3 rounded-xl border text-left transition-all
                      ${form.type === t.key ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                                        <p className="text-sm font-semibold text-slate-800">{t.label}</p>
                                        <p className="text-xs text-slate-400">{t.sub}</p>
                                    </button>
                                ))}
                            </div>

                            {/* Client */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Client *</label>
                                {form.client_id && selectedClient ? (
                                    <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5">
                                        <div>
                                            <p className="text-sm font-semibold text-sky-800">{selectedClient.name}</p>
                                            {selectedClient.phone && <p className="text-xs text-sky-500">{selectedClient.phone}</p>}
                                        </div>
                                        <button onClick={() => { setForm(f => ({ ...f, client_id: '' })); setClientSearch('') }}
                                            className="text-sky-400 hover:text-sky-600 p-1"><X size={14} /></button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <input value={clientSearch}
                                            onChange={e => { setClientSearch(e.target.value); setShowClientDrop(true) }}
                                            onFocus={() => setShowClientDrop(true)}
                                            placeholder="Search or type client name..."
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                        {showClientDrop && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                                                {filteredClients.map(c => (
                                                    <button key={c.id}
                                                        onClick={() => { setForm(f => ({ ...f, client_id: c.id })); setClientSearch(c.name); setShowClientDrop(false) }}
                                                        className="w-full text-left px-3 py-2.5 hover:bg-sky-50 border-b border-slate-50 last:border-0">
                                                        <p className="text-sm font-medium text-slate-800">{c.name}</p>
                                                        {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                                                    </button>
                                                ))}
                                                {filteredClients.length === 0 && (
                                                    <div className="px-3 py-2 text-sm text-slate-400">No clients found</div>
                                                )}
                                                <button onClick={() => { setShowNewClient(true); setShowClientDrop(false) }}
                                                    className="w-full text-left px-3 py-2.5 text-sky-600 hover:bg-sky-50 font-medium text-sm flex items-center gap-2 border-t border-slate-100">
                                                    <UserPlus size={14} />
                                                    {clientSearch ? `Add "${clientSearch}" as new client` : 'Create new client'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {showNewClient && (
                                    <div className="mt-2 bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2">
                                        <p className="text-xs font-bold text-sky-700">New Client</p>
                                        <input value={newClient.name}
                                            onChange={e => setNewClient(f => ({ ...f, name: e.target.value }))}
                                            placeholder="Full name *"
                                            className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input value={newClient.phone}
                                                onChange={e => setNewClient(f => ({ ...f, phone: e.target.value }))}
                                                placeholder="Phone (+216...)"
                                                className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                            <input value={newClient.email}
                                                onChange={e => setNewClient(f => ({ ...f, email: e.target.value }))}
                                                placeholder="Email (optional)"
                                                className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowNewClient(false)}
                                                className="flex-1 py-2 text-xs border border-slate-200 rounded-lg hover:bg-white">Cancel</button>
                                            <button onClick={createClientInline} disabled={savingInline || !newClient.name.trim()}
                                                className="flex-1 py-2 text-xs bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 font-medium">
                                                {savingInline ? 'Creating...' : '+ Create & Select'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Custom fields */}
                            {form.type === 'custom' && (
                                <>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 block mb-1">What do they want? *</label>
                                        <textarea value={form.custom_description}
                                            onChange={e => setForm(f => ({ ...f, custom_description: e.target.value }))}
                                            placeholder="Describe what the client wants..."
                                            rows={3}
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-sm font-medium text-slate-700 block mb-1">Dimensions</label>
                                            <input value={form.dimensions}
                                                onChange={e => setForm(f => ({ ...f, dimensions: e.target.value }))}
                                                placeholder="e.g. 10×5×3 cm"
                                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-slate-700 block mb-1">Price (TND)</label>
                                            <input type="number" value={form.total_price}
                                                onChange={e => setForm(f => ({ ...f, total_price: e.target.value }))}
                                                placeholder="TBD if empty"
                                                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 block mb-1">Reference / Instructions</label>
                                        <textarea value={form.reference_notes}
                                            onChange={e => setForm(f => ({ ...f, reference_notes: e.target.value }))}
                                            placeholder="Color, reference image link, special details..."
                                            rows={2}
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                                    </div>
                                </>
                            )}

                            {/* Standard items */}
                            {form.type === 'standard' && (
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-2">Items</label>
                                    <div className="space-y-3">
                                        {items.map((item, idx) => (
                                            <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                                                <div className="flex gap-2 items-start">
                                                    <div className="flex-1">
                                                        <select value={item.product_id}
                                                            onChange={e => updateItem(idx, 'product_id', e.target.value)}
                                                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                                            <option value="">Custom / not in catalogue</option>
                                                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                        </select>
                                                        <button onClick={() => setShowNewProduct(idx)}
                                                            className="mt-1 text-xs text-sky-500 hover:text-sky-700 flex items-center gap-1">
                                                            <PackagePlus size={12} /> Add new product to catalogue
                                                        </button>
                                                    </div>
                                                    {items.length > 1 && (
                                                        <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                                                            className="p-2 text-red-400 hover:bg-red-50 rounded-lg mt-0.5">
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                {showNewProduct === idx && (
                                                    <div className="bg-white border border-sky-200 rounded-xl p-3 space-y-2">
                                                        <p className="text-xs font-bold text-sky-700">New Product</p>
                                                        <input value={newProduct.name}
                                                            onChange={e => setNewProduct(f => ({ ...f, name: e.target.value }))}
                                                            placeholder="Product name *"
                                                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none" />
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
                                                            <button onClick={() => setShowNewProduct(null)}
                                                                className="flex-1 py-2 text-xs border border-slate-200 rounded-lg">Cancel</button>
                                                            <button onClick={() => createProductInline(idx)}
                                                                disabled={savingInline || !newProduct.name.trim()}
                                                                className="flex-1 py-2 text-xs bg-sky-500 text-white rounded-lg disabled:opacity-50">
                                                                {savingInline ? 'Adding...' : '+ Add & Select'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                {!item.product_id && showNewProduct !== idx && (
                                                    <input value={item.custom_description}
                                                        onChange={e => updateItem(idx, 'custom_description', e.target.value)}
                                                        placeholder="Describe the item..."
                                                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                )}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-xs text-slate-400 block mb-0.5">Qty</label>
                                                        <input type="number" min="1" value={item.quantity}
                                                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                                                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-slate-400 block mb-0.5">Price (TND)</label>
                                                        <input type="number" value={item.unit_price}
                                                            onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                                                            placeholder="0.00"
                                                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => setItems(p => [...p, { ...emptyItem }])}
                                        className="mt-2 w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-sky-300 hover:text-sky-500 transition-colors">
                                        + Add another item
                                    </button>
                                    {items.some(i => i.unit_price) && (
                                        <div className="mt-2 bg-emerald-50 rounded-xl px-3 py-2 text-sm font-semibold text-emerald-700">
                                            Total: {calcTotal(items).toFixed(2)} TND
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Deadline</label>
                                    <input type="date" value={form.deadline}
                                        onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Initial Status</label>
                                    <select value={form.status}
                                        onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                        {STATUSES.filter(s => !['paid', 'cancelled', 'in_production', 'ready'].includes(s.key)).map(s =>
                                            <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>
                                        )}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                                <textarea value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Internal notes..."
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                <p className="text-xs text-amber-700 font-medium">
                                    🖨️ A print job will be automatically created and linked to this order
                                </p>
                            </div>
                        </div>

                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={closeModal}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={saveOrder} disabled={saving || !form.client_id}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                                {saving ? 'Saving...' : 'Create Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ORDER DETAIL */}
            {selected && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{selected.clients?.name}</h2>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${si(selected.status).color}`}>
                                        {si(selected.status).emoji} {si(selected.status).label}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${selected.type === 'custom' ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-600'}`}>
                                        {selected.type === 'custom' ? '✏️ Custom' : '📦 Standard'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setDeleting(selected)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl">
                                    <Trash2 size={16} />
                                </button>
                                <button onClick={() => setSelected(null)} className="p-2 hover:bg-slate-100 rounded-xl">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="p-5 space-y-4">
                            {nextLabel(selected) && (
                                <button onClick={() => advanceStatus(selected)}
                                    className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                                    <ArrowRight size={16} /> Mark as {nextLabel(selected)}
                                </button>
                            )}
                            {selected.status === 'paid' && (
                                <div className="w-full py-3 bg-emerald-100 text-emerald-700 rounded-xl font-semibold text-sm text-center">
                                    ✅ Order Complete & Paid
                                </div>
                            )}

                            <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pipeline</p>
                                <div className="flex gap-1.5 flex-wrap">
                                    {FLOW.map(key => {
                                        const currentIdx = FLOW.indexOf(selected.status)
                                        const thisIdx = FLOW.indexOf(key)
                                        const s = si(key)
                                        return (
                                            <button key={key} onClick={() => setStatus(selected.id, key)}
                                                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all
                          ${thisIdx === currentIdx ? s.color + ' ring-2 ring-offset-1' :
                                                        thisIdx < currentIdx ? 'bg-slate-200 text-slate-400' :
                                                            'bg-white border border-slate-200 text-slate-400 hover:bg-slate-100'}`}>
                                                {s.emoji} {s.label}
                                            </button>
                                        )
                                    })}
                                    <button onClick={() => setStatus(selected.id, 'cancelled')}
                                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium
                      ${selected.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-white border border-slate-200 text-slate-400 hover:bg-red-50'}`}>
                                        ❌ Cancel
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs text-slate-400 mb-1">Price</p>
                                    <p className="font-bold text-slate-800 text-lg">
                                        {selected.total_price ? `${selected.total_price} TND` : <span className="text-slate-400 text-sm font-normal">Not set</span>}
                                    </p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs text-slate-400 mb-1">Deadline</p>
                                    <p className={`font-semibold text-sm ${isOverdue(selected) ? 'text-red-500' : 'text-slate-800'}`}>
                                        {selected.deadline ? fmt(selected.deadline) : '—'}
                                    </p>
                                </div>
                            </div>

                            {selected.type === 'custom' && selected.custom_description && (
                                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                                    <p className="text-xs font-semibold text-violet-500 mb-1">What they want</p>
                                    <p className="text-sm text-slate-700">{selected.custom_description}</p>
                                    {selected.dimensions && <p className="text-xs text-slate-500 mt-1">📐 {selected.dimensions}</p>}
                                </div>
                            )}

                            {selected.reference_notes && (
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                    <p className="text-xs font-semibold text-amber-600 mb-1">Reference / Instructions</p>
                                    <p className="text-sm text-slate-700">{selected.reference_notes}</p>
                                </div>
                            )}

                            {selected.order_items?.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Items</p>
                                    <div className="space-y-2">
                                        {selected.order_items.map(item => (
                                            <div key={item.id} className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2.5">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700">
                                                        {item.products?.name || item.custom_description || 'Item'}
                                                    </p>
                                                    <p className="text-xs text-slate-400">×{item.quantity}</p>
                                                </div>
                                                <p className="font-semibold text-slate-700 text-sm">
                                                    {item.unit_price ? `${(item.unit_price * item.quantity).toFixed(2)} TND` : '—'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selected.notes && (
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs font-semibold text-slate-400 mb-1">Notes</p>
                                    <p className="text-sm text-slate-600">{selected.notes}</p>
                                </div>
                            )}

                            {selected.clients?.phone && (
                                <div className="grid grid-cols-2 gap-2">
                                    <a href={`https://wa.me/${selected.clients.phone.replace(/\s+/g, '')}`}
                                        target="_blank" rel="noreferrer"
                                        className="flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium">
                                        💬 WhatsApp
                                    </a>
                                    <a href={`tel:${selected.clients.phone}`}
                                        className="flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium">
                                        <Phone size={15} /> Call
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {deleting && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete order?</h3>
                        <p className="text-slate-500 text-sm mb-2">
                            Order for <span className="font-medium">{deleting.clients?.name}</span> will be deleted.
                        </p>
                        <p className="text-xs text-red-500 mb-5">⚠️ All linked print jobs will also be deleted.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleting(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={() => deleteOrder(deleting.id)}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}