import { Outlet, NavLink } from 'react-router-dom'
import {
    LayoutDashboard, ShoppingCart, Box, Users,
    Receipt, Lightbulb, Printer, Package, Handshake, Wrench
} from 'lucide-react'

// ← Drop your logo here once you share the path
import Logo from '../assets/logo.png'

const nav = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/orders', icon: ShoppingCart, label: 'Orders' },
    { to: '/productions', icon: Printer, label: 'Production' },
    { to: '/stock', icon: Package, label: 'Stock' },
    { to: '/materials', icon: Wrench, label: 'Materials' },
    { to: '/products', icon: Box, label: 'Products' },
    { to: '/clients', icon: Users, label: 'Clients' },
    { to: '/reseller', icon: Handshake, label: 'Reseller' },
    { to: '/expenses', icon: Receipt, label: 'Expenses' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
]

export default function Layout() {
    return (
        <div className="flex h-screen bg-slate-50">

            {/* Sidebar — desktop */}
            <aside className="hidden md:flex flex-col w-56 bg-slate-900 text-white py-6 px-3 gap-1 overflow-y-auto">
                <div className="px-3 mb-6 flex items-center gap-2">
                    <img src={Logo} alt="Next Layer" className="w-8 h-8 object-contain" />
                    <div>
                        <h1 className="text-sm font-bold text-sky-400 leading-tight">Next Layer</h1>
                        <p className="text-xs text-slate-400 leading-tight">Business Dashboard</p>
                    </div>
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
                <main className="flex-1 overflow-y-auto px-4 py-6
          pb-24 md:pb-6">
                    {/* pb-24 on mobile leaves space above the bottom nav */}
                    <Outlet />
                </main>

                {/* Bottom nav — mobile */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
                    <div className="flex overflow-x-auto py-1.5 px-1 gap-0.5"
                        style={{ scrollbarWidth: 'none' }}>
                        {nav.map(({ to, icon: Icon, label }) => (
                            <NavLink key={to} to={to}
                                className={({ isActive }) =>
                                    `flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl text-xs flex-shrink-0 transition-colors min-w-[52px]
                  ${isActive ? 'text-sky-500 bg-sky-50' : 'text-slate-400'}`
                                }>
                                <Icon size={18} />
                                <span className="leading-none">{label}</span>
                            </NavLink>
                        ))}
                    </div>
                </nav>
            </div>
        </div>
    )
}