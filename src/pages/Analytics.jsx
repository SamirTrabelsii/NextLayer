import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/ThemeContext'
import {
    ArrowLeft, TrendingUp, DollarSign, ShoppingCart, Users, Package,
    Printer, Receipt, Handshake, BarChart3, PieChart as PieChartIcon,
    Activity, Target, Repeat, Zap, Layers
} from 'lucide-react'
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ─── PALETTE ──────────────────────────────────────────────────
const P = {
    emerald: '#10b981', emeraldDark: '#059669',
    teal: '#14b8a6',
    sky: '#0ea5e9', skyDark: '#0284c7',
    indigo: '#6366f1', indigoDark: '#4f46e5',
    purple: '#8b5cf6',
    rose: '#f43f5e', roseDark: '#e11d48',
    amber: '#f59e0b',
    slate: '#64748b',
    orange: '#f97316',
    cyan: '#06b6d4',
    pink: '#ec4899',
    lime: '#84cc16',
}

const PIE_COLORS = [P.emerald, P.sky, P.indigo, P.amber, P.rose, P.teal, P.purple, P.orange, P.cyan, P.pink, P.lime, P.slate]
const STATUS_COLORS_MAP = {
    new: '#94a3b8', designing: '#3b82f6', quoted: '#8b5cf6', confirmed: '#0ea5e9',
    in_production: '#eab308', waiting_restock: '#ec4899', ready: '#f97316',
    delivered: '#6366f1', paid: '#10b981', cancelled: '#ef4444',
}

// ─── UTILS ────────────────────────────────────────────────────
const fmtK = v => {
    if (v == null) return '0'
    if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1) + 'M'
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k'
    return v.toFixed(v % 1 === 0 ? 0 : 2)
}
const fmtTND = v => `${fmtK(v)} TND`
const pct = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) : '0.0'
const toMonthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthLabel = key => {
    const [y, m] = key.split('-')
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────
function HeroKpi({ label, value, sub, icon, gradient }) {
    return (
        <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${gradient}`}>
            <div className="absolute -right-3 -top-3 opacity-10">
                {icon && typeof icon === 'object' && Object.assign({}, icon, { props: { ...icon.props, size: 80 } })}
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-white/70 mb-1">{label}</p>
            <p className="text-2xl sm:text-3xl font-extrabold leading-none mb-1">{value}</p>
            {sub && <p className="text-xs text-white/60">{sub}</p>}
        </div>
    )
}

function SectionHeader({ icon, title, subtitle }) {
    return (
        <div className="flex items-center gap-3 mb-5 mt-10 first:mt-0">
            <div className="w-1 h-10 rounded-full bg-gradient-to-b from-sky-400 to-indigo-500" />
            <div className="flex items-center gap-2 flex-1">
                <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                    {icon}
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-800">{title}</h2>
                    <p className="text-xs text-slate-400">{subtitle}</p>
                </div>
            </div>
        </div>
    )
}

function StatCard({ label, value, sub, accent = P.sky }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-xl font-bold text-slate-800">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: accent }} />
        </div>
    )
}

function ChartCard({ title, subtitle, children, className = '' }) {
    return (
        <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${className}`}>
            {title && (
                <div className="mb-4">
                    <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
                    {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
                </div>
            )}
            {children}
        </div>
    )
}

const GlassTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white/90 backdrop-blur-sm border border-slate-100 p-3 rounded-xl shadow-xl max-w-xs">
            <p className="text-xs font-bold text-slate-500 mb-2">{label}</p>
            {payload.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-4 mb-1">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-xs text-slate-600">{p.name}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800">
                        {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
                    </span>
                </div>
            ))}
        </div>
    )
}

function LoadingSkeleton() {
    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-10 animate-pulse">
            <div className="h-8 bg-slate-200 rounded-xl w-48" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-28 bg-slate-200 rounded-2xl" />
                ))}
            </div>
            {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-3">
                    <div className="h-6 bg-slate-200 rounded w-56" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="h-64 bg-slate-200 rounded-2xl" />
                        <div className="h-64 bg-slate-200 rounded-2xl" />
                    </div>
                </div>
            ))}
        </div>
    )
}

