import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, Pencil, History, Wrench } from 'lucide-react'

const CATEGORIES = [
    { key: 'crafting', label: 'Crafting stuff', emoji: '🔘' },
    { key: 'marketing', label: 'Marketing', emoji: '🔗' },
    { key: 'packaging', label: 'Packaging / Bags', emoji: '🛍️' },
    { key: 'Impression', label: 'Stickers / Labels', emoji: '🏷️' },
    { key: 'hardware', label: 'Hardware / Screws', emoji: '🔩' },
    { key: 'other', label: 'Other', emoji: '📦' },
]

const MANUAL_TYPES = [
    { key: 'purchased', label: 'Purchased', emoji: '🛒', sign: 1, desc: 'New stock received' },
    { key: 'adjustment', label: 'Adjustment', emoji: '⚙️', sign: 1, desc: 'Manual stock correction' },
    { key: 'damaged', label: 'Damaged', emoji: '💔', sign: -1, desc: 'Broken / unusable' },
    { key: 'gifted', label: 'Gifted', emoji: '🎁', sign: -1, desc: 'Given away' },
    { key: 'lost', label: 'Lost', emoji: '❓', sign: -1, desc: 'Missing stock' },
]

const emptyMat = { name: '', category: 'crafting', unit: 'unit', cost_per_unit: '', low_stock_threshold: 5, notes: '' }
const emptyMove = {
    material_id: '',
    type: 'purchased',
    quantity: 1,
    notes: '',
    amount: '',
    purchase_date: new Date().toISOString().split('T')[0],
}

