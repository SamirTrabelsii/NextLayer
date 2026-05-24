import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import {
  LayoutDashboard, ShoppingCart, Box, Users, Receipt,
  Lightbulb, Printer, Package, Handshake, Wrench,
  Settings as SettingsIcon, UserCog, LogOut, ChevronDown,
  Sun, Moon, Layers
} from 'lucide-react'
import { useState } from 'react'
import Logo from '../assets/logo.png'

// Navigation items per role
const ADMIN_NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/orders',      icon: ShoppingCart,    label: 'Orders'     },
  { to: '/productions', icon: Printer,         label: 'Production' },
  { to: '/stock',       icon: Package,         label: 'Stock'      },
  { to: '/materials',   icon: Wrench,          label: 'Materials'  },
  { to: '/filaments',   icon: Layers,          label: 'Filaments'  },
  { to: '/products',    icon: Box,             label: 'Catalogue'  },
  { to: '/clients',     icon: Users,           label: 'Clients'    },
  { to: '/reseller',    icon: Handshake,       label: 'Reseller'   },
  { to: '/expenses',    icon: Receipt,         label: 'Expenses'   },
  { to: '/ideas',       icon: Lightbulb,       label: 'Ideas'      },
  { to: '/settings',    icon: SettingsIcon,    label: 'Settings'   },
  { to: '/users',       icon: UserCog,         label: 'Users'      },
]

const RESELLER_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/reseller',  icon: Handshake,       label: 'My Sales'  },
]

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const { theme, setTheme, toggleTheme } = useTheme()
  const navigate                       = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const nav = isAdmin ? ADMIN_NAV : RESELLER_NAV

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-50">

      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 bg-slate-900 text-white py-6 px-3 gap-1 overflow-y-auto">

        {/* Brand with Logo */}
        <div className="px-3 mb-6 flex items-center gap-2">
          <img src={Logo} alt="Next Layer" className="w-12 h-12 object-contain" />
          <div>
            <h1 className="text-sm font-bold text-sky-400 leading-tight">Next Layer</h1>
            <p className="text-xs text-slate-400 leading-tight">Business Dashboard</p>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex-1 flex flex-col gap-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}>
              <Icon size={18} />{label}
            </NavLink>
          ))}
        </div>

        {/* User info + logout at bottom */}
        <div className="mt-auto pt-4 border-t border-slate-700 flex flex-col gap-2">
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                ${isAdmin ? 'bg-sky-500 text-white' : 'bg-purple-500 text-white'}`}>
                {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {profile?.full_name || profile?.email}
                </p>
                <p className={`text-xs ${isAdmin ? 'text-sky-400' : 'text-purple-400'}`}>
                  {profile?.role}
                </p>
              </div>
            </div>
            <button onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors mt-1">
              <LogOut size={13} /> Sign out
            </button>
          </div>

          {/* Desktop Premium Theme Selector */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1.5">
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
        </div>
      </aside>

      {/* Mobile Float Toggle Button */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle Theme"
        className="fixed top-3 right-16 z-50 md:hidden w-10 h-10 flex items-center justify-center rounded-full shadow-lg border border-slate-200/50 dark:border-slate-800/50 bg-white/75 dark:bg-slate-900/75 backdrop-blur-md text-slate-800 dark:text-slate-100 hover:scale-105 active:scale-95 transition-all duration-300"
      >
        {theme === 'dark' ? (
          <Sun size={18} className="text-amber-400 animate-[spin_30s_linear_infinite]" />
        ) : (
          <Moon size={18} className="text-sky-500" />
        )}
      </button>

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold text-sky-500">Next Layer</span>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${isAdmin ? 'bg-sky-500 text-white' : 'bg-purple-500 text-white'}`}>
              {(profile?.full_name || '?').charAt(0).toUpperCase()}
            </div>
            <ChevronDown size={12} />
          </button>
          {showUserMenu && (
            <div className="absolute top-12 right-4 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 min-w-36">
              <p className="text-xs text-slate-400 px-2 py-1 font-medium">
                {profile?.full_name}
              </p>
              <button onClick={handleSignOut}
                className="w-full text-left px-2 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-2">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 pb-24 md:pb-6">
          <Outlet />
        </main>

        {/* Bottom nav — mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
          <div className="flex overflow-x-auto py-1.5 px-1 gap-0.5" style={{ scrollbarWidth:'none' }}>
            {nav.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs flex-shrink-0 min-w-[52px] transition-colors
                  ${isActive ? 'text-sky-500 bg-sky-50' : 'text-slate-400'}`}>
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