import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../lib/SettingsContext'
import { Save, RotateCcw } from 'lucide-react'

export default function Settings() {
    const { settings, refreshSettings } = useSettings()

    const [form, setForm] = useState({ filament_price_per_kg: '', electricity_per_hour: '' })
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')

    // Sync form when settings load from DB
    useEffect(() => {
        setForm({
            filament_price_per_kg: settings.filament_price_per_kg,
            electricity_per_hour: settings.electricity_per_hour,
        })
    }, [settings])

    async function saveSettings() {
        const filament = parseFloat(form.filament_price_per_kg)
        const elec = parseFloat(form.electricity_per_hour)

        if (isNaN(filament) || filament <= 0) {
            setError('Filament price must be a positive number.')
            return
        }
        if (isNaN(elec) || elec <= 0) {
            setError('Electricity rate must be a positive number.')
            return
        }

        setSaving(true)
        setSaved(false)
        setError('')

        try {
            await supabase.from('settings').upsert([
                { key: 'filament_price_per_kg', value: String(filament), updated_at: new Date().toISOString() },
                { key: 'electricity_per_hour', value: String(elec), updated_at: new Date().toISOString() },
            ])
            await refreshSettings()
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (err) {
            console.error(err)
            setError('Failed to save. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    function reset() {
        setForm({
            filament_price_per_kg: settings.filament_price_per_kg,
            electricity_per_hour: settings.electricity_per_hour,
        })
        setError('')
    }

    // Live preview
    const previewCost = (() => {
        const f = (100 / 1000) * (parseFloat(form.filament_price_per_kg) || 0)
        const e = 3 * (parseFloat(form.electricity_per_hour) || 0)
        return (f + e).toFixed(3)
    })()

    return (
        <div className="max-w-2xl mx-auto">

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
                <p className="text-sm text-slate-500">Platform configuration</p>
            </div>

            {/* Cost calculation */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-5">
                <h2 className="text-base font-bold text-slate-800 mb-1">
                    🖨️ Cost Calculation
                </h2>
                <p className="text-sm text-slate-500 mb-5">
                    Used everywhere production costs are calculated — orders, productions, and product catalogue.
                </p>

                <div className="space-y-5">

                    {/* Filament price */}
                    <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                            🧵 Filament price per kilogram
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={form.filament_price_per_kg}
                                onChange={e => setForm(f => ({ ...f, filament_price_per_kg: e.target.value }))}
                                className="w-36 border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-2.5 text-base font-bold focus:outline-none transition-colors" />
                            <span className="text-sm font-medium text-slate-500">TND / kg</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5">
                            Formula: (grams ÷ 1000) × this rate
                        </p>
                    </div>

                    {/* Electricity rate */}
                    <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                            ⚡ Electricity cost per print hour
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.electricity_per_hour}
                                onChange={e => setForm(f => ({ ...f, electricity_per_hour: e.target.value }))}
                                className="w-36 border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-2.5 text-base font-bold focus:outline-none transition-colors" />
                            <span className="text-sm font-medium text-slate-500">TND / hour</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5">
                            Formula: hours × this rate
                        </p>
                    </div>

                    {/* Live preview */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Live preview
                        </p>
                        <p className="text-sm text-slate-600">
                            Printing <strong>100g</strong> of filament for <strong>3 hours</strong>
                        </p>
                        <p className="text-sm text-slate-500 mt-0.5">
                            = ({100} ÷ 1000 × {form.filament_price_per_kg || '?'}) + (3 × {form.electricity_per_hour || '?'})
                            <span className="font-bold text-sky-600 ml-2 text-base">
                                = {previewCost} TND
                            </span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-600 font-medium">
                    ⚠️ {error}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    onClick={reset}
                    className="flex items-center gap-2 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <RotateCcw size={15} /> Reset
                </button>
                <button
                    onClick={saveSettings}
                    disabled={saving}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-50
            ${saved ? 'bg-emerald-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white'}`}>
                    <Save size={15} />
                    {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Settings'}
                </button>
            </div>
        </div>
    )
}