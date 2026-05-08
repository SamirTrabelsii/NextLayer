import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Package, ArrowUp, ArrowDown, History } from 'lucide-react'

const MOVEMENT_TYPES = [
  { key: 'produced',               label: 'Produced',               emoji: '✅', color: 'text-emerald-600', sign: +1 },
  { key: 'sold',                   label: 'Sold',                   emoji: '💰', color: 'text-blue-600',    sign: -1 },
  { key: 'given_to_reseller',      label: 'Given to Reseller',      emoji: '🤝', color: 'text-purple-600', sign: -1 },
  { key: 'returned_from_reseller', label: 'Returned from Reseller', emoji: '↩️', color: 'text-orange-600', sign: +1 },
  { key: 'adjustment',             label: 'Manual Adjustment',      emoji: '⚙️', color: 'text-slate-600',  sign: +1 },
]

const emptyMovement = { product_id: '', type: 'produced', quantity: 1, notes: '' }

export default function Stock() {
  const [stock, setStock]           = useState([])
  const [movements, setMovements]   = useState([])
  const [products, setProducts]     = useState([])
  const [clients, setClients]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [showHistory, setShowHistory] = useState(null)
  const [form, setForm]             = useState(emptyMovement)
  const [saving, setSaving]         = useState(false)
  const [search, setSearch]         = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: st }, { data: mv }, { data: pr }, { data: cl }] = await Promise.all([
      supabase.from('stock').select('*, products(id, name, category, selling_price)').order('updated_at', { ascending: false }),
      supabase.from('stock_movements').select('*, products(name), clients(name)').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, category').eq('is_active', true).order('name'),
      supabase.from('clients').select('id, name').eq('is_reseller', true).order('name'),
    ])
    setStock(st || [])
    setMovements(mv || [])
    setProducts(pr || [])
    setClients(cl || [])
    setLoading(false)
  }

  async function logMovement() {
    if (!form.product_id || !form.quantity) return
    setSaving(true)

    const qty = parseInt(form.quantity)
    const type = MOVEMENT_TYPES.find(t => t.key === form.type)

    // Log movement
    await supabase.from('stock_movements').insert([{
      product_id: form.product_id,
      type: form.type,
      quantity: Math.abs(qty),
      notes: form.notes,
      client_id: form.client_id || null,
    }])

    // Get existing stock row
    const { data: existing } = await supabase
      .from('stock')
      .select('*')
      .eq('product_id', form.product_id)
      .single()

    if (existing) {
      let newAvail    = existing.quantity_available
      let newReseller = existing.quantity_with_reseller

      if (form.type === 'produced')               { newAvail    += qty }
      if (form.type === 'sold')                   { newAvail    -= qty }
      if (form.type === 'given_to_reseller')      { newAvail    -= qty; newReseller += qty }
      if (form.type === 'returned_from_reseller') { newAvail    += qty; newReseller -= qty }
      if (form.type === 'adjustment')             { newAvail    += qty }

      await supabase.from('stock').update({
        quantity_available:    Math.max(0, newAvail),
        quantity_with_reseller: Math.max(0, newReseller),
        updated_at: new Date().toISOString(),
      }).eq('product_id', form.product_id)
    } else {
      // Create new stock row
      await supabase.from('stock').insert([{
        product_id:             form.product_id,
        quantity_available:     form.type === 'produced' ? qty : 0,
        quantity_with_reseller: form.type === 'given_to_reseller' ? qty : 0,
      }])
    }

    setSaving(false)
    setShowModal(false)
    setForm(emptyMovement)
    fetchAll()
  }

  const filtered = stock.filter(s =>
    s.products?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalAvailable = stock.reduce((s, i) => s + (i.quantity_available || 0), 0)
  const totalReseller  = stock.reduce((s, i) => s + (i.quantity_with_reseller || 0), 0)
  const lowStock       = stock.filter(s => s.quantity_available <= 2 && s.quantity_available > 0)
  const outOfStock     = stock.filter(s => s.quantity_available === 0)

  const productMovements = (productId) =>
    movements.filter(m => m.product_id === productId)

  const mt = key => MOVEMENT_TYPES.find(t => t.key === key) || MOVEMENT_TYPES[0]

  const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Stock</h1>
          <p className="text-sm text-slate-500">{stock.length} products tracked</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
          <Plus size={18} /> Log Movement
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{totalAvailable}</p>
          <p className="text-xs text-slate-400 mt-0.5">📦 In Stock</p>
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
          <p className="text-sm font-bold text-amber-700 mb-2">⚠️ Low Stock Alert</p>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(s => (
              <span key={s.id} className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-lg font-medium">
                {s.products?.name} — {s.quantity_available} left
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search products..."
        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 mb-5" />

      {/* Stock table */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Package size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 font-medium">No stock tracked yet</p>
          <p className="text-slate-400 text-sm">Log a "Produced" movement to add your first item</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(s => {
            const total = (s.quantity_available || 0) + (s.quantity_with_reseller || 0)
            const pct   = total > 0 ? (s.quantity_available / total) * 100 : 0
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
                  <div className={`rounded-xl p-3 text-center ${isLow && s.quantity_available > 0 ? 'bg-amber-50 border border-amber-200' : s.quantity_available === 0 ? 'bg-red-50 border border-red-200' : 'bg-emerald-50'}`}>
                    <p className={`text-xl font-bold ${isLow ? 'text-amber-600' : s.quantity_available === 0 ? 'text-red-500' : 'text-emerald-600'}`}>
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

                {/* Stock bar */}
                <div className="mb-3">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-400 transition-all"
                      style={{ width: `${pct}%` }} />
                    <div className="h-full bg-purple-300 transition-all"
                      style={{ width: `${total > 0 ? ((s.quantity_with_reseller || 0) / total) * 100 : 0}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Available</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-300 inline-block" /> Reseller</span>
                  </div>
                </div>

                {/* Quick action buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setForm({ ...emptyMovement, product_id: s.product_id, type: 'produced' }); setShowModal(true) }}
                    className="py-2 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1">
                    <ArrowUp size={13} /> Add Stock
                  </button>
                  <button onClick={() => { setForm({ ...emptyMovement, product_id: s.product_id, type: 'sold' }); setShowModal(true) }}
                    className="py-2 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl border border-blue-200 transition-colors flex items-center justify-center gap-1">
                    <ArrowDown size={13} /> Sell
                  </button>
                </div>

                {/* Movement history */}
                {showHistory === s.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Movement History</p>
                    {productMovements(s.product_id).length === 0 ? (
                      <p className="text-xs text-slate-400">No movements yet</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {productMovements(s.product_id).map(m => {
                          const t = mt(m.type)
                          return (
                            <div key={m.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span>{t.emoji}</span>
                                <span className="text-slate-600">{t.label}</span>
                                {m.clients?.name && <span className="text-slate-400">· {m.clients.name}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${t.sign > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {t.sign > 0 ? '+' : '-'}{m.quantity}
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

      {/* Log Movement Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
              <h2 className="text-lg font-bold text-slate-800">Log Stock Movement</h2>
              <button onClick={() => { setShowModal(false); setForm(emptyMovement) }}
                className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">

              {/* Product */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Product *</label>
                <select value={form.product_id}
                  onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                  <option value="">Select product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Movement type */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Movement Type *</label>
                <div className="grid grid-cols-1 gap-2">
                  {MOVEMENT_TYPES.map(t => (
                    <button key={t.key}
                      onClick={() => setForm(f => ({ ...f, type: t.key }))}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all
                        ${form.type === t.key
                          ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-200'
                          : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <span className="text-xl">{t.emoji}</span>
                      <div>
                        <p className={`text-sm font-semibold ${t.color}`}>{t.label}</p>
                        <p className="text-xs text-slate-400">
                          {t.key === 'produced'               && 'Add finished products to stock'}
                          {t.key === 'sold'                   && 'Remove sold items from stock'}
                          {t.key === 'given_to_reseller'      && 'Transfer to reseller for selling'}
                          {t.key === 'returned_from_reseller' && 'Products returned back to you'}
                          {t.key === 'adjustment'             && 'Manual stock correction'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Quantity *</label>
                <input type="number" min="1" value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 text-lg font-semibold" />
              </div>

              {/* Client (for reseller movements) */}
              {(form.type === 'given_to_reseller' || form.type === 'returned_from_reseller') && clients.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Reseller</label>
                  <select value={form.client_id || ''}
                    onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                    <option value="">Select reseller...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                <input value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional note..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-3">
              <button onClick={() => { setShowModal(false); setForm(emptyMovement) }}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={logMovement}
                disabled={saving || !form.product_id || !form.quantity}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                {saving ? 'Saving...' : 'Log Movement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}