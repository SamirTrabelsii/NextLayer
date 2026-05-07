import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Box, Users, Receipt, Lightbulb, Printer, Package } from 'lucide-react'

const nav = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/orders', icon: ShoppingCart, label: 'Orders' },
    { to: '/productions', icon: Printer, label: 'Production' },
    { to: '/stock', icon: Package, label: 'Stock' },
    { to: '/products', icon: Box, label: 'Products' },
    { to: '/clients', icon: Users, label: 'Clients' },
    { to: '/expenses', icon: Receipt, label: 'Expenses' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
]

export default function Layout() {
    return (
        <div className="flex h-screen bg-slate-50">
            <aside className="hidden md:flex flex-col w-56 bg-slate-900 text-white py-6 px-3 gap-1">
                <div className="px-3 mb-6">
                    <h1 className="text-lg font-bold text-sky-400">🖨️ PrintBoard</h1>
                    <p className="text-xs text-slate-400">Business Dashboard</p>
                </div>
                {nav.map(({ to, icon: Icon, label }) => (
                    <NavLink key={to} to={to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`
                        }>
                        <Icon size={18} />{label}
                    </NavLink>
                ))}
            </aside>

            <div className="flex flex-col flex-1 overflow-hidden">
                <main className="flex-1 overflow-y-auto pb-24 md:pb-0 px-4 py-6">
                    <Outlet />
                </main>

                {/* Mobile bottom nav - scrollable */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
                    <div className="flex overflow-x-auto scrollbar-hide py-2 px-2 gap-1">
                        {nav.map(({ to, icon: Icon, label }) => (
                            <NavLink key={to} to={to}
                                className={({ isActive }) =>
                                    `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs flex-shrink-0 transition-colors
                  ${isActive ? 'text-sky-500 bg-sky-50' : 'text-slate-400'}`
                                }>
                                <Icon size={20} />
                                {label}
                            </NavLink>
                        ))}
                    </div>
                </nav>
            </div>
        </div>
    )
}