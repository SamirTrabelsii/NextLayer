import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../lib/SettingsContext'
import { Save, RotateCcw, Trash2 } from 'lucide-react'

export default function Settings() {
    const { settings, refreshSettings } = useSettings()

    const [form, setForm] = useState({ filament_price_per_kg: '', electricity_per_hour: '' })
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    
    // Safety States for platform reset
    const [showResetModal, setShowResetModal] = useState(false)
    const [confirmPhrase, setConfirmPhrase] = useState('')
    const [resetting, setResetting] = useState(false)
    const [resetError, setResetError] = useState('')
    const [resetSuccess, setResetSuccess] = useState(false)

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

    async function handleResetPlatform() {
        if (confirmPhrase !== 'DELETE EVERYTHING') return
        setResetting(true)
        setResetError('')
        setResetSuccess(false)
        
        try {
            // 1. Delete dependent child records
            await supabase.from('product_materials').delete().not('product_id', 'is', null)
            await supabase.from('order_items').delete().not('id', 'is', null)
            await supabase.from('productions').delete().not('id', 'is', null)
            await supabase.from('stock_movements').delete().not('id', 'is', null)
            await supabase.from('material_movements').delete().not('id', 'is', null)

            // 2. Delete reseller components
            await supabase.from('reseller_sales').delete().not('id', 'is', null)
            await supabase.from('reseller_consignments').delete().not('id', 'is', null)

            // 3. Delete parent records
            await supabase.from('orders').delete().not('id', 'is', null)
            await supabase.from('products').delete().not('id', 'is', null)
            await supabase.from('clients').delete().not('id', 'is', null)

            // 4. Delete auxiliary records
            await supabase.from('stock').delete().not('id', 'is', null)
            await supabase.from('materials').delete().not('id', 'is', null)
            await supabase.from('expenses').delete().not('id', 'is', null)
            await supabase.from('ideas').delete().not('id', 'is', null)

            setResetSuccess(true)
            setShowResetModal(false)
            setConfirmPhrase('')
            setTimeout(() => setResetSuccess(false), 5000)
        } catch (err) {
            console.error('Reset Platform Error:', err)
            setResetError('Failed to fully reset database. Some constraints might have blocked it.')
        } finally {
            setResetting(false)
        }
    }

    // Live preview
    const previewCost = (() => {
        const f = (100 / 1000) * (parseFloat(form.filament_price_per_kg) || 0)
        const e = 3 * (parseFloat(form.electricity_per_hour) || 0)
        return (f + e).toFixed(3)
    })()

    return (
        <div className="max-w-2xl mx-auto">

            {/* Success notification */}
            {resetSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 mb-5 text-sm font-semibold flex items-center gap-2">
                    ✨ Platform has been successfully reset! All database records cleared.
                </div>
            )}

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
            <div className="flex gap-3 mb-8">
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

            {/* Danger Zone */}
            <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-8">
                <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/30 rounded-2xl p-6">
                    <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                        <div>
                            <h3 className="text-base font-bold text-red-700 dark:text-red-400 mb-1">
                                🚨 Danger Zone: Platform Factory Reset
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
                                Erase all operational data: clients, resellers, orders, reseller consignments, production logs, stock levels, raw materials database, expenses, and ideas. This action is irreversible. Your cost configuration parameters above will be kept.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowResetModal(true)}
                            className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-sm transition-all flex-shrink-0 flex items-center gap-1.5"
                        >
                            <Trash2 size={13} /> Reset Platform Data
                        </button>
                    </div>
                </div>
            </div>

            {/* Factory Reset Modal */}
            {showResetModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-3">
                            <span className="text-2xl">⚠️</span>
                            <h3 className="font-bold text-lg leading-none">Critical: Factory Reset Platform?</h3>
                        </div>
                        
                        <p className="text-slate-600 dark:text-slate-300 text-xs mb-4 leading-relaxed">
                            This action will permanently purge **everything** from your database:
                        </p>
                        
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 dark:bg-slate-950/50 rounded-xl p-3 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-4">
                            <div>❌ Clients & Resellers</div>
                            <div>❌ Orders & Consignments</div>
                            <div>❌ Products Catalogue</div>
                            <div>❌ Production Logs</div>
                            <div>❌ Raw Materials & BOMs</div>
                            <div>❌ Stocks & Movements</div>
                            <div>❌ Logged Expenses</div>
                            <div>❌ Ideation Board</div>
                        </div>

                        <p className="text-red-600 dark:text-red-400 text-xs font-semibold mb-4 leading-relaxed">
                            WARNING: This action is permanent and cannot be undone. 
                        </p>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                                    To confirm, type <span className="text-slate-800 dark:text-slate-100 font-extrabold select-all">DELETE EVERYTHING</span> below:
                                </label>
                                <input
                                    type="text"
                                    value={confirmPhrase}
                                    onChange={e => setConfirmPhrase(e.target.value)}
                                    placeholder="Type verification phrase..."
                                    className="w-full border border-slate-200 dark:border-slate-800 focus:border-red-400 dark:focus:border-red-500 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors font-bold text-center"
                                />
                            </div>

                            {resetError && (
                                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-3 text-xs text-red-600 dark:text-red-400 font-medium">
                                    ⚠️ {resetError}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setShowResetModal(false); setConfirmPhrase(''); setResetError('') }}
                                    disabled={resetting}
                                    className="flex-1 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleResetPlatform}
                                    disabled={confirmPhrase !== 'DELETE EVERYTHING' || resetting}
                                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5"
                                >
                                    {resetting ? 'Resetting...' : 'Yes, Delete Everything'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}