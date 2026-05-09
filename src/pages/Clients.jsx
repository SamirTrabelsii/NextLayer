import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, Search, X, Users, Phone, Mail, MapPin, ChevronDown, ChevronUp } from 'lucide-react'

const empty = { name: '', phone: '', email: '', address: '', notes: '', is_reseller: false }

const STATUS_COLORS = {
    new: 'bg-slate-100 text-slate-600',
    designing: 'bg-blue-100 text-blue-700',
    quoted: 'bg-purple-100 text-purple-700',
    confirmed: 'bg-sky-100 text-sky-700',
    printing: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-orange-100 text-orange-700',
    delivered: 'bg-indigo-100 text-indigo-700',
    paid: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-600',
}

export default function Clients() {
    const [clients, setClients] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [form, setForm] = useState(empty)
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [saving, setSaving] = useState(false)
    const [expanded, setExpanded] = useState(null)
    const [filterType, setFilter] = useState('all')

    useEffect(() => { fetchClients() }, [])

    async function fetchClients() {
        setLoading(true)
        const { data } = await supabase
            .from('clients')
            .select(`*, orders(id, status, total_price, created_at, custom_description, type,
        order_items(products(name)))`)
            .order('created_at', { ascending: false })
        setClients(data || [])
        setLoading(false)
    }

    function openAdd() { setForm(empty); setEditing(null); setShowModal(true) }
    function openEdit(c) {
        setForm({
            name: c.name, phone: c.phone || '', email: c.email || '',
            address: c.address || '', notes: c.notes || '', is_reseller: c.is_reseller || false
        })
        setEditing(c.id); setShowModal(true)
    }
    function closeModal() { setShowModal(false); setForm(empty); setEditing(null) }

    async function saveClient() {
        if (!form.name.trim()) return
        setSaving(true)
        if (editing) {
            await supabase.from('clients').update(form).eq('id', editing)
        } else {
            await supabase.from('clients').insert([form])
        }
        setSaving(false); closeModal(); fetchClients()
    }

    async function deleteClient(id) {
        await supabase.from('clients').delete().eq('id', id)
        setDeleting(null); fetchClients()
    }

    const totalSpent = (client) =>
        (client.orders || [])
            .filter(o => o.status === 'paid')
            .reduce((s, o) => s + (o.total_price || 0), 0)

    const lastOrder = (client) => {
        const sorted = [...(client.orders || [])].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at))
        return sorted[0] || null
    }

    const filtered = clients.filter(c => {
        const matchSearch =
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            (c.phone && c.phone.includes(search))
        const matchType =
            filterType === 'all' ? true :
                filterType === 'reseller' ? c.is_reseller :
                    !c.is_reseller
        return matchSearch && matchType
    })

    const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
                    <p className="text-sm text-slate-500">{clients.length} clients</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
                    <Plus size={18} /> Add Client
                </button>
            </div>

            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name or phone..."
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </div>
                <div className="flex gap-2">
                    {[{ key: 'all', label: 'All' }, { key: 'client', label: 'Clients' }, { key: 'reseller', label: '🤝 Resellers' }].map(f => (
                        <button key={f.key} onClick={() => setFilter(f.key)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors
                ${filterType === f.key ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20 text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <Users size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-400 font-medium">No clients yet</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map(c => {
                        const spent = totalSpent(c)
                        const last = lastOrder(c)
                        const isOpen = expanded === c.id
                        return (
                            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                <div className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0
                        ${c.is_reseller ? 'bg-purple-100 text-purple-600' : 'bg-sky-100 text-sky-600'}`}>
                                                {c.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-slate-800">{c.name}</h3>
                                                    {c.is_reseller && (
                                                        <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                                                            🤝 Reseller
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400">
                                                    {c.orders?.length || 0} order{c.orders?.length !== 1 ? 's' : ''}
                                                    {spent > 0 ? ` · ${spent.toFixed(2)} TND spent` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => setExpanded(isOpen ? null : c.id)}
                                                className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-colors">
                                                {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                            </button>
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

                                    {/* Contact row */}
                                    <div className="mt-3 pt-3 border-t border-slate-50 flex flex-wrap gap-3">
                                        {c.phone && (
                                            <div className="flex items-center gap-2">
                                                <a href={`https://wa.me/${c.phone.replace(/\s+/g, '')}`}
                                                    target="_blank" rel="noreferrer"
                                                    className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2 py-1 rounded-lg font-medium transition-colors">
                                                    💬 WhatsApp
                                                </a>
                                                <a href={`tel:${c.phone}`}
                                                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-sky-500">
                                                    <Phone size={12} /> {c.phone}
                                                </a>
                                            </div>
                                        )}
                                        {c.email && (
                                            <a href={`mailto:${c.email}`}
                                                className="flex items-center gap-1 text-sm text-slate-500 hover:text-sky-500">
                                                <Mail size={12} /> {c.email}
                                            </a>
                                        )}
                                        {c.address && (
                                            <span className="flex items-center gap-1 text-sm text-slate-500">
                                                <MapPin size={12} /> {c.address}
                                            </span>
                                        )}
                                    </div>
                                    {c.notes && <p className="mt-2 text-xs text-slate-400 italic">"{c.notes}"</p>}
                                </div>

                                {/* Order history - expandable */}
                                {isOpen && (
                                    <div className="border-t border-slate-100 bg-slate-50 p-4">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                            Order History ({c.orders?.length || 0})
                                        </p>
                                        {!c.orders?.length ? (
                                            <p className="text-xs text-slate-400">No orders yet</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {[...c.orders]
                                                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                                                    .map(o => (
                                                        <div key={o.id} className="bg-white rounded-xl px-3 py-2.5 flex items-center justify-between border border-slate-100">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-0.5">
                                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] || 'bg-slate-100 text-slate-600'}`}>
                                                                        {o.status}
                                                                    </span>
                                                                    <span className={`text-xs px-1.5 py-0.5 rounded-full
                                    ${o.type === 'custom' ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-600'}`}>
                                                                        {o.type}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-slate-600 truncate">
                                                                    {o.custom_description ||
                                                                        o.order_items?.map(i => i.products?.name).filter(Boolean).join(', ') ||
                                                                        'Order'}
                                                                </p>
                                                                <p className="text-xs text-slate-400">{fmt(o.created_at)}</p>
                                                            </div>
                                                            <p className="font-semibold text-sm text-slate-700 ml-3 flex-shrink-0">
                                                                {o.total_price ? `${o.total_price} TND` : <span className="text-slate-300">TBD</span>}
                                                            </p>
                                                        </div>
                                                    ))}
                                                <div className="flex justify-between text-xs text-slate-500 pt-1 px-1">
                                                    <span>Total spent (paid orders)</span>
                                                    <span className="font-bold text-emerald-600">{spent.toFixed(2)} TND</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">
                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl">
                            <h2 className="text-lg font-bold text-slate-800">{editing ? 'Edit Client' : 'New Client'}</h2>
                            <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Full Name *</label>
                                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Ahmed Ben Ali"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Phone</label>
                                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                        placeholder="+216 XX XXX XXX"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Email</label>
                                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                        placeholder="email@example.com"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Address</label>
                                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                                    placeholder="City, Region..."
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Any notes about this client..."
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                            </div>

                            {/* Reseller toggle */}
                            <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">Reseller</p>
                                    <p className="text-xs text-slate-400">This person sells your products</p>
                                </div>
                                <div className={`w-12 h-6 rounded-full transition-colors cursor-pointer flex items-center px-1
                  ${form.is_reseller ? 'bg-purple-500' : 'bg-slate-300'}`}
                                    onClick={() => setForm(f => ({ ...f, is_reseller: !f.is_reseller }))}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform
                    ${form.is_reseller ? 'translate-x-6' : 'translate-x-0'}`} />
                                </div>
                            </div>
                        </div>
                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={closeModal}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={saveClient} disabled={saving || !form.name.trim()}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">
                                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Client'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete */}
            {deleting && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete client?</h3>
                        <p className="text-slate-500 text-sm mb-5">
                            "<span className="font-medium">{deleting.name}</span>" and all their data will be removed.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleting(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
                            <button onClick={() => deleteClient(deleting.id)}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}