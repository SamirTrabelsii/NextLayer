import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, Search, X, Users, Phone, Mail, MapPin } from 'lucide-react'

const empty = { name: '', phone: '', email: '', address: '', notes: '' }

export default function Clients() {
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(empty)
  const [editing, setEditing]     = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [saving, setSaving]       = useState(false)

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('*, orders(id)')
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  function openAdd() { setForm(empty); setEditing(null); setShowModal(true) }
  function openEdit(c) { setForm({ ...c }); setEditing(c.id); setShowModal(true) }
  function closeModal() { setShowModal(false); setForm(empty); setEditing(null) }

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function saveClient() {
    if (!form.name.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('clients').update(form).eq('id', editing)
    } else {
      await supabase.from('clients').insert([form])
    }
    setSaving(false)
    closeModal()
    fetchClients()
  }

  async function deleteClient(id) {
    await supabase.from('clients').delete().eq('id', id)
    setDeleting(null)
    fetchClients()
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.includes(search)) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
          <p className="text-sm text-slate-500">{clients.length} clients registered</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
          <Plus size={18} /> Add Client
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone or email..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Users size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 font-medium">No clients yet</p>
          <p className="text-slate-400 text-sm">Click "Add Client" to get started</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{c.name}</h3>
                    <p className="text-xs text-slate-400">
                      {c.orders?.length || 0} order{c.orders?.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(c)}
                    className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleting(c)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Contact info */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-3">
                {c.phone && (
                  <a href={`tel:${c.phone}`}
                    className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-sky-500">
                    <Phone size={13} className="text-slate-400" /> {c.phone}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`}
                    className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-sky-500">
                    <Mail size={13} className="text-slate-400" /> {c.email}
                  </a>
                )}
                {c.address && (
                  <span className="flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin size={13} className="text-slate-400" /> {c.address}
                  </span>
                )}
              </div>
              {c.notes && (
                <p className="mt-2 text-xs text-slate-400 italic">"{c.notes}"</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl sm:rounded-t-2xl">
              <h2 className="text-lg font-bold text-slate-800">
                {editing ? 'Edit Client' : 'New Client'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Full Name *</label>
                <input name="name" value={form.name} onChange={handleChange}
                  placeholder="e.g. Ahmed Ben Ali"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Phone</label>
                  <input name="phone" value={form.phone} onChange={handleChange}
                    placeholder="+216 XX XXX XXX"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Email</label>
                  <input name="email" type="email" value={form.email} onChange={handleChange}
                    placeholder="email@example.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Address</label>
                <input name="address" value={form.address} onChange={handleChange}
                  placeholder="City, Region..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                <textarea name="notes" value={form.notes} onChange={handleChange}
                  placeholder="Any notes about this client..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
              </div>
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button onClick={closeModal}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveClient} disabled={saving || !form.name.trim()}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-800 text-lg mb-1">Delete client?</h3>
            <p className="text-slate-500 text-sm mb-5">
              "<span className="font-medium">{deleting.name}</span>" and all their data will be removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => deleteClient(deleting.id)}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}