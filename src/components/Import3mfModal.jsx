import { useState, useRef, useEffect } from 'react'
import { parse3mf, calcFilamentCosts } from '../lib/parse3mf'
import { useSettings } from '../lib/SettingsContext'
import { supabase } from '../lib/supabase'
import { colorDistance } from '../pages/Filaments'
import { Upload, X, CheckCircle, AlertCircle, Link } from 'lucide-react'

export default function Import3mfModal({ onImport, onClose }) {
  const { settings }              = useSettings()
  const inputRef                  = useRef()
  const [result, setResult]       = useState(null)
  const [selectedPlate, setPlate] = useState(0)
  const [parsing, setParsing]     = useState(false)
  const [error, setError]         = useState('')
  const [dragging, setDragging]   = useState(false)
  const [spools, setSpools]       = useState([])
  // Map: filament_index → spool_id
  const [spoolMap, setSpoolMap]   = useState({})

  useEffect(() => {
    supabase.from('filament_spools')
      .select('*')
      .eq('is_active', true)
      .gt('current_weight_g', 0)
      .order('created_at', { ascending: false })
      .then(({ data }) => setSpools(data || []))
  }, [])

  // Auto-suggest spools when result is loaded
  useEffect(() => {
    if (!result) return
    const plate = result.plates[selectedPlate]
    const map   = {}
    plate.filaments.forEach((f, i) => {
      if (f.is_support || !f.color_hex) return
      // Find closest spool by color + same material
      const sameMat = spools.filter(s =>
        s.material.toUpperCase() === (f.material || '').toUpperCase()
      )
      const pool    = sameMat.length > 0 ? sameMat : spools
      let best      = null
      let bestDist  = 999
      pool.forEach(s => {
        if (!s.color_hex) return
        const d = colorDistance(f.color_hex, s.color_hex)
        if (d < bestDist) { bestDist = d; best = s }
      })
      if (best && bestDist < 120) map[i] = best.id
    })
    setSpoolMap(map)
  }, [result, selectedPlate, spools])

  async function handleFile(file) {
    if (!file?.name.endsWith('.3mf')) { setError('Select a .3mf file.'); return }
    setParsing(true); setError(''); setResult(null)
    try {
      const parsed = await parse3mf(file)
      parsed.plates = parsed.plates.map(pl => ({
        ...pl,
        filaments: calcFilamentCosts(pl.filaments, settings.filament_price_per_kg),
      }))
      setResult(parsed)
      setPlate(0)
    } catch (err) { setError(err.message) }
    finally { setParsing(false) }
  }

  // Cost for one filament using spool price if assigned, else global rate
  function filamentCost(f, idx) {
    const spoolId = spoolMap[idx]
    if (spoolId) {
      const spool = spools.find(s => s.id === spoolId)
      if (spool?.purchase_price_tnd && spool?.initial_weight_g) {
        const pkgRate = spool.purchase_price_tnd / (spool.initial_weight_g / 1000)
        return parseFloat(((f.grams / 1000) * pkgRate).toFixed(3))
      }
    }
    return f.cost_tnd ?? 0
  }

  const plate       = result?.plates?.[selectedPlate]
  const allCosts    = plate
    ? plate.filaments.map((f, i) => filamentCost(f, i))
    : []
  const filamentTotal = allCosts.reduce((s, v) => s + v, 0)

  function handleConfirm() {
    if (!result || !plate) return
    const filamentData = plate.filaments.map((f, i) => ({
      ...f,
      spool_id: spoolMap[i] || null,
      cost_tnd: filamentCost(f, i),
    }))
    onImport({
      filament_grams:   plate.model_grams,
      support_grams:    plate.support_grams,
      print_time_hours: plate.print_time_hours,
      filament_data:    filamentData,
      _filament_cost:   filamentTotal,
      _plate:           plate,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl
        max-h-[90vh] sm:max-h-[92vh] flex flex-col mb-16 sm:mb-0">

        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Import from .3mf</h2>
            <p className="text-xs text-slate-400 mt-0.5">Bambu Studio · OrcaSlicer</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Drop zone */}
          {!result && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
                ${dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-sky-300 hover:bg-sky-50'}`}>
              {parsing ? (
                <div>
                  <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600">Parsing file...</p>
                </div>
              ) : (
                <div>
                  <Upload size={32} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-semibold text-slate-600">Drop .3mf file here</p>
                  <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 inline-block">
                    <p className="text-xs text-amber-700 font-medium">
                      💡 Bambu Studio → File → Export → Export 3MF
                    </p>
                  </div>
                </div>
              )}
              <input ref={inputRef} type="file" accept=".3mf"
                onChange={e => handleFile(e.target.files?.[0])} className="hidden" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Parse failed</p>
                <p className="text-xs text-red-500 mt-0.5 whitespace-pre-line">{error}</p>
                <button onClick={() => { setError(''); setResult(null) }}
                  className="mt-2 text-xs text-red-600 underline">Try another file</button>
              </div>
            </div>
          )}

          {/* Results */}
          {result && plate && (
            <div className="space-y-4">

              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-700">Parsed successfully</p>
                <span className="ml-auto text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">
                  {result.source === 'bambu' ? 'Bambu format' : 'G-code header'}
                </span>
              </div>

              {/* Plate selector */}
              {result.plates.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {result.plates.map((p, i) => (
                    <button key={i} onClick={() => { setPlate(i); setSpoolMap({}) }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                        ${selectedPlate === i ? 'bg-sky-500 text-white border-sky-500' : 'border-slate-200 text-slate-600 hover:border-sky-300'}`}>
                      Plate {p.plate_index} · {p.print_time_formatted}
                    </button>
                  ))}
                </div>
              )}

              {/* Summary row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-slate-800">{plate.print_time_formatted}</p>
                  <p className="text-xs text-slate-400">Print time</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-slate-800">{plate.model_grams}g</p>
                  <p className="text-xs text-slate-400">Model</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-slate-800">{plate.support_grams}g</p>
                  <p className="text-xs text-slate-400">Support</p>
                </div>
              </div>

              {/* Filament + spool assignment */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Filament per color — assign spool for exact cost
                </p>
                <div className="space-y-2">
                  {plate.filaments.map((f, i) => {
                    const cost       = filamentCost(f, i)
                    const assignedSp = spools.find(s => s.id === spoolMap[i])

                    return (
                      <div key={i} className="bg-slate-50 rounded-xl p-3">
                        <div className="flex items-center gap-3 mb-2">
                          {/* Color swatch */}
                          <div className="w-7 h-7 rounded-lg border-2 border-white shadow-sm flex-shrink-0"
                            style={{ backgroundColor: f.is_support ? '#e2e8f0' : (f.color_hex || '#888') }}>
                            {f.is_support && (
                              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-bold">S</div>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-700">
                              {f.is_support ? 'Support material' : `Slot ${f.slot} — ${f.material}`}
                              {f.color_hex && !f.is_support && (
                                <span className="text-slate-400 font-normal ml-1">{f.color_hex}</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">
                              {f.grams.toFixed(2)}g · {f.meters?.toFixed(2)}m
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-bold text-slate-700">{cost.toFixed(3)} TND</p>
                            {assignedSp && (
                              <p className="text-xs text-emerald-500">
                                {(assignedSp.purchase_price_tnd / (assignedSp.initial_weight_g / 1000)).toFixed(0)} TND/kg
                              </p>
                            )}
                            {!assignedSp && (
                              <p className="text-xs text-slate-400">
                                {settings.filament_price_per_kg} TND/kg
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Spool selector */}
                        {!f.is_support && (
                          <div className="flex items-center gap-2">
                            <Link size={12} className="text-slate-400 flex-shrink-0" />
                            <select
                              value={spoolMap[i] || ''}
                              onChange={e => setSpoolMap(prev => ({ ...prev, [i]: e.target.value || undefined }))}
                              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-300">
                              <option value="">— Use global rate ({settings.filament_price_per_kg} TND/kg)</option>
                              {spools
                                .sort((a, b) => colorDistance(f.color_hex, a.color_hex) - colorDistance(f.color_hex, b.color_hex))
                                .map(s => {
                                  const dist = colorDistance(f.color_hex, s.color_hex || '')
                                  const match = dist < 50 ? '✅ ' : dist < 120 ? '🟡 ' : ''
                                  return (
                                    <option key={s.id} value={s.id}>
                                      {match}{s.name} ({s.current_weight_g.toFixed(0)}g left)
                                    </option>
                                  )
                                })}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Total cost box */}
              <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-sky-800">Filament cost</p>
                  <p className="text-xs text-sky-500 mt-0.5">
                    Electricity + wear added in form from print time
                  </p>
                </div>
                <p className="text-xl font-bold text-sky-700">{filamentTotal.toFixed(3)} TND</p>
              </div>

              <button onClick={() => { setResult(null); setError('') }}
                className="w-full text-xs text-slate-400 hover:text-slate-600 py-1 transition-colors">
                ← Parse a different file
              </button>
            </div>
          )}
        </div>

        <div className="p-5 border-t flex-shrink-0 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={!result || !plate}
            className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-xl text-sm font-bold">
            ✅ Import & Apply
          </button>
        </div>
      </div>
    </div>
  )
}
