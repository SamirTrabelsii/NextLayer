import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, Receipt, TrendingDown, Search } from 'lucide-react'

const CATEGORIES = [
    { key: 'filament', label: 'Filament', emoji: '🧵', color: 'bg-blue-100 text-blue-700' },
    { key: 'electricity', label: 'Electricity', emoji: '⚡', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'tools', label: 'Tools', emoji: '🔧', color: 'bg-purple-100 text-purple-700' },
    { key: 'shipping', label: 'Shipping', emoji: '📦', color: 'bg-orange-100 text-orange-700' },
    { key: 'other', label: 'Other', emoji: '💼', color: 'bg-slate-100 text-slate-600' },
]

const empty = { category: 'filament', amount: '', description: '', date: new Date().toISOString().split('T')[0] }

export default function Expenses() {
    const [expenses, setExpenses] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [form, setForm] = useState(empty)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(null)
    const [filterCat, setFilterCat] = useState('all')
    const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))

    useEffect(() => { fetchExpenses() }, [])

    async function fetchExpenses() {
        setLoading(true)
        const { data } = await supabase
            .from('expenses')
            .select('*')
            .order('date', { ascending: false })
        setExpenses(data || [])
        setLoading(false)
    }

    async function saveExpense() {
        if (!form.amount || !form.description.trim()) return
        setSaving(true)
        await supabase.from('expenses').insert([{
            ...form,
            amount: parseFloat(form.amount),
        }])
        setSaving(false)
        setShowModal(false)
        setForm(empty)
        fetchExpenses()
    }

    async function deleteExpense(id) {
        await supabase.from('expenses').delete().eq('id', id)
        setDeleting(null)
        fetchExpenses()
    }

    // Filter
    const filtered = expenses.filter(e => {
        const matchCat = filterCat === 'all' || e.category === filterCat
        const matchMonth = !filterMonth || e.date?.startsWith(filterMonth)
        return matchCat && matchMonth
    })

    // Stats
    const totalFiltered = filtered.reduce((s, e) => s + (e.amount || 0), 0)

    const byCategory = CATEGORIES.map(c => ({
        ...c,
        total: filtered.filter(e => e.category === c.key).reduce((s, e) => s + (e.amount || 0), 0)
    })).filter(c => c.total > 0)

    const catInfo = (key) => CATEGORIES.find(c => c.key === key) || CATEGORIES[4]

    const formatDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

    // Group by date
    const grouped = filtered.reduce((acc, e) => {
        const key = e.date?.slice(0, 10) || 'Unknown'
        if (!acc[key]) acc[key] = []
        acc[key].push(e)
        return acc
    }, {})

    return (
        <div className="max-w-3xl mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
                    <p className="text-sm text-slate-500">{filtered.length} entries</p>
                </div>
                <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
                    <Plus size={18} /> Add Expense
                </button>
            </div>

            {/* Month picker + total */}
            <div className="flex items-center gap-3 mb-4">
                <input type="month" value={filterMonth}
                    onChange={e => setFilterMonth(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300" />
                <button onClick={() => setFilterMonth('')}
                    className={`text-xs px-3 py-2 rounded-xl border transition-colors
            ${!filterMonth ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                    All time
                </button>
                <div className="ml-auto text-right">
                    <p className="text-xs text-slate-400">Total</p>
                    <p className="text-xl font-bold text-red-500">{totalFiltered.toFixed(2)} TND</p>
                </div>
            </div>

            {/* Category breakdown */}
            {byCategory.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                    {byCategory.map(c => (
                        <button key={c.key}
                            onClick={() => setFilterCat(filterCat === c.key ? 'all' : c.key)}
                            className={`bg-white rounded-xl border p-3 text-left transition-all
                ${filterCat === c.key ? 'ring-2 ring-sky-400 border-sky-200' : 'border-slate-100 hover:bg-slate-50'}`}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-lg">{c.emoji}</span>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.color}`}>{c.label}</span>
                            </div>
                            <p className="font-bold text-slate-800">{c.total.toFixed(2)} TND</p>
                            <div className="mt-1.5 bg-slate-100 rounded-full h-1">
                                <div className="h-1 rounded-full bg-sky-400"
                                    style={{ width: `${Math.min((c.total / totalFiltered) * 100, 100)}%` }} />
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Category filter pills */}
            <div className="flex gap-2 flex-wrap mb-4">
                <button onClick={() => setFilterCat('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
            ${filterCat === 'all' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    All
                </button>
                {CATEGORIES.map(c => (
                    <button key={c.key} onClick={() => setFilterCat(filterCat === c.key ? 'all' : c.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
              ${filterCat === c.key ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {c.emoji} {c.label}
                    </button>
                ))}
            </div>

            {/* Expenses grouped by date */}
            {loading ? (
                <div className="text-center py-20 text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <Receipt size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-400 font-medium">No expenses found</p>
                    <p className="text-slate-400 text-sm">Log your first expense to get started</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(grouped).map(([date, items]) => (
                        <div key={date}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    {new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}
                                </p>
                                <p className="text-xs font-semibold text-slate-500">
                                    {items.reduce((s, e) => s + e.amount, 0).toFixed(2)} TND
                                </p>
                            </div>
                            <div className="flex flex-col gap-2">
                                {items.map(e => {
                                    const cat = catInfo(e.category)
                                    return (
                                        <div key={e.id}
                                            className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
                                            <span className="text-xl">{cat.emoji}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-800 truncate">{e.description}</p>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <p className="font-bold text-red-500">{e.amount.toFixed(2)} TND</p>
                                                <button onClick={() => setDeleting(e)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl">
                            <h2 className="text-lg font-bold text-slate-800">Log Expense</h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Category selector */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-2">Category</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {CATEGORIES.map(c => (
                                        <button key={c.key}
                                            onClick={() => setForm(f => ({ ...f, category: c.key }))}
                                            className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition-all
                        ${form.category === c.key
                                                    ? 'border-sky-400 bg-sky-50 text-sky-700 ring-2 ring-sky-300'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                                            <span className="text-xl">{c.emoji}</span>
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Amount (TND) *</label>
                                <input type="number" value={form.amount}
                                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                    placeholder="0.00"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 text-lg font-semibold" />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Description *</label>
                                <input value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="e.g. 1kg PLA Black filament"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            {/* Date */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Date</label>
                                <input type="date" value={form.date}
                                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>
                        </div>

                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={() => setShowModal(false)}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={saveExpense}
                                disabled={saving || !form.amount || !form.description.trim()}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                                {saving ? 'Saving...' : 'Log Expense'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleting && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete expense?</h3>
                        <p className="text-slate-500 text-sm mb-5">
                            "<span className="font-medium">{deleting.description}</span>" — {deleting.amount} TND
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleting(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={() => deleteExpense(deleting.id)}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}