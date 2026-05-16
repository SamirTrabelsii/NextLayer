import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const emptyConsignment = {
    reseller_id: '', product_id: '', quantity_given: '',
    unit_price: '', date_given: new Date().toISOString().split('T')[0], notes: '',
}

const emptySaleForm = {
    quantity: 1, unit_price: '', note: '',
    sale_date: new Date().toISOString().split('T')[0],
}

export default function Reseller() {
    const navigate = useNavigate()

    const [resellers, setResellers] = useState([])
    const [consignments, setConsignments] = useState([])
    const [sales, setSales] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showSaleModal, setShowSaleModal] = useState(null)
    const [form, setForm] = useState(emptyConsignment)
    const [saleForm, setSaleForm] = useState(emptySaleForm)
    const [saving, setSaving] = useState(false)
    const [savingSale, setSavingSale] = useState(false)
    const [saleError, setSaleError] = useState('')
    const [activeReseller, setActive] = useState(null)
    const [expandedHistory, setExpandedHist] = useState(null)

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        const [{ data: rs }, { data: cs }, { data: sl }, { data: pr }] = await Promise.all([
            supabase.from('clients').select('id, name, phone').eq('is_reseller', true).order('name'),
            supabase.from('reseller_consignments')
                .select('*, clients(name), products(name, selling_price)')
                .order('created_at', { ascending: false }),
            supabase.from('reseller_sales')
                .select('*, products(name)')
                .order('sale_date', { ascending: false }),
            supabase.from('products').select('id, name, selling_price').eq('is_active', true).order('name'),
        ])
        setResellers(rs || [])
        setConsignments(cs || [])
        setSales(sl || [])
        setProducts(pr || [])
        if (rs?.length > 0 && !activeReseller) setActive(rs[0].id)
        setLoading(false)
    }

    // ── Give products to reseller ──────────────────────────────
    async function saveConsignment() {
        if (!form.reseller_id || !form.product_id || !form.quantity_given) return
        const qty = parseInt(form.quantity_given)

        // Check stock
        const { data: stockItem } = await supabase
            .from('stock').select('id, quantity_available, quantity_with_reseller')
            .eq('product_id', form.product_id).single()

        if (!stockItem || stockItem.quantity_available < qty) {
            alert(`Not enough stock. Available: ${stockItem?.quantity_available ?? 0}`)
            return
        }

        setSaving(true)
        try {
            await supabase.from('reseller_consignments').insert([{
                reseller_id: form.reseller_id,
                product_id: form.product_id,
                quantity_given: qty,
                quantity_sold: 0,
                quantity_returned: 0,
                unit_price: parseFloat(form.unit_price) || null,
                date_given: form.date_given,
                notes: form.notes || null,
                is_settled: false,
            }])

            // Reduce stock
            await supabase.from('stock').update({
                quantity_available: stockItem.quantity_available - qty,
                quantity_with_reseller: (stockItem.quantity_with_reseller || 0) + qty,
                updated_at: new Date().toISOString(),
            }).eq('id', stockItem.id)

            await supabase.from('stock_movements').insert([{
                product_id: form.product_id,
                type: 'given_to_reseller',
                quantity: qty,
                is_positive: false,
                client_id: form.reseller_id,
                notes: 'Given to reseller',
            }])

            setShowModal(false)
            setForm(emptyConsignment)
            fetchAll()
        } catch (err) {
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    // ── Open report sale modal ─────────────────────────────────
    function openSaleModal(consignment) {
        setSaleForm({
            ...emptySaleForm,
            unit_price: consignment.unit_price ? String(consignment.unit_price) : '',
        })
        setSaleError('')
        setShowSaleModal(consignment)
    }

    // ── Report sale with actual price ──────────────────────────
    async function reportSale() {
        if (!showSaleModal) return
        const c = showSaleModal
        const qty = parseInt(saleForm.quantity) || 0
        const price = parseFloat(saleForm.unit_price)

        if (qty <= 0) { setSaleError('Quantity must be at least 1.'); return }
        if (isNaN(price) || price <= 0) { setSaleError('Enter the actual price per unit.'); return }

        const remaining = c.quantity_given - c.quantity_sold - c.quantity_returned
        if (qty > remaining) {
            setSaleError(`Only ${remaining} unit${remaining !== 1 ? 's' : ''} remaining with reseller.`)
            return
        }

        setSavingSale(true)
        setSaleError('')
        try {
            // Record individual sale
            await supabase.from('reseller_sales').insert([{
                consignment_id: c.id,
                reseller_id: c.reseller_id,
                product_id: c.product_id,
                quantity: qty,
                unit_price: price,
                note: saleForm.note || null,
                sale_date: saleForm.sale_date,
            }])

            // Update consignment quantity_sold counter
            await supabase.from('reseller_consignments').update({
                quantity_sold: c.quantity_sold + qty,
            }).eq('id', c.id)

            // Reduce stock with_reseller
            const { data: stockRow } = await supabase
                .from('stock').select('id, quantity_with_reseller')
                .eq('product_id', c.product_id).maybeSingle()
            if (stockRow) {
                await supabase.from('stock').update({
                    quantity_with_reseller: Math.max(0, (stockRow.quantity_with_reseller || 0) - qty),
                    updated_at: new Date().toISOString(),
                }).eq('id', stockRow.id)
            }

            setShowSaleModal(null)
            setSaleForm(emptySaleForm)
            fetchAll()
        } catch (err) {
            console.error(err)
            setSaleError('Something went wrong.')
        } finally {
            setSavingSale(false)
        }
    }

    // ── Return products ────────────────────────────────────────
    async function reportReturn(c) {
        const remaining = c.quantity_given - c.quantity_sold - c.quantity_returned
        if (remaining <= 0) return
        if (!confirm(`Return all ${remaining} unsold unit(s) to your stock?`)) return

        try {
            await supabase.from('reseller_consignments').update({
                quantity_returned: c.quantity_returned + remaining,
            }).eq('id', c.id)

            const { data: stockRow } = await supabase
                .from('stock').select('id, quantity_available, quantity_with_reseller')
                .eq('product_id', c.product_id).maybeSingle()
            if (stockRow) {
                await supabase.from('stock').update({
                    quantity_available: (stockRow.quantity_available || 0) + remaining,
                    quantity_with_reseller: Math.max(0, (stockRow.quantity_with_reseller || 0) - remaining),
                    updated_at: new Date().toISOString(),
                }).eq('id', stockRow.id)
            }

            fetchAll()
        } catch (err) {
            console.error(err)
        }
    }

    // ── Settle consignment ────────────────────────────────────
    async function settle(id) {
        await supabase.from('reseller_consignments').update({
            is_settled: true,
            settled_at: new Date().toISOString().split('T')[0],
        }).eq('id', id)
        fetchAll()
    }

    // ── Helpers ───────────────────────────────────────────────
    const consignmentSales = cid => sales.filter(s => s.consignment_id === cid)
    const consignmentEarned = cid => consignmentSales(cid).reduce((s, sl) => s + (sl.total || 0), 0)

    const resellerBalance = rid => {
        const active = consignments.filter(c => c.reseller_id === rid && !c.is_settled)
        return active.reduce((sum, c) => sum + consignmentEarned(c.id), 0)
    }

    const resellerInHands = rid =>
        consignments
            .filter(c => c.reseller_id === rid && !c.is_settled)
            .reduce((s, c) => s + Math.max(0, c.quantity_given - c.quantity_sold - c.quantity_returned), 0)

    const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

    if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>

    if (resellers.length === 0) return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Resellers</h1>
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
                <p className="text-4xl mb-3">🤝</p>
                <p className="text-slate-600 font-semibold mb-1">No resellers yet</p>
                <p className="text-slate-400 text-sm mb-6">
                    Go to <strong>Clients</strong>, add a client and enable the <strong>Reseller</strong> toggle.
                </p>
                <button onClick={() => navigate('/clients')}
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
                <div className="flex gap-2 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
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
                const active = consignments.filter(c => c.reseller_id === reseller.id && !c.is_settled)
                const settled = consignments.filter(c => c.reseller_id === reseller.id && c.is_settled)
                const owes = resellerBalance(reseller.id)
                const stillHas = resellerInHands(reseller.id)

                return (
                    <div key={reseller.id} className="space-y-5">

                        {/* Summary card */}
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
                                    <p className="text-purple-200 text-xs mb-0.5">Owes you (actual)</p>
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
                                    <p className="text-xs text-purple-200">Total sold</p>
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
                                        const earned = consignmentEarned(c.id)
                                        const lotSales = consignmentSales(c.id)
                                        const pct = c.quantity_given > 0 ? ((c.quantity_sold || 0) / c.quantity_given * 100) : 0
                                        const isExpanded = expandedHistory === c.id

                                        return (
                                            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">

                                                {/* Top row */}
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <h3 className="font-semibold text-slate-800">{c.products?.name}</h3>
                                                        <p className="text-xs text-slate-400">
                                                            Given {fmt(c.date_given)}
                                                            {c.unit_price && ` · Reference: ${c.unit_price} TND/unit`}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-emerald-600">{earned.toFixed(2)} TND</p>
                                                        <p className="text-xs text-slate-400">collected so far</p>
                                                    </div>
                                                </div>

                                                {/* Progress */}
                                                <div className="mb-3">
                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                        <span>Sold: {c.quantity_sold || 0} / {c.quantity_given}</span>
                                                        <span className={remaining > 0 ? 'text-slate-500' : 'text-emerald-500'}>
                                                            {remaining > 0 ? `${remaining} remaining` : 'All sold'}
                                                        </span>
                                                    </div>
                                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-400 rounded-full transition-all"
                                                            style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>

                                                {/* Stats */}
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

                                                {/* Sales history toggle */}
                                                {lotSales.length > 0 && (
                                                    <button
                                                        onClick={() => setExpandedHist(isExpanded ? null : c.id)}
                                                        className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-sky-600 py-2 border-t border-slate-100 transition-colors mb-2">
                                                        <span className="font-medium">
                                                            {lotSales.length} sale{lotSales.length > 1 ? 's' : ''} recorded
                                                        </span>
                                                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                    </button>
                                                )}

                                                {/* Sales history detail */}
                                                {isExpanded && lotSales.length > 0 && (
                                                    <div className="mb-3 space-y-1.5 bg-slate-50 rounded-xl p-3">
                                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sale History</p>
                                                        {lotSales.map(sl => (
                                                            <div key={sl.id} className="flex items-center justify-between text-xs">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-slate-400">{fmt(sl.sale_date)}</span>
                                                                    <span className="text-slate-600 font-medium">
                                                                        {sl.quantity} unit{sl.quantity > 1 ? 's' : ''}
                                                                        {c.unit_price && parseFloat(sl.unit_price) !== parseFloat(c.unit_price) && (
                                                                            <span className="ml-1 text-amber-500">
                                                                                @ {sl.unit_price} TND
                                                                                {parseFloat(sl.unit_price) < parseFloat(c.unit_price) ? ' 🔽' : ' 🔼'}
                                                                            </span>
                                                                        )}
                                                                        {(!c.unit_price || parseFloat(sl.unit_price) === parseFloat(c.unit_price)) && (
                                                                            <span className="ml-1 text-slate-400">@ {sl.unit_price} TND</span>
                                                                        )}
                                                                    </span>
                                                                    {sl.note && <span className="text-slate-400 italic">· {sl.note}</span>}
                                                                </div>
                                                                <span className="font-bold text-emerald-600">{parseFloat(sl.total || 0).toFixed(2)} TND</span>
                                                            </div>
                                                        ))}
                                                        <div className="flex justify-between text-xs font-bold text-slate-700 border-t border-slate-200 pt-2 mt-1">
                                                            <span>Total earned</span>
                                                            <span className="text-emerald-600">{earned.toFixed(2)} TND</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {c.notes && (
                                                    <p className="text-xs text-slate-400 italic mb-3">"{c.notes}"</p>
                                                )}

                                                {/* Actions */}
                                                {remaining > 0 && (
                                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                                        <button onClick={() => openSaleModal(c)}
                                                            className="py-2.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 transition-colors">
                                                            💰 Report Sale
                                                        </button>
                                                        <button onClick={() => reportReturn(c)}
                                                            className="py-2.5 text-xs font-semibold bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl border border-orange-200 transition-colors">
                                                            ↩️ Return All ({remaining})
                                                        </button>
                                                    </div>
                                                )}

                                                {remaining === 0 && (
                                                    <button onClick={() => settle(c.id)}
                                                        className="w-full py-2.5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors flex items-center justify-center gap-2">
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
                                    {settled.map(c => {
                                        const earned = consignmentEarned(c.id)
                                        return (
                                            <div key={c.id} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between opacity-60">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700">{c.products?.name}</p>
                                                    <p className="text-xs text-slate-400">
                                                        {fmt(c.date_given)} · {c.quantity_sold} sold
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <p className="font-semibold text-emerald-600 text-sm">
                                                        {earned > 0 ? `${earned.toFixed(2)} TND` : `${((c.quantity_sold || 0) * (c.unit_price || 0)).toFixed(2)} TND`}
                                                    </p>
                                                    <button onClick={async () => {
                                                        await supabase.from('reseller_consignments').delete().eq('id', c.id)
                                                        fetchAll()
                                                    }}
                                                        className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}

            {/* ═══ GIVE PRODUCTS MODAL ═══ */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl
            max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">Give Products to Reseller</h2>
                            <button onClick={() => { setShowModal(false); setForm(emptyConsignment) }}
                                className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Reseller *</label>
                                <select value={form.reseller_id}
                                    onChange={e => setForm(f => ({ ...f, reseller_id: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                    <option value="">Select reseller...</option>
                                    {resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Product *</label>
                                <select value={form.product_id}
                                    onChange={e => {
                                        const prod = products.find(p => p.id === e.target.value)
                                        setForm(f => ({ ...f, product_id: e.target.value, unit_price: prod?.selling_price ? String(prod.selling_price) : '' }))
                                    }}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                    <option value="">Select product...</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Quantity *</label>
                                    <input type="number" min="1" value={form.quantity_given}
                                        onChange={e => setForm(f => ({ ...f, quantity_given: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 text-lg font-semibold" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                        Reference price (TND)
                                    </label>
                                    <input type="number" value={form.unit_price}
                                        onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                                        placeholder="Per unit"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                    <p className="text-xs text-slate-400 mt-1">Used as default in sales — can be overridden</p>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Date Given</label>
                                <input type="date" value={form.date_given}
                                    onChange={e => setForm(f => ({ ...f, date_given: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Notes</label>
                                <textarea value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    rows={2} placeholder="Any notes..."
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                            </div>
                        </div>
                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={() => { setShowModal(false); setForm(emptyConsignment) }}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={saveConsignment}
                                disabled={saving || !form.reseller_id || !form.product_id || !form.quantity_given}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                                {saving ? 'Saving...' : 'Give Products'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ REPORT SALE MODAL ═══ */}
            {showSaleModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl
            max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">Report Sale</h2>
                                <p className="text-sm text-slate-500 mt-0.5">{showSaleModal.products?.name}</p>
                            </div>
                            <button onClick={() => setShowSaleModal(null)}
                                className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
                        </div>

                        <div className="p-5 space-y-4">

                            {/* Remaining info */}
                            <div className="bg-slate-50 rounded-xl px-4 py-3 flex justify-between text-sm">
                                <span className="text-slate-500">Still with reseller</span>
                                <span className="font-bold text-slate-700">
                                    {showSaleModal.quantity_given - showSaleModal.quantity_sold - showSaleModal.quantity_returned} units
                                </span>
                            </div>

                            {/* Quantity */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Quantity sold *
                                </label>
                                <input
                                    type="number" min="1"
                                    max={showSaleModal.quantity_given - showSaleModal.quantity_sold - showSaleModal.quantity_returned}
                                    value={saleForm.quantity}
                                    onChange={e => setSaleForm(f => ({ ...f, quantity: e.target.value }))}
                                    className="w-full border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-3 text-2xl font-bold text-center focus:outline-none transition-colors" />
                            </div>

                            {/* Actual price per unit */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-sm font-medium text-slate-700">
                                        Actual price per unit (TND) *
                                    </label>
                                    {showSaleModal.unit_price && (
                                        <span className="text-xs text-slate-400">
                                            Reference: {showSaleModal.unit_price} TND
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="number" step="0.1"
                                    value={saleForm.unit_price}
                                    onChange={e => setSaleForm(f => ({ ...f, unit_price: e.target.value }))}
                                    placeholder="Enter the actual price sold at..."
                                    className="w-full border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-2.5 text-lg font-semibold focus:outline-none transition-colors" />

                                {/* Price difference indicator */}
                                {saleForm.unit_price && showSaleModal.unit_price && (
                                    (() => {
                                        const diff = parseFloat(saleForm.unit_price) - parseFloat(showSaleModal.unit_price)
                                        if (Math.abs(diff) < 0.01) return (
                                            <p className="text-xs text-emerald-600 mt-1 font-medium">✅ Same as reference price</p>
                                        )
                                        return (
                                            <p className={`text-xs mt-1 font-medium ${diff > 0 ? 'text-sky-600' : 'text-amber-600'}`}>
                                                {diff > 0 ? '🔼' : '🔽'} {Math.abs(diff).toFixed(2)} TND {diff > 0 ? 'above' : 'below'} reference price
                                            </p>
                                        )
                                    })()
                                )}
                            </div>

                            {/* Total preview */}
                            {saleForm.quantity && saleForm.unit_price && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
                                    <span className="text-sm text-emerald-700 font-medium">You receive</span>
                                    <span className="text-xl font-bold text-emerald-700">
                                        {(parseInt(saleForm.quantity) * parseFloat(saleForm.unit_price)).toFixed(2)} TND
                                    </span>
                                </div>
                            )}

                            {/* Sale date */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Sale date</label>
                                <input type="date" value={saleForm.sale_date}
                                    onChange={e => setSaleForm(f => ({ ...f, sale_date: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            {/* Note */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Note <span className="text-slate-400 font-normal">(optional)</span>
                                </label>
                                <input value={saleForm.note}
                                    onChange={e => setSaleForm(f => ({ ...f, note: e.target.value }))}
                                    placeholder="e.g. sold to a friend, market event..."
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            {saleError && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-medium">
                                    ⚠️ {saleError}
                                </div>
                            )}
                        </div>

                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={() => setShowSaleModal(null)}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={reportSale} disabled={savingSale}
                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                                {savingSale ? 'Saving...' : 'Confirm Sale'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}