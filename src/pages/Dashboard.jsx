import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/ThemeContext'
import { TrendingUp, TrendingDown, ShoppingCart, Users, Package, Printer, AlertCircle, ArrowRight, DollarSign } from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// Colors and Constants
const C = {
    emerald: '#10b981',
    teal: '#14b8a6',
    red: '#ef4444',
    sky: '#0ea5e9',
    indigo: '#6366f1',
    amber: '#f59e0b',
    slate: '#64748b',
}

const fmtShort = (v) => {
    if (v === undefined || v === null) return '0'
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
    return v.toFixed(0)
}

// Sub-components
function KpiCard({ label, value, sub, change, icon, accent }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3 relative z-10">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <div className="p-2 rounded-xl transition-colors" style={{ backgroundColor: `${accent}15`, color: accent }}>
                    {icon}
                </div>
            </div>
            <p className="text-2xl font-bold text-slate-800 mb-1 relative z-10">{value}</p>
            <div className="flex items-center gap-2 relative z-10">
                {change !== undefined && change !== null && (
                    <span className={`text-xs font-bold flex items-center ${Number(change) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {Number(change) >= 0 ? '↑' : '↓'} {Math.abs(change)}%
                    </span>
                )}
                <p className="text-xs text-slate-400 truncate">{sub}</p>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity" style={{ color: accent }}>
                {icon && typeof icon === 'object' && Object.assign({}, icon, { props: { ...icon.props, size: 80 } })}
            </div>
        </div>
    )
}

const ChartTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/90 backdrop-blur-sm border border-slate-100 p-3 rounded-xl shadow-xl">
                <p className="text-xs font-bold text-slate-500 mb-2">{label}</p>
                {payload.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 mb-1">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="text-xs text-slate-600">{p.name}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-800">{p.value.toFixed(2)} TND</span>
                    </div>
                ))}
            </div>
        )
    }
    return null
}

export default function Dashboard() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()
    const { isDark } = useTheme()

    const now = new Date()
    // Use local-timezone month keys (toISOString() is UTC and shifts months for UTC+ timezones)
    const toMonthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const thisMonth = toMonthKey(now)
    const lastMonth = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))

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
            { data: materials },
            { data: orderItems },
            { data: settledConsignments },
            { data: resellerSales },
        ] = await Promise.all([
            supabase.from('orders').select('id,status,total_price,is_paid,created_at,paid_at,deadline,type,clients(name)'),
            supabase.from('expenses').select('amount,date,category'),
            supabase.from('clients').select('id'),
            supabase.from('products').select('id,is_active'),
            supabase.from('productions').select('id,status'),
            supabase.from('stock').select('*,products(name)'),
            supabase.from('materials').select('id,name,quantity_available,low_stock_threshold'),
            supabase.from('order_items').select('*'),
            supabase.from('reseller_consignments').select('id, settled_at').eq('is_settled', true),
            supabase.from('reseller_sales').select('consignment_id, total, sale_date'),
        ])

        const allOrders = orders || []
        const allExp = expenses || []
        const allProds = productions || []
        const allStock = stock || []
        const allMats = materials || []

        // ── Reseller Revenue Logic (Step 3b Fix) ──────────────────────
        const allResellerSales = resellerSales || []

        const resellerRevByMonth = {}
        allResellerSales.forEach(s => {
            if (!s.sale_date) return
            const month = s.sale_date.slice(0, 7)
            resellerRevByMonth[month] = (resellerRevByMonth[month] || 0) + (parseFloat(s.total) || 0)
        })

        const { data: activeConsignments } = await supabase
            .from('reseller_consignments')
            .select('id')
            .eq('is_settled', false)

        function consignmentTotal(cid) {
            return allResellerSales
                .filter(s => s.consignment_id === cid)
                .reduce((s, sl) => s + (parseFloat(sl.total) || 0), 0)
        }

        const pendingResellerRev = (activeConsignments || [])
            .reduce((sum, c) => sum + consignmentTotal(c.id), 0)

        // Use paid_at for revenue — exact moment money was received
        const paidThisMonth = allOrders.filter(o =>
            o.is_paid && (o.paid_at || o.created_at)?.startsWith(thisMonth))
        const paidLastMonth = allOrders.filter(o =>
            o.is_paid && (o.paid_at || o.created_at)?.startsWith(lastMonth))

        const directRevThis = paidThisMonth.reduce((s, o) => s + (o.total_price || 0), 0)
        const directRevLast = paidLastMonth.reduce((s, o) => s + (o.total_price || 0), 0)
        const resellerRevThis = resellerRevByMonth[thisMonth] || 0
        const resellerRevLast = resellerRevByMonth[lastMonth] || 0

        const revThis = directRevThis + resellerRevThis
        const revLast = directRevLast + resellerRevLast
        const revChange = revLast > 0 ? (((revThis - revLast) / revLast) * 100).toFixed(0) : null

        const expThis = allExp.filter(e => e.date?.startsWith(thisMonth)).reduce((s, e) => s + (e.amount || 0), 0)
        const expLast = allExp.filter(e => e.date?.startsWith(lastMonth)).reduce((s, e) => s + (e.amount || 0), 0)

        // ── Chart Data (Step 3d Fix) ──────────────────────────────────
        const months = []
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            months.push({
                key: toMonthKey(d),   // local-timezone safe (no UTC shift)
                label: d.toLocaleDateString('en-GB', { month: 'short' })
            })
        }

        // Monthly financials also use paid_at
        const monthlyFinancials = months.map(m => {
            const directRev = allOrders
                .filter(o => o.is_paid && (o.paid_at || o.created_at)?.startsWith(m.key))
                .reduce((s, o) => s + (o.total_price || 0), 0)
            const resellerRev = resellerRevByMonth[m.key] || 0
            const totalRev = directRev + resellerRev
            const exp = allExp.filter(e => e.date?.startsWith(m.key)).reduce((s, e) => s + (e.amount || 0), 0)
            return {
                month: m.label,
                'Direct Sales': parseFloat(directRev.toFixed(2)),
                'Reseller': parseFloat(resellerRev.toFixed(2)),
                Revenue: parseFloat(totalRev.toFixed(2)),
                Expenses: parseFloat(exp.toFixed(2)),
                Profit: parseFloat((totalRev - exp).toFixed(2)),
            }
        })

        // ── Other Stats ──────────────────────────────────────────────
        const activeStatuses = ['new', 'designing', 'quoted', 'confirmed', 'in_production', 'ready', 'delivered', 'waiting_restock']
        const activeOrders = allOrders.filter(o => activeStatuses.includes(o.status))
        const overdueOrders = activeOrders.filter(o => o.deadline && new Date(o.deadline) < new Date())
        const pendingRevenue = activeOrders.reduce((s, o) => s + (o.total_price || 0), 0)

        const printQueue = allProds.filter(p => p.status === 'queued').length
        const printing = allProds.filter(p => p.status === 'printing').length

        const lowStock = allStock.filter(s => s.quantity_available > 0 && s.quantity_available <= 2)
        const lowMaterials = allMats.filter(m => m.quantity_available <= (m.low_stock_threshold || 5))

        const expByCat = allExp.filter(e => e.date?.startsWith(thisMonth))
            .reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc }, {})

        const recent = [...allOrders]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5)

        setData({
            revThis, revLast, revChange, expThis, expLast,
            profitThis: revThis - expThis,
            profitLast: revLast - expLast,
            activeOrders: activeOrders.length, overdueOrders,
            pendingRevenue: pendingRevenue + pendingResellerRev,
            resellerRevThis,
            printQueue, printing,
            lowStock, lowMaterials,
            expByCat,
            totalClients: clients?.length || 0,
            totalProducts: products?.filter(p => p.is_active).length || 0,
            recent,
            monthlyFinancials,
        })
        setLoading(false)
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <p className="text-slate-400 text-sm">Loading dashboard...</p>
        </div>
    )

    const d = data
    const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const STATUS_COLORS = {
        new: 'bg-slate-100 text-slate-600', designing: 'bg-blue-100 text-blue-700',
        quoted: 'bg-purple-100 text-purple-700', confirmed: 'bg-sky-100 text-sky-700',
        in_production: 'bg-yellow-100 text-yellow-700', ready: 'bg-orange-100 text-orange-700',
        delivered: 'bg-indigo-100 text-indigo-700', paid: 'bg-emerald-100 text-emerald-700',
        cancelled: 'bg-red-100 text-red-600', waiting_restock: 'bg-pink-100 text-pink-700',
    }

    const EXP_EMOJI = {
        filament: '🧵',
        electricity: '⚡',
        material: '🔩',
        shipping: '📦',
        other: '💼',
    }

    return (
        <div className="max-w-5xl mx-auto space-y-5 pb-10">

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                    <p className="text-sm text-slate-500">{monthName}</p>
                </div>
                <button onClick={fetchAll}
                    className="text-xs text-slate-400 hover:text-sky-500 px-3 py-2 rounded-xl hover:bg-sky-50 transition-colors">
                    ↻ Refresh
                </button>
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: '+ New Order', path: '/orders', color: 'bg-sky-500 hover:bg-sky-600' },
                        { label: '+ New Client', path: '/clients', color: 'bg-purple-500 hover:bg-purple-600' },
                        { label: '+ Log Expense', path: '/expenses', color: 'bg-red-400 hover:bg-red-500' },
                        { label: '+ Print Job', path: '/productions', color: 'bg-amber-500 hover:bg-amber-600' },
                    ].map(a => (
                        <button key={a.path} onClick={() => navigate(a.path)}
                            className={`py-3.5 rounded-2xl font-semibold text-sm text-white ${a.color} transition-colors shadow-sm`}>
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── ALERTS ── */}
            {(d.overdueOrders.length > 0 || d.printQueue > 0 || d.lowStock.length > 0 || d.lowMaterials.length > 0) && (
                <div className="space-y-2">
                    {d.overdueOrders.length > 0 && (
                        <div onClick={() => navigate('/orders')}
                            className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 cursor-pointer hover:bg-red-100 transition-colors">
                            <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-bold text-red-700">
                                    {d.overdueOrders.length} Overdue Order{d.overdueOrders.length > 1 ? 's' : ''}
                                </p>
                                <p className="text-xs text-red-500">{d.overdueOrders.map(o => o.clients?.name).join(', ')}</p>
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
                                    {d.printing > 0 ? ` · ${d.printing} printing now` : ''}
                                </p>
                            </div>
                            <ArrowRight size={16} className="text-amber-400" />
                        </div>
                    )}
                </div>
            )}

            {/* ── KPI GRID (Step 3g) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard
                    label="Revenue"
                    value={`${fmtShort(d.revThis)} TND`}
                    sub={d.resellerRevThis > 0
                        ? `incl. ${fmtShort(d.resellerRevThis)} TND reseller`
                        : 'vs last month'}
                    change={d.revChange}
                    icon={<TrendingUp size={16} />}
                    accent={C.emerald} />

                <KpiCard
                    label="Expenses"
                    value={`${fmtShort(d.expThis)} TND`}
                    sub={Object.entries(d.expByCat).map(([c, v]) => `${EXP_EMOJI[c] || ''}${v.toFixed(0)}`).join(' ')}
                    icon={<TrendingDown size={16} />}
                    accent={C.red} />

                <KpiCard
                    label="Net Profit"
                    value={`${fmtShort(d.profitThis)} TND`}
                    sub={`Margin: ${d.revThis > 0 ? (d.profitThis / d.revThis * 100).toFixed(0) : 0}%`}
                    icon={<DollarSign size={16} />}
                    accent={C.sky} />
            </div>

            {/* ── REVENUE VS EXPENSES CHART (Step 3f) ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="font-bold text-slate-800">Financial Overview</h2>
                        <p className="text-xs text-slate-400">Monthly revenue split and expenses</p>
                    </div>
                    {d.pendingRevenue > 0 && (
                        <div className="bg-amber-50 px-3 py-1 rounded-lg">
                            <p className="text-[10px] font-bold text-amber-600 uppercase">Pending</p>
                            <p className="text-xs font-bold text-amber-700">{d.pendingRevenue.toFixed(0)} TND</p>
                        </div>
                    )}
                </div>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={d.monthlyFinancials} barGap={4}
                            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#f1f5f9'} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: isDark ? '#64748b' : '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: isDark ? '#64748b' : '#94a3b8' }} axisLine={false} tickLine={false}
                                tickFormatter={v => `${fmtShort(v)}`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc' }} />
                            <Legend iconType="circle" iconSize={8}
                                wrapperStyle={{ fontSize: 11, color: isDark ? '#64748b' : '#94a3b8', paddingTop: 12 }} />
                            <Bar dataKey="Direct Sales" stackId="rev" fill={C.emerald} radius={[0, 0, 0, 0]} maxBarSize={32} />
                            <Bar dataKey="Reseller" stackId="rev" fill={C.teal} radius={[6, 6, 0, 0]} maxBarSize={32} />
                            <Bar dataKey="Expenses" fill={C.red} radius={[6, 6, 0, 0]} maxBarSize={32} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── OPERATIONS & RECENT ORDERS ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-1 space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Operations</p>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'Orders', value: d.activeOrders, icon: <ShoppingCart size={20} className="text-sky-500" />, path: '/orders' },
                            { label: 'Printing', value: d.printing, icon: <Printer size={20} className="text-yellow-500" />, path: '/productions' },
                            { label: 'Clients', value: d.totalClients, icon: <Users size={20} className="text-purple-500" />, path: '/clients' },
                            { label: 'Products', value: d.totalProducts, icon: <Package size={20} className="text-emerald-500" />, path: '/products' },
                        ].map(c => (
                            <div key={c.label} onClick={() => navigate(c.path)}
                                className="bg-white rounded-2xl border border-slate-100 p-4 cursor-pointer hover:shadow-md transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-slate-50 rounded-lg">{c.icon}</div>
                                    <div>
                                        <p className="text-xl font-bold text-slate-800 leading-none">{c.value}</p>
                                        <p className="text-[10px] font-medium text-slate-400 uppercase mt-1">{c.label}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {d.lowMaterials.length > 0 && (
                        <div onClick={() => navigate('/materials')}
                            className="bg-orange-50 border border-orange-200 rounded-2xl p-4 cursor-pointer hover:bg-orange-100 transition-colors flex items-center gap-3">
                            <Package size={18} className="text-orange-500" />
                            <div className="flex-1">
                                <p className="text-xs font-bold text-orange-700">Low on {d.lowMaterials.length} materials</p>
                            </div>
                            <ArrowRight size={14} className="text-orange-400" />
                        </div>
                    )}
                </div>

                <div className="md:col-span-2">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 h-full">
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
                                        className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="text-sm font-medium text-slate-800 truncate">{o.clients?.name || '—'}</p>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase
                          ${o.type === 'custom' ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-600'}`}>
                                                    {o.type}
                                                </span>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${STATUS_COLORS[o.status] || ''}`}>
                                                {o.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <p className="font-bold text-slate-700 text-sm ml-3 whitespace-nowrap">
                                            {o.total_price ? `${o.total_price.toFixed(2)} TND` : 'TBD'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    )
}
