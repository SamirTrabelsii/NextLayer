import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, Shield, User } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SECRET_ROLE_KEY || import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
)

export default function UserManagement() {
  const [profiles, setProfiles]   = useState([])
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [form, setForm] = useState({
    email: '', password: '', full_name: '',
    role: 'reseller', reseller_client_id: '',
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('clients').select('id, name').eq('is_reseller', true).order('name'),
    ])
    setProfiles(p || [])
    setClients(c || [])
    setLoading(false)
  }

  async function createUser() {
    if (!form.email || !form.password || !form.full_name) return
    if (form.role === 'reseller' && !form.reseller_client_id) {
      setError('Select the reseller client account for this user.')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Create auth user via Supabase admin API
      const { data, error: signUpErr } = await supabaseAdmin.auth.admin.createUser({
        email:    form.email,
        password: form.password,
        email_confirm: true,
      })
      if (signUpErr) throw signUpErr

      // Create profile
      const { error: profileErr } = await supabase.from('profiles').insert([{
        id:                 data.user.id,
        email:              form.email,
        full_name:          form.full_name,
        role:               form.role,
        reseller_client_id: form.role === 'reseller' ? form.reseller_client_id : null,
      }])
      if (profileErr) throw profileErr

      setShowModal(false)
      setForm({ email:'', password:'', full_name:'', role:'reseller', reseller_client_id:'' })
      fetchAll()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to create user.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteUser(userId) {
    if (!confirm('Delete this user? They will lose access immediately.')) return
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      await supabase.from('profiles').delete().eq('id', userId)
      fetchAll()
    } catch (err) {
      console.error(err)
    }
  }

  const roleColor = role =>
    role === 'admin' ? 'bg-sky-100 text-sky-700' : 'bg-purple-100 text-purple-700'

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="text-sm text-slate-500">{profiles.length} accounts</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
          <Plus size={18} /> Add User
        </button>
      </div>

      {/* User list */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading...</div>
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map(p => (
            <div key={p.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                ${p.role === 'admin' ? 'bg-sky-100' : 'bg-purple-100'}`}>
                {p.role === 'admin'
                  ? <Shield size={18} className="text-sky-600" />
                  : <User   size={18} className="text-purple-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-slate-800">{p.full_name || '—'}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${roleColor(p.role)}`}>
                    {p.role}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{p.email}</p>
                {p.role === 'reseller' && p.reseller_client_id && (
                  <p className="text-xs text-purple-500 mt-0.5">
                    🤝 Linked to reseller account:{' '}
                    {clients.find(c => c.id === p.reseller_client_id)?.name || 'Unknown'}
                  </p>
                )}
              </div>
              <button onClick={() => deleteUser(p.id)}
                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create user modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl
            max-h-[85vh] overflow-y-auto mb-16 sm:mb-0">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
              <h2 className="text-lg font-bold text-slate-800">New User</h2>
              <button onClick={() => { setShowModal(false); setError('') }}
                className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Full Name *</label>
                <input value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="e.g. Fatma Reseller"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Email *</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@email.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Password *</label>
                <input type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Minimum 6 characters"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Role *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'admin',    label: '🛡️ Admin',    desc: 'Full access' },
                    { key: 'reseller', label: '🤝 Reseller', desc: 'Sales only'  },
                  ].map(r => (
                    <button key={r.key}
                      onClick={() => setForm(f => ({ ...f, role: r.key }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all
                        ${form.role === r.key
                          ? 'border-sky-400 bg-sky-50'
                          : 'border-slate-200 hover:border-slate-300'}`}>
                      <p className="text-sm font-bold text-slate-800">{r.label}</p>
                      <p className="text-xs text-slate-400">{r.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reseller: link to client account */}
              {form.role === 'reseller' && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Link to reseller client *
                  </label>
                  <select value={form.reseller_client_id}
                    onChange={e => setForm(f => ({ ...f, reseller_client_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                    <option value="">Select client account...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Must be a client with the Reseller toggle enabled.
                    <span className="text-sky-500 ml-1">Go to Clients page to create one if needed.</span>
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-medium">
                  ⚠️ {error}
                </div>
              )}
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button onClick={() => { setShowModal(false); setError('') }}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={createUser}
                disabled={saving || !form.email || !form.password || !form.full_name}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