// Mini donut renderer
function MiniDonut({ data, colors = PIE_COLORS, size = 180 }) {
    return (
        <ResponsiveContainer width="100%" height={size}>
            <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={size * 0.28} outerRadius={size * 0.42}
                    paddingAngle={3} dataKey="value" stroke="none">
                    {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip content={<GlassTooltip />} />
            </PieChart>
        </ResponsiveContainer>
    )
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function Analytics() {
    const navigate = useNavigate()
    const { isDark } = useTheme()
    const [raw, setRaw] = useState(null)
    const [loading, setLoading] = useState(true)

    const gridStroke = isDark ? '#1e293b' : '#f1f5f9'
    const tickFill = isDark ? '#64748b' : '#94a3b8'

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
            { data: resellerSales },
            { data: resellerConsignments },
        ] = await Promise.all([
            supabase.from('orders').select('id,status,total_price,is_paid,created_at,paid_at,deadline,type,client_id,clients(id,name)'),
            supabase.from('expenses').select('id,amount,date,category'),
            supabase.from('clients').select('id,name,created_at'),
            supabase.from('products').select('id,name,category,selling_price,production_cost,is_active'),
            supabase.from('productions').select('id,status,filament_grams,print_time_hours,actual_cost,created_at,product_id'),
            supabase.from('stock').select('id,product_id,quantity_available'),
            supabase.from('materials').select('id,name,quantity_available,low_stock_threshold'),
            supabase.from('order_items').select('id,order_id,product_id,quantity,unit_price,products(id,name,category)'),
            supabase.from('reseller_sales').select('id,consignment_id,total,sale_date,quantity,reseller_id'),
            supabase.from('reseller_consignments').select('id,reseller_id,is_settled,quantity_given,quantity_sold,quantity_returned'),
        ])
        setRaw({
            orders: orders || [], expenses: expenses || [], clients: clients || [],
            products: products || [], productions: productions || [], stock: stock || [],
            materials: materials || [], orderItems: orderItems || [],
            resellerSales: resellerSales || [], resellerConsignments: resellerConsignments || [],
        })
        setLoading(false)
    }

    // ── COMPUTED ANALYTICS ────────────────────────────────────────
    const analytics = useMemo(() => {
        if (!raw) return null
        const { orders, expenses, clients, products, productions, orderItems, resellerSales, resellerConsignments } = raw

        // ── Helpers ──
        const paidOrders = orders.filter(o => o.is_paid)
        const allMonthKeys = new Set()

        // Gather all months from orders and expenses
        orders.forEach(o => {
            const d = o.paid_at || o.created_at
            if (d) allMonthKeys.add(d.slice(0, 7))
        })
        expenses.forEach(e => { if (e.date) allMonthKeys.add(e.date.slice(0, 7)) })
        resellerSales.forEach(s => { if (s.sale_date) allMonthKeys.add(s.sale_date.slice(0, 7)) })

        const sortedMonths = [...allMonthKeys].sort()

        // ══════════════════════════════════════════════════════════
        //  SECTION 1: Lifetime Overview
        // ══════════════════════════════════════════════════════════
        const directRevenue = paidOrders.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0)
        const resellerRevenue = resellerSales.reduce((s, r) => s + (parseFloat(r.total) || 0), 0)
        const totalRevenue = directRevenue + resellerRevenue
        const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
        const totalProfit = totalRevenue - totalExpenses
        const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
        const completedOrders = paidOrders.length
        const totalClients = clients.length

        // ══════════════════════════════════════════════════════════
        //  SECTION 2: Revenue & Profitability Trends
        // ══════════════════════════════════════════════════════════
        const resellerRevByMonth = {}
        resellerSales.forEach(s => {
            if (!s.sale_date) return
            const mk = s.sale_date.slice(0, 7)
            resellerRevByMonth[mk] = (resellerRevByMonth[mk] || 0) + (parseFloat(s.total) || 0)
        })

        let cumulativeRevenue = 0
        let cumulativeExpenses = 0
        let cumulativeProfit = 0
        const monthlyTrend = sortedMonths.map(mk => {
            const directRev = paidOrders
                .filter(o => (o.paid_at || o.created_at)?.startsWith(mk))
                .reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0)
            const resellerRev = resellerRevByMonth[mk] || 0
            const totalRev = directRev + resellerRev
            const exp = expenses.filter(e => e.date?.startsWith(mk)).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
            const profit = totalRev - exp
            
            cumulativeRevenue += totalRev
            cumulativeExpenses += exp
            cumulativeProfit += profit
            
            const margin = totalRev > 0 ? ((profit / totalRev) * 100) : 0
            return {
                month: monthLabel(mk),
                monthKey: mk,
                'Direct Sales': parseFloat(directRev.toFixed(2)),
                Reseller: parseFloat(resellerRev.toFixed(2)),
                Revenue: parseFloat(totalRev.toFixed(2)),
                Expenses: parseFloat(exp.toFixed(2)),
                Profit: parseFloat(profit.toFixed(2)),
                'Cum. Revenue': parseFloat(cumulativeRevenue.toFixed(2)),
                'Cum. Expenses': parseFloat(cumulativeExpenses.toFixed(2)),
                'Cum. Profit': parseFloat(cumulativeProfit.toFixed(2)),
                Cumulative: parseFloat(cumulativeRevenue.toFixed(2)),
                'Margin %': parseFloat(margin.toFixed(1)),
            }
        })

        // ══════════════════════════════════════════════════════════
        //  SECTION 3: Order Analytics
        // ══════════════════════════════════════════════════════════
        const statusCounts = {}
        orders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1 })
        const statusPieData = Object.entries(statusCounts).map(([name, value]) => ({ name: name.replace('_', ' '), value }))

        const customOrders = orders.filter(o => o.type === 'custom')
        const standardOrders = orders.filter(o => o.type === 'standard')
        const typePieData = [
            { name: 'Custom', value: customOrders.length },
            { name: 'Standard', value: standardOrders.length },
        ]

        // Monthly order volume
        const ordersByMonth = {}
        orders.forEach(o => {
            const mk = o.created_at?.slice(0, 7)
            if (mk) ordersByMonth[mk] = (ordersByMonth[mk] || 0) + 1
        })
        const orderVolumeData = sortedMonths.map(mk => ({
            month: monthLabel(mk), Orders: ordersByMonth[mk] || 0
        }))

        // AOV per month
        const aovData = sortedMonths.map(mk => {
            const monthPaid = paidOrders.filter(o => (o.paid_at || o.created_at)?.startsWith(mk))
            const rev = monthPaid.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0)
            return { month: monthLabel(mk), AOV: monthPaid.length > 0 ? parseFloat((rev / monthPaid.length).toFixed(2)) : 0 }
        })

        const overallAOV = completedOrders > 0 ? directRevenue / completedOrders : 0

        // Pending revenue (unpaid active orders)
        const activeStatuses = ['new', 'designing', 'quoted', 'confirmed', 'in_production', 'ready', 'delivered', 'waiting_restock']
        const pendingRevenue = orders
            .filter(o => activeStatuses.includes(o.status))
            .reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0)

        // Funnel
        const funnelStatuses = ['new', 'designing', 'quoted', 'confirmed', 'in_production', 'ready', 'delivered', 'paid']
        const funnelData = funnelStatuses.map(status => ({
            name: status.replace('_', ' '),
            // Count orders that reached at least this stage
            value: orders.filter(o => {
                const oIdx = funnelStatuses.indexOf(o.status)
                const sIdx = funnelStatuses.indexOf(status)
                return oIdx >= sIdx || o.status === 'cancelled'
            }).length
        }))

        const cancelledCount = orders.filter(o => o.status === 'cancelled').length

        // ══════════════════════════════════════════════════════════
        //  SECTION 4: Client Intelligence
        // ══════════════════════════════════════════════════════════
        const clientRevenue = {}
        const clientOrderCount = {}
        const clientFirstOrder = {}
        paidOrders.forEach(o => {
            if (!o.client_id) return
            const name = o.clients?.name || 'Unknown'
            clientRevenue[o.client_id] = (clientRevenue[o.client_id] || 0) + (parseFloat(o.total_price) || 0)
            clientOrderCount[o.client_id] = (clientOrderCount[o.client_id] || 0) + 1
            const d = o.created_at
            if (!clientFirstOrder[o.client_id] || d < clientFirstOrder[o.client_id]) {
                clientFirstOrder[o.client_id] = d
            }
        })
        // Also count from all orders, not just paid
        orders.forEach(o => {
            if (!o.client_id) return
            const d = o.created_at
            if (!clientFirstOrder[o.client_id] || d < clientFirstOrder[o.client_id]) {
                clientFirstOrder[o.client_id] = d
            }
        })

        const topClients = Object.entries(clientRevenue)
            .map(([id, rev]) => ({
                name: clients.find(c => c.id === id)?.name || 'Unknown',
                revenue: parseFloat(rev.toFixed(2)),
                orders: clientOrderCount[id] || 0,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)

        // Client acquisition over time
        const clientAcqByMonth = {}
        Object.entries(clientFirstOrder).forEach(([, d]) => {
            if (!d) return
            const mk = d.slice(0, 7)
            clientAcqByMonth[mk] = (clientAcqByMonth[mk] || 0) + 1
        })
        let cumClients = 0
        const clientAcqData = sortedMonths.map(mk => {
            cumClients += clientAcqByMonth[mk] || 0
            return { month: monthLabel(mk), 'New Clients': clientAcqByMonth[mk] || 0, 'Total Clients': cumClients }
        })

        // Repeat rate
        const allClientOrderCounts = {}
        orders.forEach(o => {
            if (o.client_id) allClientOrderCounts[o.client_id] = (allClientOrderCounts[o.client_id] || 0) + 1
        })
        const clientsWithOrders = Object.keys(allClientOrderCounts).length
        const repeatClients = Object.values(allClientOrderCounts).filter(c => c > 1).length
        const repeatRate = clientsWithOrders > 0 ? (repeatClients / clientsWithOrders) * 100 : 0

        // ══════════════════════════════════════════════════════════
        //  SECTION 5: Product & Production Performance
        // ══════════════════════════════════════════════════════════
        const productRevenue = {}
        const productQty = {}
        orderItems.forEach(item => {
            if (!item.product_id) return
            const name = item.products?.name || 'Unknown'
            const rev = (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1)
            productRevenue[name] = (productRevenue[name] || 0) + rev
            productQty[name] = (productQty[name] || 0) + (parseInt(item.quantity) || 1)
        })

        const topProductsByRev = Object.entries(productRevenue)
            .map(([name, revenue]) => ({ name, revenue: parseFloat(revenue.toFixed(2)) }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)

        const topProductsByQty = Object.entries(productQty)
            .map(([name, qty]) => ({ name, quantity: qty }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10)

        // Category revenue
        const catRevenue = {}
        orderItems.forEach(item => {
            const cat = item.products?.category || 'Other'
            const rev = (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1)
            catRevenue[cat] = (catRevenue[cat] || 0) + rev
        })
        const catPieData = Object.entries(catRevenue)
            .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
            .sort((a, b) => b.value - a.value)

        // Production stats
        const totalPrints = productions.length
        const donePrints = productions.filter(p => p.status === 'done').length
        const failedPrints = productions.filter(p => p.status === 'failed').length
        const successRate = totalPrints > 0 ? (donePrints / (donePrints + failedPrints)) * 100 : 0
        const totalFilament = productions.reduce((s, p) => s + (parseFloat(p.filament_grams) || 0), 0)
        const avgFilament = donePrints > 0 ? totalFilament / donePrints : 0
        const totalPrintHours = productions.reduce((s, p) => s + (parseFloat(p.print_time_hours) || 0), 0)
        const avgPrintHours = donePrints > 0 ? totalPrintHours / donePrints : 0

        // Filament usage by month
        const filamentByMonth = {}
        productions.forEach(p => {
            if (!p.created_at || !p.filament_grams) return
            const mk = p.created_at.slice(0, 7)
            filamentByMonth[mk] = (filamentByMonth[mk] || 0) + (parseFloat(p.filament_grams) || 0)
        })
        const filamentTrendData = sortedMonths.map(mk => ({
            month: monthLabel(mk), Filament: parseFloat((filamentByMonth[mk] || 0).toFixed(1))
        }))

        // ══════════════════════════════════════════════════════════
        //  SECTION 6: Expense Breakdown
        // ══════════════════════════════════════════════════════════
        const expByCat = {}
        expenses.forEach(e => {
            const cat = e.category || 'other'
            expByCat[cat] = (expByCat[cat] || 0) + (parseFloat(e.amount) || 0)
        })
        const expCatPie = Object.entries(expByCat)
            .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
            .sort((a, b) => b.value - a.value)

        const EXP_EMOJI = { 
            filament: '🧵', electricity: '⚡', material: '🔩', shipping: '📦', 
            investment: '🖨️', marketing: '📈', impression: '🏷️', other: '💼' 
        }

        // Monthly expense trend
        const expByMonth = {}
        const expByCatMonth = {}
        expenses.forEach(e => {
            if (!e.date) return
            const mk = e.date.slice(0, 7)
            expByMonth[mk] = (expByMonth[mk] || 0) + (parseFloat(e.amount) || 0)
            const cat = e.category || 'other'
            if (!expByCatMonth[mk]) expByCatMonth[mk] = {}
            expByCatMonth[mk][cat] = (expByCatMonth[mk][cat] || 0) + (parseFloat(e.amount) || 0)
        })
        const allExpCats = [...new Set(expenses.map(e => e.category || 'other'))]
        const expTrendData = sortedMonths.map(mk => {
            const row = { month: monthLabel(mk), Total: parseFloat((expByMonth[mk] || 0).toFixed(2)) }
            allExpCats.forEach(cat => {
                row[cat] = parseFloat(((expByCatMonth[mk]?.[cat]) || 0).toFixed(2))
            })
            return row
        })

        const costPerOrder = completedOrders > 0 ? totalExpenses / completedOrders : 0

        // ══════════════════════════════════════════════════════════
        //  SECTION 7: Reseller Channel
        // ══════════════════════════════════════════════════════════
        const resellerPct = totalRevenue > 0 ? (resellerRevenue / totalRevenue) * 100 : 0
        const unsettledConsignments = resellerConsignments.filter(c => !c.is_settled)
        const outstandingQty = unsettledConsignments.reduce((s, c) =>
            s + Math.max(0, (c.quantity_given || 0) - (c.quantity_sold || 0) - (c.quantity_returned || 0)), 0)

        const resellerTrendData = sortedMonths.map(mk => ({
            month: monthLabel(mk),
            'Reseller Revenue': parseFloat((resellerRevByMonth[mk] || 0).toFixed(2)),
        }))

        // Outstanding consignment value (sum of unsettled sales)
        const unsettledIds = new Set(unsettledConsignments.map(c => c.id))
        const outstandingValue = resellerSales
            .filter(s => unsettledIds.has(s.consignment_id))
            .reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0)

        return {
            // S1
            totalRevenue, totalExpenses, totalProfit, profitMargin, completedOrders, totalClients, directRevenue, resellerRevenue,
            // S2
            monthlyTrend,
            // S3
            statusPieData, typePieData, orderVolumeData, aovData, overallAOV, pendingRevenue, funnelData, cancelledCount,
            totalOrders: orders.length,
            // S4
            topClients, clientAcqData, repeatRate, repeatClients, clientsWithOrders,
            // S5
            topProductsByRev, topProductsByQty, catPieData,
            totalPrints, donePrints, failedPrints, successRate, avgFilament, avgPrintHours, totalFilament, totalPrintHours,
            filamentTrendData,
            // S6
            expCatPie, expTrendData, allExpCats, costPerOrder, EXP_EMOJI,
            // S7
            resellerPct, outstandingQty, outstandingValue, resellerTrendData,
        }
    }, [raw])

    // ─── RENDER ───────────────────────────────────────────────────
    if (loading || !analytics) return <LoadingSkeleton />

    const a = analytics

    return (
        <div className="max-w-6xl mx-auto pb-12">

            {/* ── HEADER ── */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/dashboard')}
                        className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Business Analytics</h1>
                        <p className="text-sm text-slate-400">Full in-depth insights since day one</p>
                    </div>
                </div>
                <button onClick={fetchAll}
                    className="text-xs text-slate-400 hover:text-sky-500 px-3 py-2 rounded-xl hover:bg-sky-50 transition-colors">
                    ↻ Refresh
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════
                SECTION 1 — Lifetime Overview
            ═══════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
                <HeroKpi label="Lifetime Revenue" value={fmtTND(a.totalRevenue)}
                    sub={`Direct: ${fmtTND(a.directRevenue)}`}
                    icon={<TrendingUp size={80} />}
                    gradient="bg-gradient-to-br from-emerald-500 to-emerald-700" />
                <HeroKpi label="Lifetime Expenses" value={fmtTND(a.totalExpenses)}
                    icon={<Receipt size={80} />}
                    gradient="bg-gradient-to-br from-rose-500 to-rose-700" />
                <HeroKpi label="Net Profit" value={fmtTND(a.totalProfit)}
                    sub={`${a.profitMargin.toFixed(1)}% margin`}
                    icon={<DollarSign size={80} />}
                    gradient={a.totalProfit >= 0
                        ? "bg-gradient-to-br from-sky-500 to-sky-700"
                        : "bg-gradient-to-br from-red-500 to-red-700"} />
                <HeroKpi label="Profit Margin" value={`${a.profitMargin.toFixed(1)}%`}
                    icon={<Target size={80} />}
                    gradient="bg-gradient-to-br from-indigo-500 to-indigo-700" />
                <HeroKpi label="Orders Completed" value={a.completedOrders.toLocaleString()}
                    sub={`of ${a.totalOrders} total`}
                    icon={<ShoppingCart size={80} />}
                    gradient="bg-gradient-to-br from-amber-500 to-amber-700" />
                <HeroKpi label="Total Clients" value={a.totalClients.toLocaleString()}
                    sub={`${a.repeatRate.toFixed(0)}% repeat`}
                    icon={<Users size={80} />}
                    gradient="bg-gradient-to-br from-purple-500 to-purple-700" />
            </div>

            {/* ═══════════════════════════════════════════════════════
                SECTION 2 — Revenue & Profitability Trends
            ═══════════════════════════════════════════════════════ */}
            <SectionHeader icon={<TrendingUp size={18} />} title="Revenue & Profitability"
                subtitle="Monthly trends since business creation" />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {/* Revenue vs Expenses vs Profit */}
                <ChartCard title="Revenue vs Expenses vs Profit" subtitle="Cumulative financial growth over time">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={a.monthlyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={P.emerald} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={P.emerald} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gExpenses" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={P.rose} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={P.rose} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={P.sky} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={P.sky} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                                <Tooltip content={<GlassTooltip />} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                <Area type="monotone" dataKey="Cum. Revenue" stroke={P.emerald} fill="url(#gRevenue)" strokeWidth={2} />
                                <Area type="monotone" dataKey="Cum. Expenses" stroke={P.rose} fill="url(#gExpenses)" strokeWidth={2} />
                                <Area type="monotone" dataKey="Cum. Profit" stroke={P.sky} fill="url(#gProfit)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Revenue Split: Direct vs Reseller */}
                <ChartCard title="Revenue Split" subtitle="Direct sales vs reseller channel">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={a.monthlyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                                <Tooltip content={<GlassTooltip />} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                <Bar dataKey="Direct Sales" stackId="rev" fill={P.emerald} radius={[0, 0, 0, 0]} maxBarSize={28} />
                                <Bar dataKey="Reseller" stackId="rev" fill={P.teal} radius={[4, 4, 0, 0]} maxBarSize={28} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Cumulative Revenue Growth */}
                <ChartCard title="Cumulative Revenue Growth" subtitle="Running total over time">
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={a.monthlyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gCum" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={P.indigo} stopOpacity={0.4} />
                                        <stop offset="95%" stopColor={P.indigo} stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                                <Tooltip content={<GlassTooltip />} />
                                <Area type="monotone" dataKey="Cumulative" stroke={P.indigo} fill="url(#gCum)" strokeWidth={2.5} dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Profit Margin Trend */}
                <ChartCard title="Profit Margin Trend" subtitle="Monthly margin percentage">
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={a.monthlyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false}
                                    tickFormatter={v => `${v}%`} domain={['auto', 'auto']} />
                                <Tooltip content={<GlassTooltip />} />
                                <Line type="monotone" dataKey="Margin %" stroke={P.amber} strokeWidth={2.5}
                                    dot={{ r: 3, fill: P.amber }} activeDot={{ r: 5 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {/* ═══════════════════════════════════════════════════════
                SECTION 3 — Order Analytics
            ═══════════════════════════════════════════════════════ */}
            <SectionHeader icon={<ShoppingCart size={18} />} title="Order Analytics"
                subtitle="Volume, distribution, and conversion insights" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total Orders" value={a.totalOrders} sub={`${a.completedOrders} paid`} accent={P.sky} />
                <StatCard label="Avg Order Value" value={fmtTND(a.overallAOV)} sub="across paid orders" accent={P.emerald} />
                <StatCard label="Pending Revenue" value={fmtTND(a.pendingRevenue)} sub="from active orders" accent={P.amber} />
                <StatCard label="Cancelled" value={a.cancelledCount} sub={`${pct(a.cancelledCount, a.totalOrders)}% of total`} accent={P.rose} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Status Distribution */}
                <ChartCard title="Order Status Distribution" subtitle="Current status breakdown">
                    <MiniDonut data={a.statusPieData}
                        colors={a.statusPieData.map(d => STATUS_COLORS_MAP[d.name.replace(' ', '_')] || P.slate)} />
                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                        {a.statusPieData.map((d, i) => (
                            <div key={d.name} className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: STATUS_COLORS_MAP[d.name.replace(' ', '_')] || P.slate }} />
                                <span className="text-[10px] text-slate-500">{d.name} ({d.value})</span>
                            </div>
                        ))}
                    </div>
                </ChartCard>

                {/* Type Split */}
                <ChartCard title="Custom vs Standard" subtitle="Order type distribution">
                    <MiniDonut data={a.typePieData} colors={[P.purple, P.teal]} />
                    <div className="flex justify-center gap-6 mt-2">
                        {a.typePieData.map((d, i) => (
                            <div key={d.name} className="text-center">
                                <p className="text-lg font-bold text-slate-800">{d.value}</p>
                                <p className="text-[10px] text-slate-400">{d.name}</p>
                            </div>
                        ))}
                    </div>
                </ChartCard>

                {/* Monthly Volume */}
                <ChartCard title="Monthly Order Volume" subtitle="Orders created per month">
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={a.orderVolumeData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip content={<GlassTooltip />} />
                                <Bar dataKey="Orders" fill={P.sky} radius={[4, 4, 0, 0]} maxBarSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {/* AOV Trend */}
            <ChartCard title="Average Order Value Trend" subtitle="AOV per month" className="mb-4">
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={a.aovData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                            <Tooltip content={<GlassTooltip />} />
                            <Line type="monotone" dataKey="AOV" stroke={P.emerald} strokeWidth={2.5}
                                dot={{ r: 3, fill: P.emerald }} activeDot={{ r: 5 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>

            {/* ═══════════════════════════════════════════════════════
                SECTION 4 — Client Intelligence
            ═══════════════════════════════════════════════════════ */}
            <SectionHeader icon={<Users size={18} />} title="Client Intelligence"
                subtitle="Top clients, acquisition, and retention" />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <StatCard label="Unique Clients" value={a.clientsWithOrders} sub="with at least 1 order" accent={P.purple} />
                <StatCard label="Repeat Rate" value={`${a.repeatRate.toFixed(1)}%`}
                    sub={`${a.repeatClients} repeat clients`} accent={P.indigo} />
                <StatCard label="Avg Revenue/Client" value={fmtTND(a.clientsWithOrders > 0 ? a.totalRevenue / a.clientsWithOrders : 0)}
                    sub="lifetime per client" accent={P.emerald} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Clients */}
                <ChartCard title="Top 10 Clients by Revenue" subtitle="Highest-spending clients lifetime">
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={a.topClients} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} width={90} />
                                <Tooltip content={<GlassTooltip />} />
                                <Bar dataKey="revenue" fill={P.purple} radius={[0, 6, 6, 0]} maxBarSize={20} name="Revenue (TND)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Client Acquisition */}
                <ChartCard title="Client Acquisition" subtitle="New clients and cumulative total over time">
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={a.clientAcqData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gClients" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={P.purple} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={P.purple} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip content={<GlassTooltip />} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                <Area type="monotone" dataKey="Total Clients" stroke={P.purple} fill="url(#gClients)" strokeWidth={2} />
                                <Bar dataKey="New Clients" fill={P.indigo} radius={[4, 4, 0, 0]} maxBarSize={16} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {/* ═══════════════════════════════════════════════════════
                SECTION 5 — Product & Production Performance
            ═══════════════════════════════════════════════════════ */}
            <SectionHeader icon={<Package size={18} />} title="Product & Production Performance"
                subtitle="Best sellers, categories, and print stats" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total Prints" value={a.totalPrints} sub={`${a.donePrints} completed`} accent={P.sky} />
                <StatCard label="Success Rate" value={`${a.successRate.toFixed(1)}%`}
                    sub={`${a.failedPrints} failed`} accent={a.successRate >= 90 ? P.emerald : P.amber} />
                <StatCard label="Avg Filament/Job" value={`${a.avgFilament.toFixed(0)}g`}
                    sub={`${(a.totalFilament / 1000).toFixed(1)}kg total`} accent={P.teal} />
                <StatCard label="Avg Print Time" value={`${a.avgPrintHours.toFixed(1)}h`}
                    sub={`${a.totalPrintHours.toFixed(0)}h total`} accent={P.indigo} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Top Products by Revenue */}
                <ChartCard title="Top Products by Revenue" subtitle="Best sellers by total revenue" className="md:col-span-1">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={a.topProductsByRev} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip content={<GlassTooltip />} />
                                <Bar dataKey="revenue" fill={P.emerald} radius={[0, 4, 4, 0]} maxBarSize={18} name="Revenue (TND)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Top Products by Quantity */}
                <ChartCard title="Top Products by Qty Sold" subtitle="Most sold items by volume" className="md:col-span-1">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={a.topProductsByQty} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip content={<GlassTooltip />} />
                                <Bar dataKey="quantity" fill={P.sky} radius={[0, 4, 4, 0]} maxBarSize={18} name="Quantity" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Category Revenue Pie */}
                <ChartCard title="Revenue by Category" subtitle="Product category contribution">
                    <MiniDonut data={a.catPieData} />
                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                        {a.catPieData.map((d, i) => (
                            <div key={d.name} className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                <span className="text-[10px] text-slate-500">{d.name}</span>
                            </div>
                        ))}
                    </div>
                </ChartCard>
            </div>

            {/* Filament Usage Trend */}
            <ChartCard title="Filament Usage Trend" subtitle="Monthly grams consumed in production" className="mb-4">
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={a.filamentTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gFilament" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={P.teal} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={P.teal} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false}
                                tickFormatter={v => `${v}g`} />
                            <Tooltip content={<GlassTooltip />} />
                            <Area type="monotone" dataKey="Filament" stroke={P.teal} fill="url(#gFilament)" strokeWidth={2} name="Filament (g)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>

            {/* ═══════════════════════════════════════════════════════
                SECTION 6 — Expense Breakdown
            ═══════════════════════════════════════════════════════ */}
            <SectionHeader icon={<Receipt size={18} />} title="Expense Breakdown"
                subtitle="Where your money goes" />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <StatCard label="Total Expenses" value={fmtTND(a.totalExpenses)} accent={P.rose} />
                <StatCard label="Cost per Order" value={fmtTND(a.costPerOrder)}
                    sub="total expenses ÷ completed orders" accent={P.orange} />
                <StatCard label="Expense Ratio" value={`${pct(a.totalExpenses, a.totalRevenue)}%`}
                    sub="expenses as % of revenue" accent={P.amber} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Category Distribution */}
                <ChartCard title="Expense Categories" subtitle="All-time distribution">
                    <MiniDonut data={a.expCatPie} colors={[P.sky, P.amber, P.purple, P.orange, P.slate, P.rose]} />
                    <div className="space-y-1.5 mt-3">
                        {a.expCatPie.map((d, i) => (
                            <div key={d.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">{a.EXP_EMOJI[d.name] || '💼'}</span>
                                    <span className="text-xs text-slate-600 capitalize">{d.name}</span>
                                </div>
                                <span className="text-xs font-bold text-slate-700">{d.value.toFixed(2)} TND</span>
                            </div>
                        ))}
                    </div>
                </ChartCard>

                {/* Monthly Expense Trend */}
                <ChartCard title="Monthly Expense Trend" subtitle="Total expenses over time" className="md:col-span-2">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={a.expTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    {a.allExpCats.map((cat, i) => (
                                        <linearGradient key={cat} id={`gExp${i}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={PIE_COLORS[i % PIE_COLORS.length]} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={PIE_COLORS[i % PIE_COLORS.length]} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                                <Tooltip content={<GlassTooltip />} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                {a.allExpCats.map((cat, i) => (
                                    <Area key={cat} type="monotone" dataKey={cat} stackId="exp"
                                        stroke={PIE_COLORS[i % PIE_COLORS.length]}
                                        fill={`url(#gExp${i})`} strokeWidth={1.5} name={cat} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {/* ═══════════════════════════════════════════════════════
                SECTION 7 — Reseller Channel
            ═══════════════════════════════════════════════════════ */}
            <SectionHeader icon={<Handshake size={18} />} title="Reseller Channel"
                subtitle="B2B consignment performance" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Reseller Revenue" value={fmtTND(a.resellerRevenue)} accent={P.teal} />
                <StatCard label="% of Total Revenue" value={`${a.resellerPct.toFixed(1)}%`}
                    sub="reseller contribution" accent={P.cyan} />
                <StatCard label="Outstanding Items" value={a.outstandingQty}
                    sub="units with resellers" accent={P.purple} />
                <StatCard label="Outstanding Value" value={fmtTND(a.outstandingValue)}
                    sub="unsettled consignment sales" accent={P.amber} />
            </div>

            <ChartCard title="Reseller Revenue Trend" subtitle="Monthly reseller sales">
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={a.resellerTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gReseller" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={P.teal} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={P.teal} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                            <Tooltip content={<GlassTooltip />} />
                            <Area type="monotone" dataKey="Reseller Revenue" stroke={P.teal} fill="url(#gReseller)"
                                strokeWidth={2.5} dot={{ r: 3 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>

            {/* Footer spacer for mobile bottom nav */}
            <div className="h-8" />
        </div>
    )
}