export default function Materials() {
    const [materials, setMaterials] = useState([])
    const [movements, setMovements] = useState([])
    const [loading, setLoading] = useState(true)
    const [showMatModal, setShowMat] = useState(false)
    const [showMoveModal, setShowMove] = useState(false)
    const [form, setForm] = useState(emptyMat)
    const [moveForm, setMoveForm] = useState(emptyMove)
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [saving, setSaving] = useState(false)
    const [showHistory, setShowHist] = useState(null)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [filterCat, setFilterCat] = useState('all')

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        const [{ data: m }, { data: mv }] = await Promise.all([
            supabase.from('materials').select('*').order('category').order('name'),
            supabase.from('material_movements').select('*, materials(name)').order('created_at', { ascending: false }),
        ])
        setMaterials(m || [])
        setMovements(mv || [])
        setLoading(false)
    }

    function openAdd() { setForm(emptyMat); setEditing(null); setShowMat(true) }
    function openEdit(m) { setForm({ ...m }); setEditing(m.id); setShowMat(true) }
    function closeMat() { setShowMat(false); setForm(emptyMat); setEditing(null) }
    function closeMove() { setShowMove(false); setMoveForm(emptyMove); setError('') }

    async function saveMaterial() {
        if (!form.name.trim()) return
        setSaving(true)
        const payload = {
            ...form,
            cost_per_unit: parseFloat(form.cost_per_unit) || 0,
            low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
        }
        if (editing) {
            await supabase.from('materials').update(payload).eq('id', editing)
        } else {
            await supabase.from('materials').insert([payload])
        }
        setSaving(false); closeMat(); fetchAll()
    }

    async function deleteMaterial(id) {
        await supabase.from('materials').delete().eq('id', id)
        setDeleting(null); fetchAll()
    }

    async function logMovement() {
        if (!moveForm.material_id || !moveForm.quantity) return
        setError('')
        setSaving(true)

        const mt = MANUAL_TYPES.find(t => t.key === moveForm.type)
        const isPlus = mt.sign > 0
        const qty = parseInt(moveForm.quantity)
        const mat = materials.find(m => m.id === moveForm.material_id)

        // Block negative movements if not enough stock
        if (!isPlus && (mat?.quantity_available || 0) < qty) {
            setError(`Not enough stock. Available: ${mat?.quantity_available || 0}`)
            setSaving(false)
            return
        }

        try {
            // 1. Log movement
            await supabase.from('material_movements').insert([{
                material_id: moveForm.material_id,
                type: moveForm.type,
                quantity: qty,
                is_positive: isPlus,
                notes: moveForm.notes || null,
            }])

            // 2. Update stock
            const newQty = (mat?.quantity_available || 0) + (isPlus ? qty : -qty)
            await supabase.from('materials').update({
                quantity_available: Math.max(0, newQty),
            }).eq('id', moveForm.material_id)

            // 3. Auto-create expense if this is a purchase
            if (moveForm.type === 'purchased' && parseFloat(moveForm.amount) > 0) {
                await supabase.from('expenses').insert([{
                    category: 'material',
                    amount: parseFloat(moveForm.amount),
                    description: mat?.name || 'Material purchase',
                    date: moveForm.purchase_date || new Date().toISOString().split('T')[0],
                }])
            }

            setShowMove(false)
            setMoveForm(emptyMove)
            fetchAll()

        } catch (err) {
            console.error(err)
            setError('Something went wrong.')
        } finally {
            setSaving(false)
        }
    }

    const catInfo = key => CATEGORIES.find(c => c.key === key) || CATEGORIES[5]
    const matMoves = mid => movements.filter(m => m.material_id === mid)
    const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

    const filtered = materials.filter(m => {
        const matchSearch = m.name.toLowerCase().includes(search.toLowerCase())
        const matchCat = filterCat === 'all' || m.category === filterCat
        return matchSearch && matchCat
    })

    const lowMats = materials.filter(m => m.quantity_available <= (m.low_stock_threshold || 5))
    const totalValue = materials.reduce((s, m) => s + (m.quantity_available * (m.cost_per_unit || 0)), 0)

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Materials & Supplies</h1>
                    <p className="text-sm text-slate-500">{materials.length} items tracked</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { setShowMove(true); setError('') }}
                        className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2.5 rounded-xl font-medium text-sm transition-colors">
                        ± Stock
                    </button>
                    <button onClick={openAdd}
                        className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
                        <Plus size={18} /> New Material
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-slate-700">{materials.length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Total items</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                    <p className="text-2xl font-bold text-amber-500">{lowMats.length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">⚠️ Low stock</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
                    <p className="text-xl font-bold text-sky-600">{totalValue.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">TND stock value</p>
                </div>
            </div>

            {/* Low stock alert */}
            {lowMats.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
                    <p className="text-sm font-bold text-amber-700 mb-2">⚠️ Low Stock Alert</p>
                    <div className="flex flex-wrap gap-2">
                        {lowMats.map(m => (
                            <span key={m.id} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-medium">
                                {catInfo(m.category).emoji} {m.name} — {m.quantity_available} left
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Search + filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search materials..."
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300" />
                <div className="flex gap-2 overflow-x-auto">
                    <button onClick={() => setFilterCat('all')}
                        className={`px-3 py-2 rounded-xl text-xs font-medium flex-shrink-0 transition-colors
              ${filterCat === 'all' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                        All
                    </button>
                    {CATEGORIES.map(c => (
                        <button key={c.key} onClick={() => setFilterCat(filterCat === c.key ? 'all' : c.key)}
                            className={`px-3 py-2 rounded-xl text-xs font-medium flex-shrink-0 transition-colors
                ${filterCat === c.key ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                            {c.emoji} {c.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Materials list */}
            {loading ? (
                <div className="text-center py-20 text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <Wrench size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-400 font-medium">No materials yet</p>
                    <p className="text-slate-400 text-sm">Add switches, chains, bags and other supplies</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map(m => {
                        const cat = catInfo(m.category)
                        const isLow = m.quantity_available <= (m.low_stock_threshold || 5)
                        const isOut = m.quantity_available === 0
                        const moves = matMoves(m.id)

                        return (
                            <div key={m.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{cat.emoji}</span>
                                        <div>
                                            <h3 className="font-semibold text-slate-800">{m.name}</h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs text-slate-400">{cat.label}</span>
                                                <span className="text-xs text-slate-300">·</span>
                                                <span className="text-xs text-slate-400">{m.unit}</span>
                                                {m.cost_per_unit > 0 && (
                                                    <>
                                                        <span className="text-xs text-slate-300">·</span>
                                                        <span className="text-xs text-slate-400">{m.cost_per_unit} TND/{m.unit}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => setShowHist(showHistory === m.id ? null : m.id)}
                                            className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg">
                                            <History size={14} />
                                        </button>
                                        <button onClick={() => openEdit(m)}
                                            className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg">
                                            <Pencil size={14} />
                                        </button>
                                        <button onClick={() => setDeleting(m)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 mb-3">
                                    <div className={`rounded-xl px-4 py-2 text-center flex-1
                    ${isOut ? 'bg-red-50 border border-red-200' : isLow ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50'}`}>
                                        <p className={`text-2xl font-bold ${isOut ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                                            {m.quantity_available}
                                        </p>
                                        <p className="text-xs text-slate-500">in stock</p>
                                    </div>
                                    <div className="flex-1 text-center">
                                        <p className="text-sm text-slate-400">Low stock alert at</p>
                                        <p className="font-semibold text-slate-600">{m.low_stock_threshold || 5} units</p>
                                    </div>
                                    {m.cost_per_unit > 0 && (
                                        <div className="flex-1 text-center">
                                            <p className="text-sm text-slate-400">Stock value</p>
                                            <p className="font-semibold text-sky-600">
                                                {(m.quantity_available * m.cost_per_unit).toFixed(2)} TND
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Quick action buttons */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => {
                                        setMoveForm({ ...emptyMove, material_id: m.id, type: 'purchased' })
                                        setShowMove(true)
                                    }}
                                        className="py-2 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200">
                                        🛒 Add Stock
                                    </button>
                                    <button onClick={() => {
                                        setMoveForm({ ...emptyMove, material_id: m.id, type: 'damaged' })
                                        setShowMove(true)
                                    }}
                                        className="py-2 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200">
                                        ⚙️ Adjust
                                    </button>
                                </div>

                                {m.notes && <p className="text-xs text-slate-400 mt-2 italic">"{m.notes}"</p>}

                                {/* Movement history */}
                                {showHistory === m.id && (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">History</p>
                                        {moves.length === 0 ? (
                                            <p className="text-xs text-slate-400">No movements yet</p>
                                        ) : (
                                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                                {moves.map(mv => {
                                                    const t = MANUAL_TYPES.find(t => t.key === mv.type) || { emoji: '•', sign: 1 }
                                                    const isPos = mv.is_positive !== false
                                                    return (
                                                        <div key={mv.id} className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <span>{t.emoji || '•'}</span>
                                                                <span className="text-slate-600">{mv.type}</span>
                                                                {mv.notes && <span className="text-slate-400 italic">· {mv.notes}</span>}
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <span className={`font-bold ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                    {isPos ? '+' : '-'}{mv.quantity}
                                                                </span>
                                                                <span className="text-slate-400">{fmt(mv.created_at)}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Add/Edit Material Modal */}
            {showMatModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">{editing ? 'Edit Material' : 'New Material'}</h2>
                            <button onClick={closeMat} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Name *</label>
                                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Cherry MX Blue Switch"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-2">Category</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {CATEGORIES.map(c => (
                                        <button key={c.key}
                                            onClick={() => setForm(f => ({ ...f, category: c.key }))}
                                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-all
                        ${form.category === c.key ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                                            <span>{c.emoji}</span>
                                            <span className="text-xs font-medium text-slate-700">{c.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Unit</label>
                                    <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                        {['unit', 'piece', 'meter', 'cm', 'gram', 'kg', 'bag', 'roll', 'sheet'].map(u =>
                                            <option key={u}>{u}</option>
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Cost per unit (TND)</label>
                                    <input type="number" value={form.cost_per_unit}
                                        onChange={e => setForm(f => ({ ...f, cost_per_unit: e.target.value }))}
                                        placeholder="0.00"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">
                                    Low stock alert threshold
                                </label>
                                <input type="number" min="1" value={form.low_stock_threshold}
                                    onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                <p className="text-xs text-slate-400 mt-1">Alert when stock drops to or below this number</p>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Supplier, references, details..."
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                            </div>
                        </div>
                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={closeMat}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={saveMaterial} disabled={saving || !form.name.trim()}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Material'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Log Movement Modal */}
            {showMoveModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl
                      max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">

                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">Stock Movement</h2>
                            <button onClick={() => { setShowMove(false); setMoveForm(emptyMove) }}
                                className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
                        </div>

                        <div className="p-5 space-y-4">

                            {/* Material */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Material *</label>
                                <select value={moveForm.material_id}
                                    onChange={e => {
                                        const matId = e.target.value
                                        const mat = materials.find(m => m.id === matId)
                                        const autoAmount = mat?.cost_per_unit
                                            ? (mat.cost_per_unit * (parseInt(moveForm.quantity) || 1)).toFixed(2)
                                            : moveForm.amount
                                        setMoveForm(f => ({ ...f, material_id: matId, amount: autoAmount }))
                                    }}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                    <option value="">Select material...</option>
                                    {materials.map(m => (
                                        <option key={m.id} value={m.id}>
                                            {catInfo(m.category).emoji} {m.name} ({m.quantity_available} in stock)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Movement type */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-2">Type *</label>
                                <div className="space-y-2">
                                    {MANUAL_TYPES.map(t => (
                                        <button key={t.key}
                                            onClick={() => setMoveForm(f => ({ ...f, type: t.key }))}
                                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all
                                              ${moveForm.type === t.key
                                                    ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-200'
                                                    : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                            <span className="text-xl">{t.emoji}</span>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-800">{t.label}</p>
                                                <p className="text-xs text-slate-400">
                                                    {t.desc} · {t.sign > 0 ? 'Adds to' : 'Removes from'} stock
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quantity */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Quantity *</label>
                                <input
                                    type="number" min="1" value={moveForm.quantity}
                                    onChange={e => {
                                        const qty = e.target.value
                                        const mat = materials.find(m => m.id === moveForm.material_id)
                                        const autoAmount = mat?.cost_per_unit && moveForm.type === 'purchased'
                                            ? (mat.cost_per_unit * (parseInt(qty) || 1)).toFixed(2)
                                            : moveForm.amount
                                        setMoveForm(f => ({ ...f, quantity: qty, amount: autoAmount }))
                                    }}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            {/* Purchase-only fields */}
                            {moveForm.type === 'purchased' && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                                        💰 Purchase Details — will create an expense automatically
                                    </p>

                                    <div>
                                        <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                            Amount paid (TND) *
                                        </label>
                                        <input
                                            type="number"
                                            value={moveForm.amount}
                                            onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))}
                                            placeholder="0.00"
                                            className="w-full border border-emerald-300 rounded-xl px-3 py-2.5 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                                        {materials.find(m => m.id === moveForm.material_id)?.cost_per_unit > 0 && (
                                            <p className="text-xs text-emerald-600 mt-1">
                                                Auto-calculated from {materials.find(m => m.id === moveForm.material_id)?.cost_per_unit} TND/unit × {moveForm.quantity} unit{moveForm.quantity > 1 ? 's' : ''}
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                            Purchase Date
                                        </label>
                                        <input
                                            type="date"
                                            value={moveForm.purchase_date}
                                            onChange={e => setMoveForm(f => ({ ...f, purchase_date: e.target.value }))}
                                            className="w-full border border-emerald-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                                    </div>

                                    {/* Preview of the expense that will be created */}
                                    {moveForm.amount && (
                                        <div className="bg-white rounded-xl px-3 py-2.5 text-xs text-slate-600 border border-emerald-200">
                                            <p className="font-semibold text-slate-700 mb-0.5">Expense that will be created:</p>
                                            <p>📦 Category: <span className="font-medium">Materials &amp; Supplies</span></p>
                                            <p>📝 Description: <span className="font-medium">
                                                {materials.find(m => m.id === moveForm.material_id)?.name || '—'}
                                            </span></p>
                                            <p>💰 Amount: <span className="font-medium text-red-500">{moveForm.amount} TND</span></p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Notes */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Notes</label>
                                <input value={moveForm.notes}
                                    onChange={e => setMoveForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Optional details..."
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-medium">
                                    ⚠️ {error}
                                </div>
                            )}
                        </div>

                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={() => { setShowMove(false); setMoveForm(emptyMove) }}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button
                                onClick={logMovement}
                                disabled={saving || !moveForm.material_id || !moveForm.quantity ||
                                    (moveForm.type === 'purchased' && !moveForm.amount)}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                                {saving ? 'Saving...' : moveForm.type === 'purchased' ? 'Add Stock + Log Expense' : 'Apply'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleting && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete material?</h3>
                        <p className="text-slate-500 text-sm mb-5">"{deleting.name}" will be removed from all records.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleting(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={() => deleteMaterial(deleting.id)}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}