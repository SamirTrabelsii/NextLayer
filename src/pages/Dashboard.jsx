import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, Users, TrendingUp, TrendingDown, Package, Clock, AlertCircle } from 'lucide-react'

export default function Dashboard() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [recent, setRecent] = useState([])
    const navigate = useNavigate()

    useEffect(() => { fetchStats() }, [])

    async function fetchStats() {
        setLoading(true)
        const now = new Date()
        const month = now.toISOString().slice(0, 7)

        const [
            { data: orders },
            { data: expenses },
            { data: clients },
            { data: products },
        ] = await Promise.all([
            supabase.from('orders').select('id, status, total_price, is_paid, created_at, deadline, clients(name)'),
            supabase.from('expenses').select('amount, date').filter('date', 'gte', `${month}-01`),
            supabase.from('clients').select('id'),
            supabase.from('products').select('id').eq('is_active', true),
        ])

        const allOrders = orders || []
        const allExpenses = expenses || []

        // Revenue = sum of paid orders this month
        const monthRevenue = allOrders
            .filter(o => o.is_paid && o.created_at?.startsWith(month))
            .reduce((s, o) => s + (o.total_price || 0), 0)

        // Expenses this month
        const monthExpenses = allExpenses.reduce((s, e) => s + (e.amount || 0), 0)

        // Active orders (not paid/delivered)
        const activeOrders = allOrders.filter(o => !['paid', 'delivered'].includes(o.status))

        // Overdue
        const overdue = activeOrders.filter(o =>
            o.deadline && new Date(o.deadline) < new Date()
        )

        // Pending revenue (confirmed/printing/done but not paid)
        const pendingRevenue = activeOrders.reduce((s, o) => s + (o.total_price || 0), 0)

        setStats({
            monthRevenue,
            monthExpenses,
            profit: monthRevenue - monthExpenses,
            activeOrders: activeOrders.length,
            overdueCount: overdue.length,
            totalClients: clients?.length || 0,
            activeProducts: products?.length || 0,
            pendingRevenue,
        })

        // Recent orders
        const sorted = [...allOrders]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5)
        setRecent(sorted)
        setLoading(false)
    }

    const STATUS_COLORS = {
        quote: 'bg-slate-100 text-slate-600',
        confirmed: 'bg-blue-100 text-blue-700',
        printing: 'bg-yellow-100 text-yellow-700',
        done: 'bg-purple-100 text-purple-700',
        delivered: 'bg-orange-100 text-orange-700',
        paid: 'bg-emerald-100 text-emerald-700',
    }

    const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-400">Loading dashboard...</div>
    )

    return (
        <div className="max-w-5xl mx-auto space-y-6">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                <p className="text-sm text-slate-500">{month} overview</p>
            </div>

            {/* Overdue alert */}
            {stats.overdueCount > 0 && (
                <div onClick={() => navigate('/orders')}
                    className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 cursor-pointer hover:bg-red-100 transition-colors">
                    <AlertCircle size={20} className="text-red-500 flex-shrink-0" />
                    <p className="text-sm font-medium text-red-700">
                        {stats.overdueCount} overdue order{stats.overdueCount > 1 ? 's' : ''} — tap to review
                    </p>
                </div>
            )}

            {/* Main stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                    label="Revenue" sub={month}
                    value={`${stats.monthRevenue.toFixed(2)} TND`}
                    icon={<TrendingUp size={20} />}
                    color="text-emerald-600" bg="bg-emerald-50"
                />
                <StatCard
                    label="Expenses" sub={month}
                    value={`${stats.monthExpenses.toFixed(2)} TND`}
                    icon={<TrendingDown size={20} />}
                    color="text-red-500" bg="bg-red-50"
                />
                <StatCard
                    label="Net Profit" sub={month}
                    value={`${stats.profit.toFixed(2)} TND`}
                    icon={<TrendingUp size={20} />}
                    color={stats.profit >= 0 ? 'text-sky-600' : 'text-red-500'}
                    bg={stats.profit >= 0 ? 'bg-sky-50' : 'bg-red-50'}
                />
                <StatCard
                    label="Pending Revenue" sub="unpaid orders"
                    value={`${stats.pendingRevenue.toFixed(2)} TND`}
                    icon={<Clock size={20} />}
                    color="text-amber-600" bg="bg-amber-50"
                />
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-3 gap-3">
                <div onClick={() => navigate('/orders')}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow text-center">
                    <ShoppingCart size={22} className="mx-auto text-sky-500 mb-1" />
                    <p className="text-2xl font-bold text-slate-800">{stats.activeOrders}</p>
                    <p className="text-xs text-slate-500">Active Orders</p>
                </div>
                <div onClick={() => navigate('/clients')}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow text-center">
                    <Users size={22} className="mx-auto text-purple-500 mb-1" />
                    <p className="text-2xl font-bold text-slate-800">{stats.totalClients}</p>
                    <p className="text-xs text-slate-500">Clients</p>
                </div>
                <div onClick={() => navigate('/products')}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow text-center">
                    <Package size={22} className="mx-auto text-emerald-500 mb-1" />
                    <p className="text-2xl font-bold text-slate-800">{stats.activeProducts}</p>
                    <p className="text-xs text-slate-500">Products</p>
                </div>
            </div>

            {/* Recent orders */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-800">Recent Orders</h2>
                    <button onClick={() => navigate('/orders')}
                        className="text-xs text-sky-500 hover:text-sky-700 font-medium">View all →</button>
                </div>
                {recent.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No orders yet</p>
                ) : (
                    <div className="space-y-3">
                        {recent.map(o => (
                            <div key={o.id} onClick={() => navigate('/orders')}
                                className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors">
                                <div>
                                    <p className="text-sm font-medium text-slate-800">{o.clients?.name || 'Unknown'}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status]}`}>
                                        {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                                    </span>
                                </div>
                                <p className="font-semibold text-slate-700">
                                    {o.total_price ? `${o.total_price} TND` : '—'}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: '+ New Order', path: '/orders', color: 'bg-sky-500 text-white' },
                    { label: '+ New Client', path: '/clients', color: 'bg-purple-500 text-white' },
                    { label: '+ Log Expense', path: '/expenses', color: 'bg-red-400 text-white' },
                    { label: '+ New Idea', path: '/ideas', color: 'bg-amber-400 text-white' },
                ].map(a => (
                    <button key={a.path} onClick={() => navigate(a.path)}
                        className={`py-3 rounded-2xl font-medium text-sm ${a.color} hover:opacity-90 transition-opacity shadow-sm`}>
                        {a.label}
                    </button>
                ))}
            </div>
        </div>
    )
}

function StatCard({ label, sub, value, icon, color, bg }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                </div>
                <div className={`p-2 rounded-xl ${bg} ${color}`}>{icon}</div>
            </div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
    )
}