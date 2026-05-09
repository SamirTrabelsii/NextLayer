import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Package, History } from 'lucide-react'

// Manual movement types only — stock added automatically via productions
const MANUAL_TYPES = [
  { key: 'adjustment', label: 'Stock Adjustment', emoji: '⚙️', color: 'text-slate-600', sign: 1, desc: 'Correction, found more stock' },
  { key: 'damaged', label: 'Damaged', emoji: '💔', color: 'text-red-500', sign: -1, desc: 'Broken or unusable products' },
  { key: 'gifted', label: 'Gifted', emoji: '🎁', color: 'text-purple-500', sign: -1, desc: 'Given away as gift' },
  { key: 'lost', label: 'Lost', emoji: '❓', color: 'text-orange-500', sign: -1, desc: 'Missing / lost products' },
]

// All movement types for display in history
const ALL_TYPES = {
  produced: { label: 'Produced', emoji: '✅', sign: 1 },
  sold: { label: 'Sold', emoji: '💰', sign: -1 },
  given_to_reseller: { label: 'Given to Reseller', emoji: '🤝', sign: -1 },
  returned_from_reseller: { label: 'From Reseller', emoji: '↩️', sign: 1 },
  adjustment: { label: 'Adjustment', emoji: '⚙️', sign: 1 },
  damaged: { label: 'Damaged', emoji: '💔', sign: -1 },
  gifted: { label: 'Gifted', emoji: '🎁', sign: -1 },
  lost: { label: 'Lost', emoji: '❓', sign: -1 },
}

const emptyForm = { product_id: '', type: 'adjustment', quantity: 1, is_positive: true, notes: '' }

