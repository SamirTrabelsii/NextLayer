import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import {
    TrendingUp, TrendingDown, ShoppingCart, Users,
    Package, Printer, AlertCircle, ArrowRight, Clock
} from 'lucide-react'

export default function Dashboard() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    const now = new Date()
    const thisMonth = now.toISOString().slice(0, 7)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        const [
            { data: orders },
            { data: expenses },
            { data: clients },
            { data: products },
            { data: productions },
            { data: stock },
            { data: consignments },
        ] = await Promise.all([
            supabase.from('orders').select('id, status, total_price, is_paid, created_at, deadline, type, clients(name)'),
            supabase.from('expenses').select('amount, date, category'),
            supabase.from('clients').select('id, is_reseller'),
            supabase.from('products').select('id, is_active'),
            supabase.from('productions').select('id, status, filament_grams, actual_cost'),
            supabase.from('stock').select('*, products(name)'),
            supabase.from('reseller_consignments').select('quantity_given, quantity_sold, quantity_returned, unit_price, is_settled'),
        ])

        const allOrders = orders || []
        const allExpenses = expenses || []
        const allClients = clients || []
        const allProducts = products || []
        const allProductions = productions || []
        const allStock = stock || []
        const allConsign = consignments || []

        // Revenue
        const revenueThisMonth = allOrders
            .filter(o => o.is_paid && o.created_at?.startsWith(thisMonth))
            .reduce((s, o) => s + (o.total_price || 0), 0)

        const revenueLastMonth = allOrders
            .filter(o => o.is_paid && o.created_at?.startsWith(lastMonth))
            .reduce((s, o) => s + (o.total_price || 0), 0)

        // Expenses
        const expThisMonth = allExpenses
            .filter(e => e.date?.startsWith(thisMonth))
            .reduce((s, e) => s + (e.amount || 0), 0)

        const expLastMonth = allExpenses
            .filter(e => e.date?.startsWith(lastMonth))
            .reduce((s, e) => s + (e.amount || 0), 0)

        // Profit
        const profitThis = revenueThisMonth - expThisMonth
        const profitLast = revenueLastMonth - expLastMonth

        // Orders
        const activeStatuses = ['new', 'designing', 'quoted', 'confirmed', 'printing', 'ready', 'delivered']
        const activeOrders = allOrders.filter(o => activeStatuses.includes(o.status))
        const overdueOrders = activeOrders.filter(o =>
            o.deadline && new Date(o.deadline) < new Date()
        )
        const pendingRevenue = activeOrders.reduce((s, o) => s + (o.total_price || 0), 0)

        // Productions
        const printQueue = allProductions.filter(p => p.status === 'queued').length
        const printing = allProductions.filter(p => p.status === 'printing').length

        // Stock
        const lowStock = allStock.filter(s => s.quantity_available > 0 && s.quantity_available <= 2)
        const outStock = allStock.filter(s => s.quantity_available === 0 && (s.quantity_with_reseller || 0) === 0)

        // Reseller
        const activeConsign = allConsign.filter(c => !c.is_settled)
        const resellerOwes = activeConsign.reduce((s, c) =>
            s + ((c.quantity_sold || 0) * (c.unit_price || 0)), 0)

        // Expense breakdown this month
        const expByCategory = allExpenses
            .filter(e => e.date?.startsWith(thisMonth))
            .reduce((acc, e) => {
                acc[e.category] = (acc[e.category] || 0) + (e.amount || 0)
                return acc
            }, {})

        // Filament used this month
        const filamentThisMonth = allProductions
            .filter(p => p.status === 'done')
            .reduce((s, p) => s + (p.filament_grams || 0), 0)

        // Recent 5 orders
        const recent = [...allOrders]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5)

        setData({
            revenueThisMonth, revenueLastMonth,
            expThisMonth, expLastMonth,
            profitThis, profitLast,
            activeOrders: activeOrders.length,
            overdueOrders,
            pendingRevenue,
            printQueue, printing,
            lowStock, outStock,
            resellerOwes,
            expByCategory,
            filamentThisMonth,
            totalClients: allClients.length,
            totalProducts: allProducts.filter(p => p.is_active).length,
            recent,
        })

        setLoading(false)
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="text-center">
                <Printer size={32} className="mx-auto text-sky-400 mb-3 animate-pulse" />
                <p className="text-slate-400 text-sm">Loading dashboard...</p>
            </div>
        </div>
    )

    const d = data
    const month = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    const revChange = d.revenueLastMonth > 0
        ? (((d.revenueThisMonth - d.revenueLastMonth) / d.revenueLastMonth) * 100).toFixed(0)
        : null

    const STATUS_COLORS = {
        new: 'bg-slate-100 text-slate-600', designing: 'bg-blue-100 text-blue-700',
        quoted: 'bg-purple-100 text-purple-700', confirmed: 'bg-sky-100 text-sky-700',
        printing: 'bg-yellow-100 text-yellow-700', ready: 'bg-orange-100 text-orange-700',
        delivered: 'bg-indigo-100 text-indigo-700', paid: 'bg-emerald-100 text-emerald-700',
        cancelled: 'bg-red-100 text-red-600',
    }

    const EXP_EMOJI = { filament: '🧵', electricity: '⚡', tools: '🔧', shipping: '📦', other: '💼' }

    return (
        <div className="max-w-5xl mx-auto space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                    <p className="text-sm text-slate-500">{month}</p>
                </div>
                <button onClick={fetchAll}
                    className="text-xs text-slate-400 hover:text-sky-500 px-3 py-2 rounded-xl hover:bg-sky-50 transition-colors">
                    ↻ Refresh
                </button>
            </div>

            {/* ALERTS */}
            {(d.overdueOrders.length > 0 || d.outStock.length > 0 || d.printQueue > 0) && (
                <div className="space-y-2">
                    {d.overdueOrders.length > 0 && (
                        <div onClick={() => navigate('/orders')}
                            className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 cursor-pointer hover:bg-red-100 transition-colors">
                            <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-bold text-red-700">
                                    {d.overdueOrders.length} Overdue Order{d.overdueOrders.length > 1 ? 's' : ''}
                                </p>
                                <p className="text-xs text-red-500">
                                    {d.overdueOrders.map(o => o.clients?.name).join(', ')}
                                </p>
                            </div>
                            <ArrowRight size={16} className="text-red-400" />
                        </div>
                    )}
                    {d.printQueue > 0 && (
                        <div onClick={() => navigate('/productions')}
                            className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 cursor-pointer hover:bg-amber-100 transition-colors">
                            <Printer size={18} className="text-amber-600 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-bold text-amber-700">
                                    {d.printQueue} job{d.printQueue > 1 ? 's' : ''} waiting to print
                                    {d.printing > 0 ? ` · ${d.printing} currently printing` : ''}
                                </p>
                            </div>
                            <ArrowRight size={16} className="text-amber-400" />
                        </div>
                    )}
                    {d.lowStock.length > 0 && (
                        <div onClick={() => navigate('/stock')}
                            className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl p-4 cursor-pointer hover:bg-orange-100 transition-colors">
                            <Package size={18} className="text-orange-500 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-bold text-orange-700">Low stock on {d.lowStock.length} product{d.lowStock.length > 1 ? 's' : ''}</p>
                                <p className="text-xs text-orange-500">
                                    {d.lowStock.map(s => `${s.products?.name} (${s.quantity_available})`).join(', ')}
                                </p>
                            </div>
                            <ArrowRight size={16} className="text-orange-400" />
                        </div>
                    )}
                </div>
            )}

            {/* REVENUE / EXPENSES / PROFIT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-xs font-medium text-slate-500">Revenue</p>
                            <p className="text-xs text-slate-400">{month}</p>
                        </div>
                        <div className="p-2 bg-emerald-50 rounded-xl">
                            <TrendingUp size={18} className="text-emerald-600" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 mb-1">
                        {d.revenueThisMonth.toFixed(2)} TND
                    </p>
                    {revChange !== null && (
                        <p className={`text-xs font-medium ${Number(revChange) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {Number(revChange) >= 0 ? '↑' : '↓'} {Math.abs(revChange)}% vs last month
                        </p>
                    )}
                    {d.pendingRevenue > 0 && (
                        <p className="text-xs text-amber-500 mt-1">+ {d.pendingRevenue.toFixed(2)} TND pending</p>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-xs font-medium text-slate-500">Expenses</p>
                            <p className="text-xs text-slate-400">{month}</p>
                        </div>
                        <div className="p-2 bg-red-50 rounded-xl">
                            <TrendingDown size={18} className="text-red-500" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-red-500 mb-2">
                        {d.expThisMonth.toFixed(2)} TND
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {Object.entries(d.expByCategory).map(([cat, amt]) => (
                            <span key={cat} className="text-xs bg-slate-50 text-slate-500 px-2 py-0.5 rounded-lg">
                                {EXP_EMOJI[cat] || '💼'} {amt.toFixed(0)}
                            </span>
                        ))}
                    </div>
                </div>

                <div className={`rounded-2xl border shadow-sm p-5
          ${d.profitThis >= 0 ? 'bg-sky-50 border-sky-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-xs font-medium text-slate-500">Net Profit</p>
                            <p className="text-xs text-slate-400">{month}</p>
                        </div>
                        <div className={`p-2 rounded-xl ${d.profitThis >= 0 ? 'bg-sky-100' : 'bg-red-100'}`}>
                            {d.profitThis >= 0
                                ? <TrendingUp size={18} className="text-sky-600" />
                                : <TrendingDown size={18} className="text-red-500" />}
                        </div>
                    </div>
                    <p className={`text-2xl font-bold mb-1 ${d.profitThis >= 0 ? 'text-sky-700' : 'text-red-600'}`}>
                        {d.profitThis.toFixed(2)} TND
                    </p>
                    {d.profitLast !== 0 && (
                        <p className="text-xs text-slate-400">
                            Last month: {d.profitLast.toFixed(2)} TND
                        </p>
                    )}
                </div>
            </div>

            {/* OPERATIONS ROW */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div onClick={() => navigate('/orders')}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all text-center">
                    <ShoppingCart size={22} className="mx-auto text-sky-500 mb-2" />
                    <p className="text-2xl font-bold text-slate-800">{d.activeOrders}</p>
                    <p className="text-xs text-slate-400">Active Orders</p>
                </div>
                <div onClick={() => navigate('/productions')}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all text-center">
                    <Printer size={22} className="mx-auto text-yellow-500 mb-2" />
                    <p className="text-2xl font-bold text-slate-800">{d.printing}</p>
                    <p className="text-xs text-slate-400">Printing Now</p>
                    {d.printQueue > 0 && <p className="text-xs text-amber-500">{d.printQueue} queued</p>}
                </div>
                <div onClick={() => navigate('/clients')}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all text-center">
                    <Users size={22} className="mx-auto text-purple-500 mb-2" />
                    <p className="text-2xl font-bold text-slate-800">{d.totalClients}</p>
                    <p className="text-xs text-slate-400">Clients</p>
                </div>
                <div onClick={() => navigate('/stock')}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all text-center">
                    <Package size={22} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-2xl font-bold text-slate-800">{d.totalProducts}</p>
                    <p className="text-xs text-slate-400">Active Products</p>
                </div>
            </div>

            {/* RESELLER BALANCE */}
            {d.resellerOwes > 0 && (
                <div onClick={() => navigate('/reseller')}
                    className="bg-gradient-to-r from-purple-500 to-purple-700 rounded-2xl p-4 cursor-pointer hover:opacity-95 transition-opacity flex items-center justify-between text-white">
                    <div>
                        <p className="text-sm font-bold">🤝 Reseller owes you</p>
                        <p className="text-xs text-purple-200">Tap to view details and settle</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold">{d.resellerOwes.toFixed(2)} TND</p>
                        <ArrowRight size={16} className="ml-auto text-purple-300" />
                    </div>
                </div>
            )}

            {/* FILAMENT TRACKER */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-slate-800">🧵 Filament Used</h2>
                    <button onClick={() => navigate('/productions')}
                        className="text-xs text-sky-500 hover:text-sky-700 font-medium">View productions →</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-slate-700">{d.filamentThisMonth.toFixed(0)}g</p>
                        <p className="text-xs text-slate-400">Total used (all time)</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-slate-700">
                            {(d.filamentThisMonth / 1000).toFixed(2)}kg
                        </p>
                        <p className="text-xs text-slate-400">In kilograms</p>
                    </div>
                    <div className="bg-sky-50 rounded-xl p-3 text-center sm:col-span-1 col-span-2">
                        <p className="text-xl font-bold text-sky-600">
                            {(d.filamentThisMonth / 1000 * 35).toFixed(2)} TND
                        </p>
                        <p className="text-xs text-slate-400">Est. filament cost</p>
                    </div>
                </div>
            </div>

            {/* RECENT ORDERS */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-800">Recent Orders</h2>
                    <button onClick={() => navigate('/orders')}
                        className="text-xs text-sky-500 hover:text-sky-700 font-medium">View all →</button>
                </div>
                {d.recent.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No orders yet</p>
                ) : (
                    <div className="space-y-2">
                        {d.recent.map(o => (
                            <div key={o.id} onClick={() => navigate('/orders')}
                                className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-sm font-medium text-slate-800">{o.clients?.name || '—'}</p>
                                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                      ${o.type === 'custom' ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-600'}`}>
                                            {o.type}
                                        </span>
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] || ''}`}>
                                        {o.status}
                                    </span>
                                </div>
                                <p className="font-semibold text-slate-700 text-sm ml-3">
                                    {o.total_price ? `${o.total_price} TND` : <span className="text-slate-300">TBD</span>}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* QUICK ACTIONS */}
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: '+ New Order', path: '/orders', color: 'bg-sky-500', hover: 'hover:bg-sky-600' },
                        { label: '+ New Client', path: '/clients', color: 'bg-purple-500', hover: 'hover:bg-purple-600' },
                        { label: '+ Log Expense', path: '/expenses', color: 'bg-red-400', hover: 'hover:bg-red-500' },
                        { label: '+ Print Job', path: '/productions', color: 'bg-amber-500', hover: 'hover:bg-amber-600' },
                    ].map(a => (
                        <button key={a.path} onClick={() => navigate(a.path)}
                            className={`py-3.5 rounded-2xl font-semibold text-sm text-white ${a.color} ${a.hover} transition-colors shadow-sm`}>
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}