import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, CheckCircle, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const emptyConsignment = {
    reseller_id: '', product_id: '', quantity_given: '',
    unit_price: '', date_given: new Date().toISOString().split('T')[0], notes: '',
}

export default function Reseller() {
    const [resellers, setResellers] = useState([])
    const [consignments, setConsignments] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showSellModal, setShowSellModal] = useState(null)
    const [form, setForm] = useState(emptyConsignment)
    const [sellQty, setSellQty] = useState(1)
    const [saving, setSaving] = useState(false)
    const [activeReseller, setActive] = useState(null)
    const navigate = useNavigate()

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        const [{ data: rs }, { data: cs }, { data: pr }] = await Promise.all([
            supabase.from('clients').select('id, name, phone').eq('is_reseller', true).order('name'),
            supabase.from('reseller_consignments').select('*, clients(name), products(name, selling_price)').order('created_at', { ascending: false }),
            supabase.from('products').select('id, name, selling_price').eq('is_active', true).order('name'),
        ])
        setResellers(rs || [])
        setConsignments(cs || [])
        setProducts(pr || [])
        if (rs?.length > 0 && !activeReseller) setActive(rs[0].id)
        setLoading(false)
    }

    async function saveConsignment() {
        if (!form.reseller_id || !form.product_id || !form.quantity_given) return

        // ── CHECK STOCK AVAILABILITY ──
        const qty = parseInt(form.quantity_given)
        const { data: stockItem } = await supabase
            .from('stock').select('*').eq('product_id', form.product_id).single()

        const available = stockItem?.quantity_available || 0
        if (available < qty) {
            alert(`❌ Not enough stock.\nAvailable: ${available} units\nRequested: ${qty} units\n\nProduce more before giving to reseller.`)
            return
        }

        setSaving(true)

        // Save consignment
        await supabase.from('reseller_consignments').insert([{
            ...form,
            quantity_given: qty,
            unit_price: parseFloat(form.unit_price) || null,
        }])

        // ── REDUCE STOCK automatically ──
        await supabase.from('stock').update({
            quantity_available: Math.max(0, available - qty),
            quantity_with_reseller: (stockItem?.quantity_with_reseller || 0) + qty,
            updated_at: new Date().toISOString(),
        }).eq('product_id', form.product_id)

        // Log movement
        await supabase.from('stock_movements').insert([{
            product_id: form.product_id,
            type: 'given_to_reseller',
            quantity: qty,
            is_positive: false,
            client_id: form.reseller_id,
            notes: `Given to reseller`,
        }])

        setSaving(false)
        setShowModal(false)
        setForm(emptyConsignment)
        fetchAll()
    }

    async function reportSale(consignment, qtySold) {
        if (!qtySold || qtySold <= 0) return
        setSaving(true)
        const qty = Math.min(parseInt(qtySold), consignment.quantity_given - consignment.quantity_sold - consignment.quantity_returned)
        await supabase.from('reseller_consignments').update({
            quantity_sold: consignment.quantity_sold + qty,
        }).eq('id', consignment.id)

        // Update stock
        const { data: existing } = await supabase.from('stock').select('*').eq('product_id', consignment.product_id).single()
        if (existing) {
            await supabase.from('stock').update({
                quantity_with_reseller: Math.max(0, (existing.quantity_with_reseller || 0) - qty),
                updated_at: new Date().toISOString(),
            }).eq('product_id', consignment.product_id)
        }

        setSaving(false)
        setShowSellModal(null)
        setSellQty(1)
        fetchAll()
    }

    async function reportReturn(consignment, qtyReturned) {
        if (!qtyReturned || qtyReturned <= 0) return
        setSaving(true)

        const qty = Math.min(
            parseInt(qtyReturned),
            consignment.quantity_given - consignment.quantity_sold - consignment.quantity_returned
        )

        // Update consignment
        await supabase.from('reseller_consignments').update({
            quantity_returned: consignment.quantity_returned + qty,
        }).eq('id', consignment.id)

        // ── INCREASE STOCK automatically ──
        const { data: existing } = await supabase
            .from('stock').select('*').eq('product_id', consignment.product_id).single()

        if (existing) {
            await supabase.from('stock').update({
                quantity_available: (existing.quantity_available || 0) + qty,
                quantity_with_reseller: Math.max(0, (existing.quantity_with_reseller || 0) - qty),
                updated_at: new Date().toISOString(),
            }).eq('product_id', consignment.product_id)
        }

        // Log movement
        await supabase.from('stock_movements').insert([{
            product_id: consignment.product_id,
            type: 'returned_from_reseller',
            quantity: qty,
            is_positive: true,
            client_id: consignment.reseller_id,
            notes: `Returned from reseller`,
        }])

        setSaving(false)
        fetchAll()
    }

    async function settle(id) {
        await supabase.from('reseller_consignments').update({ is_settled: true }).eq('id', id)
        fetchAll()
    }

    async function deleteConsignment(id) {
        await supabase.from('reseller_consignments').delete().eq('id', id)
        fetchAll()
    }

    const resellerConsignments = (resellerId, settledFilter) =>
        consignments.filter(c =>
            c.reseller_id === resellerId &&
            (settledFilter === 'all' ? true : settledFilter === 'active' ? !c.is_settled : c.is_settled)
        )

    const balance = (resellerId) => {
        const active = resellerConsignments(resellerId, 'active')
        return active.reduce((sum, c) => sum + ((c.quantity_sold || 0) * (c.unit_price || 0)), 0)
    }

    const inHands = (resellerId) => {
        const active = resellerConsignments(resellerId, 'active')
        return active.reduce((sum, c) =>
            sum + Math.max(0, (c.quantity_given || 0) - (c.quantity_sold || 0) - (c.quantity_returned || 0)), 0)
    }

    const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

    if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>

    if (resellers.length === 0) return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Resellers</h1>
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
                <p className="text-4xl mb-3">🤝</p>
                <p className="text-slate-600 font-semibold mb-1">No resellers yet</p>
                <p className="text-slate-400 text-sm mb-6">
                    To add a reseller, go to <strong>Clients</strong>, add or edit a client,
                    and enable the <strong>"Reseller"</strong> toggle.
                </p>
                <button
                    onClick={() => navigate('/clients')}
                    className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors">
                    Go to Clients →
                </button>
            </div>
        </div>
    )

    return (
        <div className="max-w-4xl mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Resellers</h1>
                    <p className="text-sm text-slate-500">{resellers.length} reseller{resellers.length > 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
                    <Plus size={18} /> Give Products
                </button>
            </div>

            {/* Reseller tabs */}
            {resellers.length > 1 && (
                <div className="flex gap-2 mb-5 overflow-x-auto">
                    {resellers.map(r => (
                        <button key={r.id} onClick={() => setActive(r.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0 transition-colors
                ${activeReseller === r.id ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {r.name}
                        </button>
                    ))}
                </div>
            )}

            {resellers.filter(r => !activeReseller || r.id === activeReseller).map(reseller => {
                const active = resellerConsignments(reseller.id, 'active')
                const settled = resellerConsignments(reseller.id, 'settled')
                const owes = balance(reseller.id)
                const stillHas = inHands(reseller.id)

                return (
                    <div key={reseller.id} className="space-y-5">

                        {/* Reseller summary card */}
                        <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl p-5 text-white">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold">{reseller.name}</h2>
                                    {reseller.phone && (
                                        <a href={`https://wa.me/${reseller.phone.replace(/\s+/g, '')}`}
                                            target="_blank" rel="noreferrer"
                                            className="text-purple-200 text-sm hover:text-white">
                                            💬 {reseller.phone}
                                        </a>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-purple-200 text-xs">Owes you</p>
                                    <p className="text-2xl font-bold">{owes.toFixed(2)} TND</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white/20 rounded-xl p-3 text-center">
                                    <p className="text-xl font-bold">{active.length}</p>
                                    <p className="text-xs text-purple-200">Active lots</p>
                                </div>
                                <div className="bg-white/20 rounded-xl p-3 text-center">
                                    <p className="text-xl font-bold">{stillHas}</p>
                                    <p className="text-xs text-purple-200">Still has</p>
                                </div>
                                <div className="bg-white/20 rounded-xl p-3 text-center">
                                    <p className="text-xl font-bold">
                                        {active.reduce((s, c) => s + (c.quantity_sold || 0), 0)}
                                    </p>
                                    <p className="text-xs text-purple-200">Sold</p>
                                </div>
                            </div>
                        </div>

                        {/* Active consignments */}
                        {active.length > 0 && (
                            <div>
                                <p className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3">Active Lots</p>
                                <div className="space-y-3">
                                    {active.map(c => {
                                        const remaining = c.quantity_given - c.quantity_sold - c.quantity_returned
                                        const earned = (c.quantity_sold || 0) * (c.unit_price || 0)
                                        const pct = c.quantity_given > 0 ? ((c.quantity_sold || 0) / c.quantity_given) * 100 : 0

                                        return (
                                            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <h3 className="font-semibold text-slate-800">{c.products?.name}</h3>
                                                        <p className="text-xs text-slate-400">Given on {fmt(c.date_given)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-emerald-600">{earned.toFixed(2)} TND</p>
                                                        <p className="text-xs text-slate-400">earned so far</p>
                                                    </div>
                                                </div>

                                                {/* Progress */}
                                                <div className="mb-3">
                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                        <span>Sold: {c.quantity_sold || 0} / {c.quantity_given}</span>
                                                        <span>Remaining: {remaining}</span>
                                                    </div>
                                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-400 transition-all rounded-full"
                                                            style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>

                                                {/* Stats grid */}
                                                <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
                                                    <div className="bg-slate-50 rounded-xl p-2">
                                                        <p className="font-bold text-slate-700">{c.quantity_given}</p>
                                                        <p className="text-slate-400">Given</p>
                                                    </div>
                                                    <div className="bg-emerald-50 rounded-xl p-2">
                                                        <p className="font-bold text-emerald-600">{c.quantity_sold || 0}</p>
                                                        <p className="text-slate-400">Sold</p>
                                                    </div>
                                                    <div className="bg-orange-50 rounded-xl p-2">
                                                        <p className="font-bold text-orange-500">{c.quantity_returned || 0}</p>
                                                        <p className="text-slate-400">Returned</p>
                                                    </div>
                                                </div>

                                                {c.unit_price && (
                                                    <p className="text-xs text-slate-400 mb-3">
                                                        Price: {c.unit_price} TND/unit · Total value: {(c.quantity_given * c.unit_price).toFixed(2)} TND
                                                    </p>
                                                )}

                                                {c.notes && (
                                                    <p className="text-xs text-slate-400 italic mb-3">"{c.notes}"</p>
                                                )}

                                                {/* Action buttons */}
                                                {remaining > 0 && (
                                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                                        <button onClick={() => { setShowSellModal({ ...c, action: 'sell' }); setSellQty(1) }}
                                                            className="py-2 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 transition-colors">
                                                            💰 Report Sale
                                                        </button>
                                                        <button onClick={() => reportReturn(c, remaining)}
                                                            className="py-2 text-xs font-medium bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl border border-orange-200 transition-colors">
                                                            ↩️ Return All ({remaining})
                                                        </button>
                                                    </div>
                                                )}

                                                {remaining === 0 && (
                                                    <button onClick={() => settle(c.id)}
                                                        className="w-full py-2.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors flex items-center justify-center gap-2">
                                                        <CheckCircle size={16} /> Mark as Settled
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {active.length === 0 && (
                            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100">
                                <p className="text-slate-400">No active consignments</p>
                                <p className="text-slate-400 text-sm">Click "Give Products" to start</p>
                            </div>
                        )}

                        {/* Settled history */}
                        {settled.length > 0 && (
                            <div>
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Settled History</p>
                                <div className="space-y-2">
                                    {settled.map(c => (
                                        <div key={c.id} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between opacity-60">
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">{c.products?.name}</p>
                                                <p className="text-xs text-slate-400">{fmt(c.date_given)} · {c.quantity_sold} sold</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <p className="font-semibold text-emerald-600 text-sm">
                                                    {((c.quantity_sold || 0) * (c.unit_price || 0)).toFixed(2)} TND
                                                </p>
                                                <button onClick={() => deleteConsignment(c.id)}
                                                    className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}

            {/* Give Products Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">Give Products to Reseller</h2>
                            <button onClick={() => { setShowModal(false); setForm(emptyConsignment) }}
                                className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Reseller *</label>
                                <select value={form.reseller_id}
                                    onChange={e => setForm(f => ({ ...f, reseller_id: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                    <option value="">Select reseller...</option>
                                    {resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Product *</label>
                                <select value={form.product_id}
                                    onChange={e => {
                                        const prod = products.find(p => p.id === e.target.value)
                                        setForm(f => ({ ...f, product_id: e.target.value, unit_price: prod?.selling_price || '' }))
                                    }}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                    <option value="">Select product...</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Quantity *</label>
                                    <input type="number" min="1" value={form.quantity_given}
                                        onChange={e => setForm(f => ({ ...f, quantity_given: e.target.value }))}
                                        placeholder="e.g. 10"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 text-lg font-semibold" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Unit Price (TND)</label>
                                    <input type="number" value={form.unit_price}
                                        onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                                        placeholder="0.00"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            {form.quantity_given && form.unit_price && (
                                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm">
                                    <span className="text-purple-700 font-semibold">
                                        Total value: {(form.quantity_given * form.unit_price).toFixed(2)} TND
                                    </span>
                                </div>
                            )}

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Date Given</label>
                                <input type="date" value={form.date_given}
                                    onChange={e => setForm(f => ({ ...f, date_given: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                                <textarea value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Any notes..."
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                            </div>
                        </div>
                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={() => { setShowModal(false); setForm(emptyConsignment) }}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={saveConsignment}
                                disabled={saving || !form.reseller_id || !form.product_id || !form.quantity_given}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                                {saving ? 'Saving...' : 'Give Products'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Sale Modal */}
            {showSellModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Report Sale</h3>
                        <p className="text-slate-500 text-sm mb-4">
                            How many <strong>{showSellModal.products?.name}</strong> did {showSellModal.clients?.name} sell?
                        </p>
                        <input type="number" min="1"
                            max={showSellModal.quantity_given - showSellModal.quantity_sold - showSellModal.quantity_returned}
                            value={sellQty}
                            onChange={e => setSellQty(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-3 text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-sky-300 mb-2" />
                        {showSellModal.unit_price && (
                            <p className="text-center text-sm text-emerald-600 font-semibold mb-4">
                                = {(sellQty * showSellModal.unit_price).toFixed(2)} TND
                            </p>
                        )}
                        <div className="flex gap-3">
                            <button onClick={() => { setShowSellModal(null); setSellQty(1) }}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={() => reportSale(showSellModal, sellQty)}
                                disabled={saving}
                                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium">
                                {saving ? 'Saving...' : 'Confirm Sale'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}