export default function Stock() {
  const [stock, setStock] = useState([])
  const [movements, setMovements] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showHistory, setShowHistory] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: st }, { data: mv }, { data: pr }] = await Promise.all([
      supabase.from('stock').select('*, products(id,name,category,selling_price)').order('updated_at', { ascending: false }),
      supabase.from('stock_movements').select('*, products(name), clients(name)').order('created_at', { ascending: false }),
      supabase.from('products').select('id,name,category').eq('is_active', true).order('name'),
    ])
    setStock(st || [])
    setMovements(mv || [])
    setProducts(pr || [])
    setLoading(false)
  }

  async function logManualMovement() {
    if (!form.product_id || !form.quantity) return
    setError('')
    setSaving(true)

    const qty = parseInt(form.quantity)
    const mt = MANUAL_TYPES.find(t => t.key === form.type)
    const isPlus = mt.sign > 0

    const { data: existing } = await supabase.from('stock')
      .select('*').eq('product_id', form.product_id).single()

    // Check if enough stock for negative movements
    if (!isPlus) {
      const avail = existing?.quantity_available || 0
      if (avail < qty) {
        setError(`Not enough stock. Available: ${avail} units.`)
        setSaving(false)
        return
      }
    }

    // Log movement
    await supabase.from('stock_movements').insert([{
      product_id: form.product_id,
      type: form.type,
      quantity: qty,
      is_positive: isPlus,
      notes: form.notes,
    }])

    // Update stock
    if (existing) {
      await supabase.from('stock').update({
        quantity_available: Math.max(0, (existing.quantity_available || 0) + (isPlus ? qty : -qty)),
        updated_at: new Date().toISOString(),
      }).eq('product_id', form.product_id)
    } else if (isPlus) {
      await supabase.from('stock').insert([{
        product_id: form.product_id,
        quantity_available: qty,
        quantity_with_reseller: 0,
      }])
    }

    setSaving(false)
    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
  }

  const filtered = stock.filter(s =>
    s.products?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalAvailable = stock.reduce((s, i) => s + (i.quantity_available || 0), 0)
  const totalReseller = stock.reduce((s, i) => s + (i.quantity_with_reseller || 0), 0)
  const lowStock = stock.filter(s => s.quantity_available > 0 && s.quantity_available <= 2)
  const outOfStock = stock.filter(s => s.quantity_available === 0)

  const productMovements = pid => movements.filter(m => m.product_id === pid)

  const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const movTypeInfo = key => ALL_TYPES[key] || { label: key, emoji: '•', sign: 1 }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Stock</h1>
          <p className="text-sm text-slate-500">{stock.length} products tracked</p>
        </div>
        <button onClick={() => { setShowModal(true); setError('') }}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
          <Plus size={18} /> Manual Adjustment
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 mb-5 text-xs text-sky-700">
        <p className="font-semibold mb-0.5">📦 How stock works in this platform</p>
        <p>✅ <strong>Added automatically</strong> when a production (without order) is marked Done</p>
        <p>💰 <strong>Reduced automatically</strong> when a standard order is marked Paid</p>
        <p>🤝 <strong>Reseller transfers</strong> managed from the Reseller page</p>
        <p>⚙️ <strong>Use "Manual Adjustment"</strong> only for corrections, damaged, gifted, lost items</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{totalAvailable}</p>
          <p className="text-xs text-slate-400 mt-0.5">📦 Available</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{totalReseller}</p>
          <p className="text-xs text-slate-400 mt-0.5">🤝 With Reseller</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{lowStock.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">⚠️ Low Stock</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{outOfStock.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">🚫 Out of Stock</p>
        </div>
      </div>

      {/* Alerts */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
          <p className="text-sm font-bold text-amber-700 mb-2">⚠️ Low Stock</p>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(s => (
              <span key={s.id} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-medium">
                {s.products?.name} — {s.quantity_available} left
              </span>
            ))}
          </div>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search products..."
        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 mb-5" />

      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Package size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 font-medium">No stock yet</p>
          <p className="text-slate-400 text-sm">Complete a production job to add stock automatically</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(s => {
            const total = (s.quantity_available || 0) + (s.quantity_with_reseller || 0)
            const pct = total > 0 ? (s.quantity_available / total) * 100 : 0
            const isLow = s.quantity_available <= 2

            return (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-800">{s.products?.name}</h3>
                    <p className="text-xs text-slate-400">{s.products?.category}</p>
                  </div>
                  <button onClick={() => setShowHistory(showHistory === s.id ? null : s.id)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-sky-500 px-2 py-1 rounded-lg hover:bg-sky-50 transition-colors">
                    <History size={13} /> History
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className={`rounded-xl p-3 text-center
                    ${s.quantity_available === 0 ? 'bg-red-50 border border-red-200' :
                      isLow ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50'}`}>
                    <p className={`text-xl font-bold ${s.quantity_available === 0 ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {s.quantity_available}
                    </p>
                    <p className="text-xs text-slate-500">Available</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-purple-600">{s.quantity_with_reseller || 0}</p>
                    <p className="text-xs text-slate-500">Reseller</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-slate-700">{total}</p>
                    <p className="text-xs text-slate-500">Total</p>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                    <div className="h-full bg-purple-300"
                      style={{ width: `${total > 0 ? ((s.quantity_with_reseller || 0) / total) * 100 : 0}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Available
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-300 inline-block" /> Reseller
                    </span>
                  </div>
                </div>

                {/* Movement history */}
                {showHistory === s.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Movement History</p>
                    {productMovements(s.product_id).length === 0 ? (
                      <p className="text-xs text-slate-400">No movements yet</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {productMovements(s.product_id).map(m => {
                          const t = movTypeInfo(m.type)
                          const isPos = m.is_positive !== false && t.sign > 0
                          return (
                            <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                              <div className="flex items-center gap-2">
                                <span>{t.emoji}</span>
                                <span className="text-slate-600">{t.label}</span>
                                {m.notes && <span className="text-slate-400 italic truncate max-w-24">· {m.notes}</span>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`font-bold ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {isPos ? '+' : '-'}{m.quantity}
                                </span>
                                <span className="text-slate-400">{fmt(m.created_at)}</span>
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

      {/* Manual Adjustment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
              <h2 className="text-lg font-bold text-slate-800">Manual Stock Adjustment</h2>
              <button onClick={() => { setShowModal(false); setForm(emptyForm); setError('') }}
                className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Product *</label>
                <select value={form.product_id}
                  onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                  <option value="">Select product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Reason *</label>
                <div className="grid grid-cols-1 gap-2">
                  {MANUAL_TYPES.map(t => (
                    <button key={t.key}
                      onClick={() => setForm(f => ({ ...f, type: t.key, is_positive: t.sign > 0 }))}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all
                        ${form.type === t.key ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <span className="text-xl">{t.emoji}</span>
                      <div>
                        <p className={`text-sm font-semibold ${t.color}`}>{t.label}</p>
                        <p className="text-xs text-slate-400">{t.desc} — {t.sign > 0 ? 'Increases' : 'Decreases'} stock</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Quantity *</label>
                <input type="number" min="1" value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 text-lg font-semibold" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                <input value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Reason or details..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-medium">
                  ⚠️ {error}
                </div>
              )}
            </div>
            <div className="p-5 pt-0 flex gap-3">
              <button onClick={() => { setShowModal(false); setForm(emptyForm); setError('') }}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={logManualMovement}
                disabled={saving || !form.product_id || !form.quantity}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                {saving ? 'Saving...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}