import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Pencil, Trash2, AlertTriangle, Package } from 'lucide-react'

const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'PLA-CF', 'PETG-CF', 'ASA', 'Resin', 'Other']

const emptyForm = {
  name: '', brand: '', material: 'PLA', color_name: '', color_hex: '#ffffff',
  initial_weight_g: 1000, current_weight_g: 1000,
  purchase_price_tnd: '', purchase_date: new Date().toISOString().split('T')[0], notes: '',
}

// Euclidean RGB distance between two hex colors
function colorDistance(hex1, hex2) {
  try {
    const parse = h => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16),
    ]
    const [r1, g1, b1] = parse(hex1 || '#000000')
    const [r2, g2, b2] = parse(hex2 || '#000000')
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
  } catch { return 999 }
}

export { colorDistance }

export default function Filaments() {
  const [spools, setSpools] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [filterMat, setFilterMat] = useState('all')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('filament_spools').select('*').order('created_at', { ascending: false }),
      supabase.from('filament_spool_logs').select('*,productions(description,products(name))'),
    ])
    setSpools(s || [])
    setLogs(l || [])
    setLoading(false)
  }

  function openAdd() {
    setForm(emptyForm)
    setEditing(null)
    setShowModal(true)
  }

  function openEdit(spool) {
    setForm({ ...spool, purchase_price_tnd: spool.purchase_price_tnd || '' })
    setEditing(spool.id)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setForm(emptyForm)
    setEditing(null)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        brand: form.brand || null,
        material: form.material,
        color_name: form.color_name || null,
        color_hex: form.color_hex || null,
        initial_weight_g: parseFloat(form.initial_weight_g) || 1000,
        current_weight_g: parseFloat(form.current_weight_g) || 0,
        purchase_price_tnd: parseFloat(form.purchase_price_tnd) || null,
        purchase_date: form.purchase_date || null,
        notes: form.notes || null,
        is_active: true,
      }

      if (editing) {
        // ── Edit: just update the spool, no new expense ──────────
        await supabase.from('filament_spools').update(payload).eq('id', editing)

      } else {
        // ── New spool: insert spool + auto-create expense ────────
        await supabase.from('filament_spools').insert([payload])

        // Auto-create expense if a purchase price was entered
        if (payload.purchase_price_tnd > 0) {
          const description = [
            payload.name,
            payload.brand ? `(${payload.brand})` : null,
            payload.initial_weight_g ? `${payload.initial_weight_g}g` : null,
          ].filter(Boolean).join(' ')

          await supabase.from('expenses').insert([{
            category: 'filament',
            amount: payload.purchase_price_tnd,
            description,
            date: payload.purchase_date || new Date().toISOString().split('T')[0],
          }])
        }
      }

      closeModal()
      fetchAll()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSpool() {
    if (!deleting) return
    await supabase.from('filament_spools').delete().eq('id', deleting.id)
    setDeleting(null)
    fetchAll()
  }

  const pricePerKg = spool =>
    spool.purchase_price_tnd && spool.initial_weight_g
      ? (spool.purchase_price_tnd / (spool.initial_weight_g / 1000)).toFixed(2)
      : null

  const pctRemaining = spool =>
    spool.initial_weight_g > 0
      ? Math.max(0, Math.min(100, (spool.current_weight_g / spool.initial_weight_g) * 100))
      : 0

  const isLow = spool =>
    spool.current_weight_g < 100 || pctRemaining(spool) < 15

  const isEmpty = spool => spool.current_weight_g <= 0

  const filtered = spools.filter(s =>
    filterMat === 'all' || s.material === filterMat
  )

  const totalStats = {
    spools: spools.length,
    low: spools.filter(isLow).length,
    empty: spools.filter(isEmpty).length,
  }

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Filament Spools</h1>
          <p className="text-sm text-slate-500">
            {totalStats.spools} spools ·{' '}
            {totalStats.low > 0 && (
              <span className="text-amber-500 font-medium">{totalStats.low} low · </span>
            )}
            {totalStats.empty > 0 && (
              <span className="text-red-500 font-medium">{totalStats.empty} empty</span>
            )}
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
          <Plus size={18} /> Add Spool
        </button>
      </div>

      {/* Low spool alert */}
      {totalStats.low > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mb-5">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-700">
            {spools.filter(isLow).map(s => `${s.color_name || s.color_hex || s.material} (${s.current_weight_g.toFixed(0)}g)`).join(', ')}
          </p>
        </div>
      )}

      {/* Material filter tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {['all', ...new Set(spools.map(s => s.material))].map(mat => (
          <button key={mat} onClick={() => setFilterMat(mat)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium flex-shrink-0 transition-colors
              ${filterMat === mat ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {mat === 'all' ? 'All' : mat}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Package size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 font-medium">No spools yet</p>
          <p className="text-slate-400 text-sm">Add your filament spools to track usage and cost.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(spool => {
            const pct = pctRemaining(spool)
            const low = isLow(spool)
            const empty = isEmpty(spool)
            const pkgStr = pricePerKg(spool)
            const spoolLogs = logs.filter(l => l.spool_id === spool.id)
            const totalUsed = spoolLogs.reduce((s, l) => s + (l.grams_used || 0), 0)

            return (
              <div key={spool.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 transition-all
                  ${empty ? 'opacity-60' : ''}
                  ${low && !empty ? 'border-amber-200' : 'border-slate-100'}`}>

                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* Color swatch */}
                    <div className="w-10 h-10 rounded-xl border-2 border-white shadow-md flex-shrink-0"
                      style={{ backgroundColor: spool.color_hex || '#888' }} />
                    <div>
                      <h3 className="font-semibold text-slate-800 text-sm leading-tight">
                        {spool.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {[spool.brand, spool.material].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(spool)}
                      className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleting(spool)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Weight progress */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={`font-semibold ${empty ? 'text-red-500' : low ? 'text-amber-600' : 'text-slate-700'}`}>
                      {spool.current_weight_g.toFixed(0)}g remaining
                    </span>
                    <span className="text-slate-400">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: empty
                          ? '#ef4444'
                          : low
                            ? '#f59e0b'
                            : spool.color_hex || '#0ea5e9',
                      }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>0g</span>
                    <span>{spool.initial_weight_g}g initial</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-1 text-center text-xs">
                  <div className="bg-slate-50 rounded-lg p-1.5">
                    <p className="font-bold text-slate-700">{totalUsed.toFixed(0)}g</p>
                    <p className="text-slate-400">used</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-1.5">
                    <p className="font-bold text-slate-700">{spoolLogs.length}</p>
                    <p className="text-slate-400">prints</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-1.5">
                    <p className="font-bold text-slate-700">
                      {pkgStr ? `${pkgStr}` : '—'}
                    </p>
                    <p className="text-slate-400">TND/kg</p>
                  </div>
                </div>

                {/* Status badge */}
                {(low || empty) && (
                  <div className={`mt-3 text-center text-xs font-bold py-1.5 rounded-lg
                    ${empty ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    {empty ? '⛔ Empty spool' : '⚠️ Low filament — restock soon'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ ADD/EDIT MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl
            max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">

            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl">
              <h2 className="text-lg font-bold text-slate-800">
                {editing ? 'Edit Spool' : 'New Spool'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">

              {/* Color preview */}
              <div className="flex items-center gap-4 bg-slate-50 rounded-2xl p-4">
                <div className="w-16 h-16 rounded-2xl border-4 border-white shadow-lg flex-shrink-0"
                  style={{ backgroundColor: form.color_hex || '#888' }} />
                <div className="flex-1">
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Filament Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color_hex || '#ffffff'}
                      onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white" />
                    <input value={form.color_name}
                      onChange={e => setForm(f => ({ ...f, color_name: e.target.value }))}
                      placeholder="Color name (e.g. Fire Red)"
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                  Spool name *
                </label>
                <input value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Bambu PLA Basic - Red"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              {/* Brand + Material */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Brand</label>
                  <input value={form.brand || ''}
                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="Bambu Lab..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Material *</label>
                  <select value={form.material}
                    onChange={e => setForm(f => ({ ...f, material: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                    {MATERIALS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Weights */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Initial weight (g)
                  </label>
                  <input type="number" value={form.initial_weight_g}
                    onChange={e => setForm(f => ({ ...f, initial_weight_g: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Current weight (g)
                  </label>
                  <input type="number" value={form.current_weight_g}
                    onChange={e => setForm(f => ({ ...f, current_weight_g: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
              </div>

              {/* Price + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Purchase price (TND)
                  </label>
                  <input type="number" value={form.purchase_price_tnd}
                    onChange={e => setForm(f => ({ ...f, purchase_price_tnd: e.target.value }))}
                    placeholder="e.g. 120"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                  {form.purchase_price_tnd && form.initial_weight_g && (
                    <p className="text-xs text-emerald-600 mt-1">
                      = {(parseFloat(form.purchase_price_tnd) / (parseFloat(form.initial_weight_g) / 1000)).toFixed(2)} TND/kg
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Purchase date
                  </label>
                  <input type="date" value={form.purchase_date || ''}
                    onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Notes</label>
                <input value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. bought from X store, batch number..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button onClick={closeModal}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Spool'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-800 text-lg mb-1">Remove spool?</h3>
            <p className="text-slate-500 text-sm mb-5">
              "<strong>{deleting.name}</strong>" and its usage history will be deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                Keep
              </button>
              <button onClick={deleteSpool}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
