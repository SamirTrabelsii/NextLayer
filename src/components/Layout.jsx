import { Outlet, NavLink } from 'react-router-dom'
import {
    LayoutDashboard, ShoppingCart, Box, Users,
    Receipt, Lightbulb, Printer, Package, Handshake, Wrench, Settings as SettingsIcon,
    Sun, Moon
} from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'

// ← Drop your logo here once you share the path
import Logo from '../assets/logo.png'

const nav = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/orders', icon: ShoppingCart, label: 'Orders' },
    { to: '/productions', icon: Printer, label: 'Production' },
    { to: '/stock', icon: Package, label: 'Stock' },
    { to: '/materials', icon: Wrench, label: 'Materials' },
    { to: '/products', icon: Box, label: 'Catalogue' },
    { to: '/clients', icon: Users, label: 'Clients' },
    { to: '/reseller', icon: Handshake, label: 'Reseller' },
    { to: '/expenses', icon: Receipt, label: 'Expenses' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { to: '/settings', icon: SettingsIcon, label: 'Settings' },
]

export default function Layout() {
    const { theme, setTheme, toggleTheme } = useTheme()

    return (
        <div className="flex h-screen bg-slate-50">

            {/* Sidebar — desktop */}
            <aside className="hidden md:flex flex-col w-56 bg-slate-900 text-white py-6 px-3 gap-1 overflow-y-auto">
                <div className="px-3 mb-6 flex items-center gap-2">
                    <img src={Logo} alt="Next Layer" className="w-16 h-16 object-contain" />
                    <div>
                        <h1 className="text-sm font-bold text-sky-400 leading-tight">Next Layer</h1>
                        <p className="text-xs text-slate-400 leading-tight">Business Dashboard</p>
                    </div>
                </div>
                <div className="flex-1 flex flex-col gap-1">
                    {nav.map(({ to, icon: Icon, label }) => (
                        <NavLink key={to} to={to}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`
                            }>
                            <Icon size={18} />{label}
                        </NavLink>
                    ))}
                </div>

                {/* Desktop Premium Theme Selector at bottom */}
                <div className="mt-auto pt-4 border-t border-slate-800/80 flex flex-col gap-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">Theme Mode</p>
                    <div className="grid grid-cols-2 p-0.5 bg-slate-950/60 rounded-xl border border-slate-800/50">
                        <button
                            onClick={() => setTheme('light')}
                            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300
                                ${theme === 'light' 
                                    ? 'bg-sky-500 text-white shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <Sun size={14} />
                            <span>Light</span>
                        </button>
                        <button
                            onClick={() => setTheme('dark')}
                            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300
                                ${theme === 'dark' 
                                    ? 'bg-sky-500 text-white shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <Moon size={14} />
                            <span>Dark</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Mobile Float Toggle Button */}
            <button
                onClick={toggleTheme}
                aria-label="Toggle Theme"
                className="fixed top-3 right-4 z-50 md:hidden w-10 h-10 flex items-center justify-center rounded-full shadow-lg border border-slate-200/50 dark:border-slate-800/50 bg-white/75 dark:bg-slate-900/75 backdrop-blur-md text-slate-800 dark:text-slate-100 hover:scale-105 active:scale-95 transition-all duration-300"
            >
                {theme === 'dark' ? (
                    <Sun size={18} className="text-amber-400 animate-[spin_30s_linear_infinite]" />
                ) : (
                    <Moon size={18} className="text-sky-500" />
                )}
            </button>

            <div className="flex flex-col flex-1 overflow-hidden">
                <main className="flex-1 overflow-y-auto px-4 py-6 pb-24 md:pb-6">
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