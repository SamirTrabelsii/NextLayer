import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Trash2, Lightbulb, Clock } from 'lucide-react'

const STATUSES = [
  { key: 'idea',        label: 'Idea',        emoji: '💡', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'in_progress', label: 'In Progress',  emoji: '🔨', color: 'bg-blue-100 text-blue-700'    },
  { key: 'done',        label: 'Done',         emoji: '✅', color: 'bg-emerald-100 text-emerald-700'},
  { key: 'dropped',     label: 'Dropped',      emoji: '🗑️', color: 'bg-slate-100 text-slate-500'  },
]

const empty = { title: '', description: '', status: 'idea', estimated_hours: '' }

export default function Ideas() {
  const [ideas, setIdeas]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(empty)
  const [editing, setEditing]     = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [filterStatus, setFilter] = useState('all')

  useEffect(() => { fetchIdeas() }, [])

  async function fetchIdeas() {
    setLoading(true)
    const { data } = await supabase
      .from('ideas')
      .select('*')
      .order('created_at', { ascending: false })
    setIdeas(data || [])
    setLoading(false)
  }

  function openAdd() { setForm(empty); setEditing(null); setShowModal(true) }
  function openEdit(i) { setForm({ ...i }); setEditing(i.id); setShowModal(true) }
  function closeModal() { setShowModal(false); setForm(empty); setEditing(null) }

  async function saveIdea() {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = { ...form, estimated_hours: parseFloat(form.estimated_hours) || null }
    if (editing) {
      await supabase.from('ideas').update(payload).eq('id', editing)
    } else {
      await supabase.from('ideas').insert([payload])
    }
    setSaving(false)
    closeModal()
    fetchIdeas()
  }

  async function updateStatus(id, status) {
    await supabase.from('ideas').update({ status }).eq('id', id)
    fetchIdeas()
  }

  async function deleteIdea(id) {
    await supabase.from('ideas').delete().eq('id', id)
    setDeleting(null)
    fetchIdeas()
  }

  const filtered = ideas.filter(i => filterStatus === 'all' || i.status === filterStatus)
  const statusInfo = (key) => STATUSES.find(s => s.key === key) || STATUSES[0]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ideas</h1>
          <p className="text-sm text-slate-500">{ideas.length} ideas logged</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
          <Plus size={18} /> New Idea
        </button>
      </div>

      {/* Status filter + counts */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button onClick={() => setFilter('all')}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors
            ${filterStatus === 'all' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          All ({ideas.length})
        </button>
        {STATUSES.map(s => (
          <button key={s.key} onClick={() => setFilter(filterStatus === s.key ? 'all' : s.key)}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors
              ${filterStatus === s.key ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {s.emoji} {s.label} ({ideas.filter(i => i.status === s.key).length})
          </button>
        ))}
      </div>

      {/* Kanban-style columns on desktop, list on mobile */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Lightbulb size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 font-medium">No ideas yet</p>
          <p className="text-slate-400 text-sm">Capture your next product idea!</p>
        </div>
      ) : filterStatus === 'all' ? (
        // Kanban view when showing all
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUSES.map(s => {
            const col = ideas.filter(i => i.status === s.key)
            return (
              <div key={s.key} className="bg-slate-100 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span>{s.emoji}</span>
                  <span className="text-sm font-semibold text-slate-700">{s.label}</span>
                  <span className="ml-auto text-xs text-slate-400 bg-white rounded-full px-2 py-0.5">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map(idea => (
                    <IdeaCard key={idea.id} idea={idea} statusInfo={statusInfo}
                      onEdit={openEdit} onDelete={setDeleting} onStatusChange={updateStatus} />
                  ))}
                  {col.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-4">Empty</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // List view when filtered
        <div className="flex flex-col gap-3">
          {filtered.map(idea => (
            <IdeaCard key={idea.id} idea={idea} statusInfo={statusInfo}
              onEdit={openEdit} onDelete={setDeleting} onStatusChange={updateStatus} list />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl">
              <h2 className="text-lg font-bold text-slate-800">{editing ? 'Edit Idea' : 'New Idea'}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Glow in the dark keychains"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Details, inspiration, target market..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                    {STATUSES.map(s => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Est. Hours</label>
                  <input type="number" value={form.estimated_hours}
                    onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))}
                    placeholder="e.g. 3"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-3">
              <button onClick={closeModal}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={saveIdea} disabled={saving || !form.title.trim()}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Idea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete */}
      {deleting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-800 text-lg mb-1">Delete idea?</h3>
            <p className="text-slate-500 text-sm mb-5">"{deleting.title}" will be removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={() => deleteIdea(deleting.id)}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function IdeaCard({ idea, statusInfo, onEdit, onDelete, onStatusChange, list }) {
  const s = statusInfo(idea.status)
  const NEXT = { idea: 'in_progress', in_progress: 'done' }
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm p-3 ${list ? 'flex items-start gap-3' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800 leading-snug">{idea.title}</h3>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => onEdit(idea)}
              className="p-1 text-slate-300 hover:text-sky-500 rounded-lg transition-colors text-xs">✏️</button>
            <button onClick={() => onDelete(idea)}
              className="p-1 text-slate-300 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={12} /></button>
          </div>
        </div>
        {idea.description && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{idea.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.emoji} {s.label}</span>
          {idea.estimated_hours && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={10} /> {idea.estimated_hours}h
            </span>
          )}
        </div>
        {NEXT[idea.status] && (
          <button onClick={() => onStatusChange(idea.id, NEXT[idea.status])}
            className="mt-2 w-full py-1.5 text-xs font-medium bg-slate-50 hover:bg-sky-50 hover:text-sky-600 rounded-lg border border-slate-200 transition-colors">
            → Move to {statusInfo(NEXT[idea.status]).label}
          </button>
        )}
      </div>
    </div>
  )
}