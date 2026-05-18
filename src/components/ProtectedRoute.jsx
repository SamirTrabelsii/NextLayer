import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

// Roles that can access a route ('admin' always can)
export default function ProtectedRoute({ children, allowedRoles = ['admin'] }) {
  const { user, profile, loading, profileError } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  )

  // Not logged in → go to login
  if (!user) return <Navigate to="/login" replace />

  // Profile lookup failed (e.g. database 500 error or RLS policy recursion)
  if (profileError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 p-6 text-center shadow-lg animate-fade-in">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
            ⚠️
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Database Error (500)</h2>
          <p className="text-sm text-slate-500 mb-4">
            Successfully authenticated, but we encountered a server error while retrieving your profile details from the <strong>profiles</strong> table.
          </p>
          <div className="text-xs text-red-600 bg-red-50 rounded-xl p-3 font-mono text-left mb-4 overflow-x-auto space-y-1 max-h-40">
            <p><strong>Error Message:</strong> {profileError.message || 'Internal Server Error'}</p>
            <p><strong>Error Code:</strong> {profileError.code || '500'}</p>
            <p><strong>Details:</strong> {profileError.details || 'Check Row Level Security (RLS) policies or database logs for recursion limits.'}</p>
            <p><strong>User ID:</strong> {user.id}</p>
          </div>
          <button onClick={() => window.location.reload()}
            className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  // Profile loaded but doesn't exist (e.g. auth user exists but no profile row)
  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 p-6 text-center shadow-lg animate-fade-in">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
            👤
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Profile Missing</h2>
          <p className="text-sm text-slate-500 mb-4">
            Logged in as <strong>{user.email}</strong>, but no matching record was found in the <strong>profiles</strong> table.
          </p>
          <div className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 font-mono text-left mb-4">
            <p><strong>User ID:</strong> {user.id}</p>
            <p className="mt-1"><strong>Tip:</strong> An administrator must add your account in the User Management section to assign a role and link your profile.</p>
          </div>
          <button onClick={() => window.location.reload()}
            className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            Check Again
          </button>
        </div>
      </div>
    )
  }

  // Role not allowed → go to dashboard
  const allowed = allowedRoles.includes(profile.role)
  if (!allowed) return <Navigate to="/dashboard" replace />

  return children
}
