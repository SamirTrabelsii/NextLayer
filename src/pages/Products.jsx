import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, Search, X, Package } from 'lucide-react'
import { useSettings } from '../lib/SettingsContext'

const CATEGORIES = ['All', 'Keychains', 'Clickers', 'Decorations', 'Custom Orders']
const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'Resin', 'Other']

// Replace the two hardcoded constants:
// const FILAMENT_PRICE_PER_KG = 35  ← remove
// const ELECTRICITY_PER_HOUR  = 0.15 ← remove

const empty = {
    name: '', category: 'Keychains', material: 'PLA', color: '',
    print_time_hours: '', filament_grams: '', production_cost: '',
    selling_price: '', description: '', is_active: true,
}

export default function Products() {
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('All')
    const [showModal, setShowModal] = useState(false)
    const [form, setForm] = useState(empty)
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [saving, setSaving] = useState(false)
    const [materials, setMaterials] = useState([])
    const [productMaterials, setProductMaterials] = useState([]) // BOM for current product
    const [bomItem, setBomItem] = useState({ material_id: '', quantity_per_unit: 1 })

    useEffect(() => { fetchProducts() }, [])

    async function fetchProducts() {
        setLoading(true)
        const [{ data }, { data: mats }] = await Promise.all([
            supabase.from('products').select('*').order('created_at', { ascending: false }),
            supabase.from('materials').select('id, name, category, unit, cost_per_unit').order('name'),
        ])
        setProducts(data || [])
        setMaterials(mats || [])
        setLoading(false)
    }
    async function openEdit(p) {
        setForm({ ...p })
        setEditing(p.id)
        // Load existing BOM
        const { data: bom } = await supabase
            .from('product_materials')
            .select('*, materials(name, unit, cost_per_unit)')
            .eq('product_id', p.id)
        setProductMaterials(bom || [])
        setShowModal(true)
    }

    function openAdd() {
        setForm(empty)
        setEditing(null)
        setProductMaterials([])
        setShowModal(true)
    }

    function closeModal() {
        setShowModal(false)
        setForm(empty)
        setEditing(null)
    }

    function calcProductCost(formData, bom) {
        const grams = parseFloat(formData.filament_grams) || 0
        const hours = parseFloat(formData.print_time_hours) || 0
        const filamentCost = (grams / 1000) * FILAMENT_PRICE_PER_KG
        const electricityCost = hours * ELECTRICITY_PER_HOUR
        const materialsCost = bom.reduce((s, b) =>
            s + ((b.quantity_per_unit || 1) * (b.materials?.cost_per_unit || 0)), 0)
        return (filamentCost + electricityCost + materialsCost).toFixed(2)
    }

    // Auto-calculate production cost when filament or time changes
    function handleChange(e) {
        const { name, value, type, checked } = e.target
        const updated = { ...form, [name]: type === 'checkbox' ? checked : value }
        if (['filament_grams', 'print_time_hours'].includes(name)) {
            updated.production_cost = calcProductionCost(
                updated.filament_grams,
                updated.print_time_hours,
                productMaterials,
                settings   // pass settings so the function uses live rates
            )
        }
        setForm(updated)
    }

    async function addBomItem() {
        if (!bomItem.material_id) return
        const mat = materials.find(m => m.id === bomItem.material_id)
        const newItem = {
            material_id: bomItem.material_id,
            quantity_per_unit: parseInt(bomItem.quantity_per_unit) || 1,
            materials: mat,
        }
        const newBom = [...productMaterials, newItem]
        setProductMaterials(newBom)
        setBomItem({ material_id: '', quantity_per_unit: 1 })
        setForm(f => ({ ...f, production_cost: calcProductCost(f, newBom) }))
    }

    function removeBomItem(idx) {
        const newBom = productMaterials.filter((_, i) => i !== idx)
        setProductMaterials(newBom)
        setForm(f => ({ ...f, production_cost: calcProductCost(f, newBom) }))
    }

    async function saveProduct() {
        if (!form.name.trim()) return
        setSaving(true)
        const payload = {
            ...form,
            print_time_hours: parseFloat(form.print_time_hours) || null,
            filament_grams: parseFloat(form.filament_grams) || null,
            production_cost: parseFloat(form.production_cost) || null,
            selling_price: parseFloat(form.selling_price) || null,
        }
        let productId = editing
        if (editing) {
            await supabase.from('products').update(payload).eq('id', editing)
        } else {
            const { data } = await supabase.from('products').insert([payload]).select().single()
            productId = data?.id
        }

        // Save BOM
        if (productId) {
            await supabase.from('product_materials').delete().eq('product_id', productId)
            if (productMaterials.length > 0) {
                await supabase.from('product_materials').insert(
                    productMaterials.map(b => ({
                        product_id: productId,
                        material_id: b.material_id,
                        quantity_per_unit: b.quantity_per_unit,
                    }))
                )
            }
        }

        setSaving(false); closeModal(); fetchProducts()
    }

    async function deleteProduct(id) {
        await supabase.from('products').delete().eq('id', id)
        setDeleting(null)
        fetchProducts()
    }

    const filtered = products.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
        const matchCategory = category === 'All' || p.category === category
        return matchSearch && matchCategory
    })

    const margin = (p) => {
        if (!p.selling_price || !p.production_cost) return null
        return (((p.selling_price - p.production_cost) / p.selling_price) * 100).toFixed(0)
    }

    return (
        <div className="max-w-5xl mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Products</h1>
                    <p className="text-sm text-slate-500">{products.length} products in catalogue</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
                    <Plus size={18} /> Add Product
                </button>
            </div>

            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search products..."
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {CATEGORIES.map(c => (
                        <button key={c} onClick={() => setCategory(c)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors
                ${category === c ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* Products Grid */}
            {loading ? (
                <div className="text-center py-20 text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <Package size={48} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-400 font-medium">No products yet</p>
                    <p className="text-slate-400 text-sm">Click "Add Product" to get started</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(p => (
                        <div key={p.id} className={`bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-shadow
              ${!p.is_active ? 'opacity-50' : ''}`}>
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <span className="text-xs font-medium text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                                        {p.category}
                                    </span>
                                    <h3 className="font-semibold text-slate-800 mt-1">{p.name}</h3>
                                    <p className="text-xs text-slate-400">{p.material} {p.color ? `· ${p.color}` : ''}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => openEdit(p)}
                                        className="p-1.5 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg transition-colors">
                                        <Pencil size={15} />
                                    </button>
                                    <button onClick={() => setDeleting(p)}
                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm mt-3 pt-3 border-t border-slate-100">
                                <div>
                                    <p className="text-xs text-slate-400">Cost</p>
                                    <p className="font-semibold text-slate-700">
                                        {p.production_cost ? `${p.production_cost} TND` : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400">Price</p>
                                    <p className="font-semibold text-emerald-600">
                                        {p.selling_price ? `${p.selling_price} TND` : '—'}
                                    </p>
                                </div>
                                {margin(p) && (
                                    <div className="col-span-2">
                                        <p className="text-xs text-slate-400">Margin</p>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                                                <div className="bg-emerald-400 h-1.5 rounded-full"
                                                    style={{ width: `${Math.min(margin(p), 100)}%` }} />
                                            </div>
                                            <span className="text-xs font-semibold text-emerald-600">{margin(p)}%</span>
                                        </div>
                                    </div>
                                )}
                                {p.print_time_hours && (
                                    <div>
                                        <p className="text-xs text-slate-400">Print time</p>
                                        <p className="text-sm text-slate-600">{p.print_time_hours}h</p>
                                    </div>
                                )}
                                {p.filament_grams && (
                                    <div>
                                        <p className="text-xs text-slate-400">Filament</p>
                                        <p className="text-sm text-slate-600">{p.filament_grams}g</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl sm:rounded-t-2xl">
                            <h2 className="text-lg font-bold text-slate-800">
                                {editing ? 'Edit Product' : 'New Product'}
                            </h2>
                            <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Name */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Product Name *</label>
                                <input name="name" value={form.name} onChange={handleChange}
                                    placeholder="e.g. Custom Keychain Dragon"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            {/* Category + Material */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Category</label>
                                    <select name="category" value={form.category} onChange={handleChange}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                                        {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Material</label>
                                    <select name="material" value={form.material} onChange={handleChange}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                                        {MATERIALS.map(m => <option key={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Color */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Color</label>
                                <input name="color" value={form.color} onChange={handleChange}
                                    placeholder="e.g. Black, Red, Transparent..."
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                            </div>

                            {/* Print time + Filament */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Print Time (hours)</label>
                                    <input name="print_time_hours" type="number" value={form.print_time_hours} onChange={handleChange}
                                        placeholder="e.g. 2.5"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Filament (grams)</label>
                                    <input name="filament_grams" type="number" value={form.filament_grams} onChange={handleChange}
                                        placeholder="e.g. 45"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            {/* Cost + Price */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">
                                        Production Cost (TND)
                                        <span className="text-xs text-sky-500 ml-1">auto-calculated</span>
                                    </label>
                                    <input name="production_cost" type="number" value={form.production_cost} onChange={handleChange}
                                        placeholder="0.00"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-sky-50" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Selling Price (TND)</label>
                                    <input name="selling_price" type="number" value={form.selling_price} onChange={handleChange}
                                        placeholder="0.00"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            {/* Bill of Materials */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-2">
                                    🔩 Components (Bill of Materials)
                                    <span className="text-xs text-slate-400 font-normal ml-1">
                                        — materials consumed per unit produced
                                    </span>
                                </label>

                                {productMaterials.length > 0 && (
                                    <div className="mb-2 space-y-1.5">
                                        {productMaterials.map((b, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-slate-700">{b.materials?.name}</span>
                                                    <span className="text-xs text-slate-400">× {b.quantity_per_unit} {b.materials?.unit}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {b.materials?.cost_per_unit > 0 && (
                                                        <span className="text-xs text-sky-600 font-medium">
                                                            {(b.quantity_per_unit * b.materials.cost_per_unit).toFixed(2)} TND
                                                        </span>
                                                    )}
                                                    <button onClick={() => removeBomItem(idx)}
                                                        className="p-1 text-red-400 hover:text-red-600">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="text-xs text-right text-slate-500 pr-2">
                                            Materials total: {productMaterials.reduce((s, b) =>
                                                s + ((b.quantity_per_unit || 1) * (b.materials?.cost_per_unit || 0)), 0).toFixed(2)} TND
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <select value={bomItem.material_id}
                                        onChange={e => setBomItem(f => ({ ...f, material_id: e.target.value }))}
                                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                        <option value="">Add a material...</option>
                                        {materials.filter(m => !productMaterials.find(b => b.material_id === m.id)).map(m => (
                                            <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                                        ))}
                                    </select>
                                    <input type="number" min="1" value={bomItem.quantity_per_unit}
                                        onChange={e => setBomItem(f => ({ ...f, quantity_per_unit: e.target.value }))}
                                        className="w-16 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-300"
                                        placeholder="Qty" />
                                    <button onClick={addBomItem} disabled={!bomItem.material_id}
                                        className="px-3 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-xl text-sm font-medium">
                                        Add
                                    </button>
                                </div>
                            </div>

                            {/* Live margin preview */}
                            {form.selling_price && form.production_cost && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm">
                                    <span className="text-emerald-700 font-medium">
                                        Profit: {(form.selling_price - form.production_cost).toFixed(2)} TND
                                        &nbsp;·&nbsp;
                                        Margin: {(((form.selling_price - form.production_cost) / form.selling_price) * 100).toFixed(0)}%
                                    </span>
                                </div>
                            )}

                            {/* Description */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Description (optional)</label>
                                <textarea name="description" value={form.description} onChange={handleChange}
                                    placeholder="Notes about this product..."
                                    rows={2}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                            </div>

                            {/* Active toggle */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className={`w-10 h-6 rounded-full transition-colors ${form.is_active ? 'bg-sky-500' : 'bg-slate-300'}`}
                                    onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                                    <div className={`w-4 h-4 bg-white rounded-full mt-1 transition-transform shadow
                    ${form.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                                </div>
                                <span className="text-sm font-medium text-slate-700">Active product</span>
                            </label>
                        </div>

                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={closeModal}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={saveProduct} disabled={saving || !form.name.trim()}
                                className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
                                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Product'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleting && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete product?</h3>
                        <p className="text-slate-500 text-sm mb-5">
                            "<span className="font-medium">{deleting.name}</span>" will be permanently deleted.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleting(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={() => deleteProduct(deleting.id)}
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