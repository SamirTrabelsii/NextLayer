import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Trash2, Search, X, Package, Box, Sparkles } from 'lucide-react'
import { useSettings } from '../lib/SettingsContext'
import ImageUpload from '../components/ImageUpload'
import StlUpload from '../components/StlUpload'

const CATEGORIES = ['All', 'Keychains', 'Clickers', 'Decorations', 'Parts', 'Custom Orders']
const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'Resin', 'Other']
const PRODUCT_TYPES = [
    { key: 'sellable', label: '🛒 Sellable', desc: 'Sold directly to customers' },
    { key: 'component', label: '🧩 Component', desc: 'Used as a part in composite products' },
    { key: 'both', label: '🛒🧩 Both', desc: 'Sellable and usable as a component' },
]

const empty = {
    name: '', category: 'Keychains', material: 'PLA', color: '',
    print_time_hours: '', filament_grams: '', production_cost: '',
    selling_price: '', description: '', is_active: true,
    image_url: '', stl_url: '', product_type: 'sellable',
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
    
    const [productAssemblies, setProductAssemblies] = useState([]) // Parts for composite product
    const [assemblyItem, setAssemblyItem] = useState({ child_product_id: '', quantity: 1 })
    
    const [multiplier, setMultiplier] = useState('')

    const { settings } = useSettings()

    const [prodHistory, setProdHistory] = useState([])
    const [loadingHist, setLoadingHist] = useState(false)

    async function loadProductionHistory(productId) {
        setLoadingHist(true)
        const { data } = await supabase
            .from('productions')
            .select('id, status, filament_grams, support_grams, print_time_hours, actual_cost, filament_data, created_at, color, material')
            .eq('product_id', productId)
            .order('created_at', { ascending: false })
        setProdHistory(data || [])
        setLoadingHist(false)
    }

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
        setForm({
            ...p,
            image_url: p.image_url || '',
            stl_url: p.stl_url || '',
        })
        setEditing(p.id)
        // Load existing BOM
        const { data: bom } = await supabase
            .from('product_materials')
            .select('*, materials(name, unit, cost_per_unit)')
            .eq('product_id', p.id)
        setProductMaterials(bom || [])

        // Load existing Assemblies (parts)
        const { data: assem } = await supabase
            .from('product_assemblies')
            .select('*')
            .eq('parent_product_id', p.id)
        setProductAssemblies(assem || [])

        setShowModal(true)
        loadProductionHistory(p.id)
    }

    function openAdd() {
        setForm(empty)
        setEditing(null)
        setProductMaterials([])
        setProductAssemblies([])
        setShowModal(true)
    }

    function closeModal() {
        setShowModal(false)
        setForm(empty)
        setEditing(null)
        setMultiplier('')
    }

    // Moved inside component so it can access settings from context
    function calcProductCost(formData, bom, assemblies = []) {
        const grams = parseFloat(formData.filament_grams) || 0
        const hours = parseFloat(formData.print_time_hours) || 0
        const filamentCost = (grams / 1000) * (settings.filament_price_per_kg ?? 35)
        const electricityCost = hours * (settings.electricity_per_hour ?? 0.15)
        const materialsCost = bom.reduce((s, b) =>
            s + ((b.quantity_per_unit || 1) * (b.materials?.cost_per_unit || 0)), 0)
            
        // Calculate cost of child parts
        const assemblyCost = assemblies.reduce((s, a) => {
             const child = products.find(p => p.id === a.child_product_id)
             return s + ((a.quantity || 1) * (parseFloat(child?.production_cost) || 0))
        }, 0)
        
        return (filamentCost + electricityCost + materialsCost + assemblyCost).toFixed(2)
    }

    // Helper to update both cost and price if a multiplier is active
    function updateFormCostAndPrice(f, bom, assemblies) {
        const cost = calcProductCost(f, bom, assemblies)
        f.production_cost = cost
        if (multiplier && !isNaN(parseFloat(multiplier))) {
            // "arrondi" -> round to nearest integer
            f.selling_price = Math.round(parseFloat(cost) * parseFloat(multiplier)).toFixed(2)
        }
        return f
    }

    // Auto-calculate production cost when filament or time changes
    function handleChange(e) {
        const { name, value, type, checked } = e.target
        let updated = { ...form, [name]: type === 'checkbox' ? checked : value }
        if (['filament_grams', 'print_time_hours'].includes(name)) {
            updated = updateFormCostAndPrice(updated, productMaterials, productAssemblies)
        }
        setForm(updated)
    }

    function handleMultiplierChange(e) {
        const val = e.target.value
        setMultiplier(val)
        if (val && form.production_cost) {
            const m = parseFloat(val)
            const c = parseFloat(form.production_cost)
            if (!isNaN(m) && !isNaN(c)) {
                const price = Math.round(c * m)
                setForm(f => ({ ...f, selling_price: price.toFixed(2) }))
            }
        }
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
        setForm(f => updateFormCostAndPrice({ ...f }, newBom, productAssemblies))
    }

    function removeBomItem(idx) {
        const newBom = productMaterials.filter((_, i) => i !== idx)
        setProductMaterials(newBom)
        setForm(f => updateFormCostAndPrice({ ...f }, newBom, productAssemblies))
    }

    async function addAssemblyItem() {
        if (!assemblyItem.child_product_id) return
        const newAssem = [...productAssemblies, assemblyItem]
        setProductAssemblies(newAssem)
        setAssemblyItem({ child_product_id: '', quantity: 1 })
        setForm(f => updateFormCostAndPrice({ ...f }, productMaterials, newAssem))
    }

    function removeAssemblyItem(idx) {
        const newAssem = productAssemblies.filter((_, i) => i !== idx)
        setProductAssemblies(newAssem)
        setForm(f => updateFormCostAndPrice({ ...f }, productMaterials, newAssem))
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

        // Save BOM and Assemblies
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
            
            // Try to save assemblies. If it fails (table doesn't exist yet), catch it so we don't crash the save
            try {
                await supabase.from('product_assemblies').delete().eq('parent_product_id', productId)
                if (productAssemblies.length > 0) {
                    await supabase.from('product_assemblies').insert(
                        productAssemblies.map(a => ({
                            parent_product_id: productId,
                            child_product_id: a.child_product_id,
                            quantity: a.quantity,
                        }))
                    )
                }
            } catch (err) {
                console.warn('Failed to save assemblies, table may not exist yet:', err)
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
                    <h1 className="text-2xl font-bold text-slate-800">Catalogue</h1>
                    <p className="text-sm text-slate-500">{products.length} products</p>
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
                    {filtered.map(p => {
                        const isCustomOrder = p.category === 'Custom Orders';
                        return (
                            <div key={p.id} className={`rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-300
                  ${!p.is_active ? 'opacity-50' : ''}
                  ${isCustomOrder
                      ? 'bg-violet-50/70 dark:bg-violet-950/30 border-violet-200/80 hover:border-violet-300'
                      : 'bg-white border-slate-200'
                  }`}>

                                {/* Product image */}
                                {p.image_url && (
                                    <div className="mb-3 -mx-4 -mt-4 rounded-t-2xl overflow-hidden">
                                        <img src={p.image_url} alt={p.name}
                                            className="w-full h-36 object-cover" />
                                    </div>
                                )}

                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            {isCustomOrder ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-100/80 border border-violet-200 px-2 py-0.5 rounded-full shadow-sm">
                                                    <Sparkles size={10} className="text-violet-500 animate-pulse" /> {p.category}
                                                </span>
                                            ) : (
                                                <span className="text-xs font-medium text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                                                    {p.category}
                                                </span>
                                            )}
                                            {(p.product_type === 'component' || p.product_type === 'both') && (
                                                <span className="text-xs font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">🧩 Part</span>
                                            )}
                                            {p.product_type === 'both' && (
                                                <span className="text-xs font-medium text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full">🛒 Sell</span>
                                            )}
                                            {p.stl_url && (
                                                <a href={p.stl_url} download target="_blank" rel="noreferrer"
                                                    className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full hover:bg-violet-100 transition-colors flex items-center gap-1">
                                                    <Box size={10} /> STL
                                                </a>
                                            )}
                                        </div>
                                    <h3 className="font-semibold text-slate-800">{p.name}</h3>
                                    <p className="text-xs text-slate-400">{p.material}{p.color ? ` · ${p.color}` : ''}</p>
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
                    )})}
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

                            {/* Product Type */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">Product Type</label>
                                <div className="flex gap-2">
                                    {PRODUCT_TYPES.map(t => (
                                        <button key={t.key} type="button"
                                            onClick={() => setForm(f => ({ ...f, product_type: t.key }))}
                                            className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold border-2 transition-all
                                                ${form.product_type === t.key
                                                    ? 'border-sky-400 bg-sky-50 text-sky-700'
                                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                    {PRODUCT_TYPES.find(t => t.key === form.product_type)?.desc}
                                </p>
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
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">
                                        Production Cost
                                        <span className="text-xs text-sky-500 ml-1">auto</span>
                                    </label>
                                    <input name="production_cost" type="number" value={form.production_cost} onChange={handleChange}
                                        placeholder="0.00"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-sky-50" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1 text-center">
                                        Multiplier (x)
                                    </label>
                                    <input type="number" step="0.1" value={multiplier} onChange={handleMultiplierChange}
                                        placeholder="e.g. 2.0"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-emerald-50 text-emerald-700" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-1">Selling Price</label>
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
                            
                            {/* Assemblies (Parts) */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-2">
                                    🧩 Sub-Parts (Composite Product)
                                    <span className="text-xs text-slate-400 font-normal ml-1">
                                        — other products required to build this one
                                    </span>
                                </label>

                                {productAssemblies.length > 0 && (
                                    <div className="mb-2 space-y-1.5">
                                        {productAssemblies.map((a, idx) => {
                                            const child = products.find(p => p.id === a.child_product_id)
                                            return (
                                                <div key={idx} className="flex items-center justify-between bg-violet-50 rounded-xl px-3 py-2 border border-violet-100">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-violet-700">{child?.name || 'Unknown part'}</span>
                                                        <span className="text-xs text-violet-400">× {a.quantity}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {child?.production_cost > 0 && (
                                                            <span className="text-xs text-violet-600 font-medium">
                                                                {(a.quantity * child.production_cost).toFixed(2)} TND
                                                            </span>
                                                        )}
                                                        <button onClick={() => removeAssemblyItem(idx)}
                                                            className="p-1 text-red-400 hover:text-red-600">
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        <div className="text-xs text-right text-slate-500 pr-2">
                                            Parts total: {productAssemblies.reduce((s, a) => {
                                                const child = products.find(p => p.id === a.child_product_id)
                                                return s + ((a.quantity || 1) * (parseFloat(child?.production_cost) || 0))
                                            }, 0).toFixed(2)} TND
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <select value={assemblyItem.child_product_id}
                                        onChange={e => setAssemblyItem(f => ({ ...f, child_product_id: e.target.value }))}
                                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                        <option value="">Add a part...</option>
                                        {products.filter(p => p.id !== editing && !productAssemblies.find(a => a.child_product_id === p.id) && (p.product_type === 'component' || p.product_type === 'both')).map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <input type="number" min="1" value={assemblyItem.quantity}
                                        onChange={e => setAssemblyItem(f => ({ ...f, quantity: e.target.value }))}
                                        className="w-16 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-300"
                                        placeholder="Qty" />
                                    <button onClick={addAssemblyItem} disabled={!assemblyItem.child_product_id}
                                        className="px-3 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white rounded-xl text-sm font-medium">
                                        Add Part
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
                            {/* Image upload */}
                            <ImageUpload
                                folder="products/images"
                                value={form.image_url}
                                onChange={url => setForm(f => ({ ...f, image_url: url }))}
                                label="Product Photo" />

                            {/* STL file upload */}
                            <StlUpload
                                folder="products/stl"
                                value={form.stl_url}
                                onChange={url => setForm(f => ({ ...f, stl_url: url }))}
                                label="STL File" />

                            {/* Active toggle */}
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div className={`w-10 h-6 rounded-full transition-colors ${form.is_active ? 'bg-sky-500' : 'bg-slate-300'}`}
                                    onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                                    <div className={`w-4 h-4 bg-white rounded-full mt-1 transition-transform shadow
                    ${form.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                                </div>
                                <span className="text-sm font-medium text-slate-700">Active product</span>
                            </label>

                            {editing && (
                                <div className="border-t border-slate-100 pt-4">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                        🖨️ Production History
                                    </p>

                                    {loadingHist ? (
                                        <p className="text-xs text-slate-400 text-center py-4">Loading...</p>
                                    ) : prodHistory.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-4">
                                            No productions linked to this product yet.
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* Combined cost */}
                                            {(() => {
                                                const donePrints = prodHistory.filter(p => p.status === 'done')
                                                const totalCost  = donePrints.reduce((s, p) => s + (parseFloat(p.actual_cost) || 0), 0)
                                                const totalGrams = donePrints.reduce((s, p) => s + (parseFloat(p.filament_grams) || 0), 0)
                                                return donePrints.length > 0 ? (
                                                    <div className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5 flex items-center justify-between mb-3">
                                                        <div>
                                                            <p className="text-xs font-bold text-sky-700">
                                                                {donePrints.length} completed print job{donePrints.length !== 1 ? 's' : ''}
                                                            </p>
                                                            <p className="text-xs text-sky-500">{totalGrams.toFixed(0)}g total filament</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-base font-bold text-sky-700">{totalCost.toFixed(2)} TND</p>
                                                            <p className="text-xs text-sky-400">combined cost</p>
                                                        </div>
                                                    </div>
                                                ) : null
                                            })()}

                                            {/* Individual print jobs */}
                                            {prodHistory.map(p => (
                                                <div key={p.id}
                                                    className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                                                    {/* Status dot */}
                                                    <div className={`w-2 h-2 rounded-full flex-shrink-0
                                                        ${p.status === 'done'     ? 'bg-emerald-500'
                                                        : p.status === 'printing' ? 'bg-yellow-400'
                                                        : p.status === 'failed'   ? 'bg-red-400'
                                                        :                          'bg-slate-300'}`} />

                                                    {/* Color swatches from filament_data */}
                                                    {p.filament_data?.length > 0 && (
                                                        <div className="flex gap-0.5 flex-shrink-0">
                                                            {p.filament_data.filter(f => !f.is_support).slice(0, 4).map((f, i) => (
                                                                <div key={i} className="w-4 h-4 rounded-sm border border-white shadow-sm"
                                                                    style={{ backgroundColor: f.color_hex || '#888' }} />
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Stats */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium text-slate-700">
                                                            {p.status.replace('_',' ')}
                                                            {p.color && ` · ${p.color}`}
                                                            {p.material && ` ${p.material}`}
                                                        </p>
                                                        <p className="text-xs text-slate-400">
                                                            {new Date(p.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                                                            {p.filament_grams && ` · ${p.filament_grams}g`}
                                                            {p.print_time_hours && ` · ${p.print_time_hours}h`}
                                                        </p>
                                                    </div>

                                                    {/* Cost */}
                                                    {p.actual_cost && (
                                                        <p className={`text-xs font-bold flex-shrink-0
                                                            ${p.status === 'done' ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                            {parseFloat(p.actual_cost).toFixed(2)} TND
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
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