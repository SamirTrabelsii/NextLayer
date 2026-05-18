import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import logo from '../assets/logo.png'
import hero from '../assets/hero.png'
import { Mail, Lock, Loader2, ShieldCheck, Cpu, BarChart3, Layers } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) {
      setError('Invalid email or password.')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-stretch overflow-hidden font-sans">

      {/* LEFT: LOGIN FORM PANEL */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-8 lg:p-16 bg-slate-950 relative z-10">
        {/* Glow ambient background element */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl -z-10 animate-pulse duration-[6000ms]" />

        <div className="w-full max-w-md space-y-8">
          {/* Logo & Brand Title */}
          <div className="flex flex-col items-center md:items-start">
            <div className="flex items-center gap-4 mb-2">
              <img src={logo} alt="Next Layer Logo" className="w-24 h-24 object-contain" />
              <div className="text-left">
                <span className="text-3xl font-black tracking-tight text-white uppercase">Next <span className="text-sky-400">Layer</span></span>
                <p className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold">Manufacturing Hub</p>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-8 rounded-3xl shadow-2xl relative">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
              <p className="text-sm text-slate-400 mt-1">Access the Next Layer operational grid.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@nextlayer.com"
                    autoFocus
                    required
                    className="w-full bg-slate-950/60 border border-slate-800 focus:border-sky-500/80 rounded-2xl pl-10 pr-4 py-3.5 text-sm text-white placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-sky-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Lock size={16} />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-slate-950/60 border border-slate-800 focus:border-sky-500/80 rounded-2xl pl-10 pr-4 py-3.5 text-sm text-white placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-sky-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Error Box */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3.5 text-xs text-red-400 font-medium flex items-center gap-2.5">
                  <span className="flex-shrink-0 text-base">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-4 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:hover:bg-sky-500 text-slate-950 rounded-2xl font-bold text-sm tracking-wide transition-all shadow-[0_0_20px_rgba(14,165,233,0.15)] hover:shadow-[0_0_25px_rgba(14,165,233,0.35)] flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Establishing Connection...</span>
                  </>
                ) : (
                  <span>Sign In to Terminal</span>
                )}
              </button>
            </form>
          </div>

          {/* Footer branding */}
          <div className="text-center">
            <p className="text-xs text-slate-500 font-medium tracking-wide">
              Next Layer Business Platform © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT: PREMIUM VISUAL PANEL */}
      <div className="hidden md:flex md:w-1/2 bg-slate-900 relative items-center justify-center p-16 overflow-hidden">
        {/* Abstract layer visuals */}
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${hero})` }} />

        {/* Dynamic Dark Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900/85 to-sky-950/40" />

        {/* Ambient floating glow circles */}
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse duration-[8000ms]" />
        <div className="absolute top-1/4 right-1/3 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl animate-pulse duration-[5000ms]" />

        {/* Branding Info Grid */}
        <div className="relative z-10 w-full max-w-lg space-y-10">
          <div className="space-y-4">
            <span className="px-3.5 py-1.5 bg-sky-500/10 border border-sky-400/25 rounded-full text-xs font-semibold text-sky-400 tracking-wider uppercase inline-block">
              Industrial Print Suite
            </span>
            <h2 className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight">
              The future of <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-300 to-purple-400">3D production</span>, automated.
            </h2>
            <p className="text-base text-slate-300 leading-relaxed max-w-md">
              Optimize machine queues, monitor filament consumables, and scale your B2B reseller network inside a single consolidated hub.
            </p>
          </div>

          {/* Core App Feature Grid */}
          <div className="grid grid-cols-2 gap-6 pt-4">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sky-400 flex-shrink-0">
                <Layers size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Queue Automation</h4>
                <p className="text-xs text-slate-400 mt-0.5">Automated printing queues & materials tracking.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sky-400 flex-shrink-0">
                <Cpu size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">IoT Resource Sync</h4>
                <p className="text-xs text-slate-400 mt-0.5">Real-time printer & filament consumption metrics.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-purple-400 flex-shrink-0">
                <BarChart3 size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Smart Analytics</h4>
                <p className="text-xs text-slate-400 mt-0.5">Stacked revenue flows, direct client orders, margins.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-purple-400 flex-shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Secure Access</h4>
                <p className="text-xs text-slate-400 mt-0.5">Role-aware portals for administrators & resellers.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
