import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
    Plus, X, Search, ChevronRight, Trash2,
    ArrowRight, Phone, UserPlus, PackagePlus, AlertTriangle, Box, Download
} from 'lucide-react'
import ImageUpload from '../components/ImageUpload'
import StlUpload from '../components/StlUpload'
import Import3mfModal from '../components/Import3mfModal'
import { calcFilamentCosts } from '../lib/parse3mf'
import { useSettings } from '../lib/SettingsContext'
import { deductFilamentFromSpools } from '../lib/filamentUtils'

// ─── CONSTANTS ────────────────────────────────────────────────
const STATUSES = [
    { key: 'new', label: 'New', emoji: '🆕', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
    { key: 'designing', label: 'Designing', emoji: '✏️', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
    { key: 'quoted', label: 'Quoted', emoji: '💬', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400' },
    { key: 'confirmed', label: 'Confirmed', emoji: '✅', color: 'bg-sky-100 text-sky-700', dot: 'bg-sky-400' },
    { key: 'in_production', label: 'In Production', emoji: '🖨️', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
    { key: 'waiting_restock', label: 'Waiting Restock', emoji: '⏸️', color: 'bg-pink-100 text-pink-700', dot: 'bg-pink-400' },
    { key: 'ready', label: 'Ready', emoji: '📦', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
    { key: 'delivered', label: 'Delivered', emoji: '🚚', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-400' },
    { key: 'paid', label: 'Paid', emoji: '💰', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
    { key: 'cancelled', label: 'Cancelled', emoji: '❌', color: 'bg-red-100 text-red-600', dot: 'bg-red-400' },
]

// Flows per type
const FLOW_CUSTOM = ['new', 'designing', 'quoted', 'confirmed', 'in_production', 'ready', 'delivered', 'paid']
const FLOW_STANDARD = ['new', 'ready', 'delivered', 'paid']
const ACTIVE_STATUSES = ['new', 'designing', 'quoted', 'confirmed', 'in_production', 'ready', 'delivered', 'waiting_restock']
const TERMINAL = ['paid', 'cancelled']

const si = key => STATUSES.find(s => s.key === key) ?? STATUSES[0]

const getFlow = type => type === 'standard' ? FLOW_STANDARD : FLOW_CUSTOM

const getNextStatus = (order) => {
    if (order.status === 'waiting_restock') return 'ready'
    const flow = getFlow(order.type)
    const idx = flow.indexOf(order.status)
    if (idx < 0 || idx >= flow.length - 1) return null
    return flow[idx + 1]
}

// ─── EMPTY FORMS ──────────────────────────────────────────────
const emptyForm = {
    type: 'custom', client_id: '', custom_description: '',
    dimensions: '', reference_notes: '', deadline: '',
    total_price: '', notes: '', status: 'new',
    reference_image_url: '', stl_url: '',
    // Backdated entry — only affects created_at, everything else is normal
    isBackdated: false,
    orderDate: '',
}
// Standard orders: no custom_description, product_id required
const emptyItem = { product_id: '', quantity: 1, unit_price: '' }
const emptyClient = { name: '', phone: '', email: '' }
const emptyProduct = { name: '', category: 'Custom Orders', selling_price: '', production_cost: '' }
const CATEGORIES = ['Keychains', 'Clickers', 'Decorations', 'Custom Orders']

// ─── COMPONENT ────────────────────────────────────────────────
export default function Orders() {
    const [orders, setOrders] = useState([])
    const [clients, setClients] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // UI state
    const [search, setSearch] = useState('')
    const [filterStatus, setFilter] = useState('active')
    const [showModal, setShowModal] = useState(false)
    const [selected, setSelected] = useState(null)
    const [deleting, setDeleting] = useState(null)

    // Form state
    const [form, setForm] = useState(emptyForm)
    const [items, setItems] = useState([{ ...emptyItem }])
    const [saving, setSaving] = useState(false)

    // Inline creation
    const [showNewClient, setShowNewClient] = useState(false)
    const [newClient, setNewClient] = useState(emptyClient)
    const [showNewProduct, setShowNewProduct] = useState(null)
    const [newProduct, setNewProduct] = useState(emptyProduct)
    const [savingInline, setSavingInline] = useState(false)

    // Client search dropdown
    const [clientSearch, setClientSearch] = useState('')
    const [showClientDrop, setShowClientDrop] = useState(false)

    // ✅ These 3 were added recently — must also be INSIDE the function
    const [editingOrder, setEditingOrder] = useState(false)
    const [editForm, setEditForm] = useState({})
    const [savingEdit, setSavingEdit] = useState(false)

    const [showPackagingModal, setShowPackagingModal] = useState(false)
    const [pendingDelivery, setPendingDelivery] = useState(null)
    const [packagingMaterials, setPackagingMaterials] = useState([])
    const [packagingSelection, setPackagingSelection] = useState({}) // { material_id: quantity }
    const [loadingPkg, setLoadingPkg] = useState(false)
    const [confirmingPkg, setConfirmingPkg] = useState(false)
    const [financials, setFinancials] = useState(null)
    const [loadingFin, setLoadingFin] = useState(false)

    const [showProductionModal, setShowProductionModal] = useState(false)
    const [pendingReady, setPendingReady] = useState(null)
    const [productionForm, setProductionForm] = useState({
        price: '', filament_grams: '', print_time_hours: '', actual_cost: '', filament_data: null
    })
    const [productionFormError, setProductionFormError] = useState('')
    const [savingProduction, setSavingProduction] = useState(false)

    // Payment date modal — intercepts the → Paid transition
    const [showPaidDateModal, setShowPaidDateModal] = useState(false)
    const [pendingPaidOrder, setPendingPaidOrder] = useState(null)
    const [paidDateOverride, setPaidDateOverride] = useState('')
    const [confirmingPaidDate, setConfirmingPaidDate] = useState(false)

    const [showOrderImport3mf, setShowOrderImport3mf] = useState(false)
    const { settings } = useSettings()

    async function fetchOrderFinancials(order) {
        setLoadingFin(true)
        setFinancials(null)
        try {
            // Packaging used at delivery — same for both types
            const { data: packagingMoves } = await supabase
                .from('material_movements')
                .select('quantity, materials(name, cost_per_unit)')
                .eq('order_id', order.id)
                .eq('type', 'used')

            const packagingLines = (packagingMoves || [])
                .filter(m => m.quantity > 0)
                .map(m => ({
                    name: m.materials?.name || '?',
                    qty: m.quantity,
                    cost: m.quantity * (m.materials?.cost_per_unit || 0),
                }))
            const packagingCost = packagingLines.reduce((s, l) => s + l.cost, 0)

            let costBreakdown = []
            let totalCost = 0
            let revenue = 0

            // ── CUSTOM ORDER ─────────────────────────────────────────
            if (order.type === 'custom') {
                revenue = parseFloat(order.total_price) || 0

                const { data: productions } = await supabase
                    .from('productions')
                    .select('actual_cost, filament_grams, print_time_hours')
                    .eq('order_id', order.id)

                const prods = productions || []
                const productionCost = prods.reduce((s, p) => s + (parseFloat(p.actual_cost) || 0), 0)

                if (productionCost > 0) {
                    const p = prods[0]
                    costBreakdown.push({
                        label: 'Production',
                        amount: productionCost,
                        sub: [
                            p?.filament_grams ? `${p.filament_grams}g filament` : null,
                            p?.print_time_hours ? `${p.print_time_hours}h print time` : null,
                        ].filter(Boolean).join(' · ') || null,
                    })
                    totalCost = productionCost + packagingCost
                }
                // No production cost → totalCost stays 0 → no financial breakdown shown
            }

            // ── STANDARD ORDER ───────────────────────────────────────
            else {
                const { data: orderItems } = await supabase
                    .from('order_items')
                    .select('quantity, unit_price, product_id, products(id, name, production_cost)')
                    .eq('order_id', order.id)

                const itemsList = orderItems || []

                // Revenue = sum of actual selling prices × quantities
                revenue = itemsList.reduce((s, item) =>
                    s + ((parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1)), 0)

                // Cost = only items that have production_cost set in catalogue
                let itemsCost = 0
                for (const item of itemsList) {
                    const qty = parseInt(item.quantity) || 1
                    const unitCost = parseFloat(item.products?.production_cost) || 0

                    if (unitCost > 0) {
                        itemsCost += unitCost * qty
                        costBreakdown.push({
                            label: item.products?.name || 'Item',
                            amount: unitCost * qty,
                            sub: `${unitCost.toFixed(2)} TND/unit × ${qty}`,
                        })
                    }
                    // Product with no cost → ignored, not shown
                }

                if (itemsCost > 0) {
                    totalCost = itemsCost + packagingCost
                }
                // If no items have cost set → totalCost = 0 → no breakdown shown
            }

            // Packaging line (only if cost exists)
            if (packagingLines.length > 0 && totalCost > 0) {
                costBreakdown.push({
                    label: 'Packaging',
                    amount: packagingCost,
                    sub: packagingLines.map(l => `${l.name} ×${l.qty}`).join(', '),
                })
            }

            const hasBoth = revenue > 0 && totalCost > 0
            const profit = hasBoth ? revenue - totalCost : null
            const margin = profit !== null ? (profit / revenue) * 100 : null

            setFinancials({
                revenue: parseFloat(revenue.toFixed(2)),
                totalCost: parseFloat(totalCost.toFixed(2)),
                profit: profit !== null ? parseFloat(profit.toFixed(2)) : null,
                margin: margin !== null ? parseFloat(margin.toFixed(1)) : null,
                costBreakdown,
                hasRevenue: revenue > 0,
                hasCost: totalCost > 0,
                type: order.type,
            })

        } catch (err) {
            console.error('Financials error:', err)
            setFinancials({ error: true })
        } finally {
            setLoadingFin(false)
        }
    }

    // Accepts explicit order OR falls back to selected panel
    async function fulfillRestockedOrder(targetOrder = null) {
        // Safe check: if targetOrder is a React event or does not have an ID, fall back to selected
        const order = (targetOrder && targetOrder.id) ? targetOrder : selected
        if (!order) return

        setSaving(true)
        setError('')

        try {
            // Always fetch items fresh — never trust cached state
            const { data: orderItems, error: err1 } = await supabase
                .from('order_items')
                .select('id, product_id, quantity, products(id, name)')
                .eq('order_id', order.id)

            if (err1) throw new Error('Failed to load order items.')

            const productItems = (orderItems || []).filter(i => i.product_id)

            // Hard block — never silently advance without verification
            if (productItems.length === 0) {
                setError(
                    'No catalogue products found for this order.\n' +
                    'Items may not have been saved correctly when the order was created.\n' +
                    'Please delete this order and recreate it.'
                )
                return
            }

            // Check ALL products before touching anything
            const problems = []
            const verified = []

            for (const item of productItems) {
                const needed = parseInt(item.quantity) || 1

                const { data: stockRow } = await supabase
                    .from('stock')
                    .select('id, quantity_available')
                    .eq('product_id', item.product_id)
                    .maybeSingle()

                const available = stockRow?.quantity_available ?? 0

                if (!stockRow || available < needed) {
                    problems.push({
                        name: item.products?.name || 'Unknown product',
                        needed,
                        available,
                        missing: Math.max(0, needed - available),
                    })
                } else {
                    verified.push({ item, stockRow, needed })
                }
            }

            // If ANY product still lacks stock → show exactly what's missing
            if (problems.length > 0) {
                const detail = problems
                    .map(p => `• ${p.name}: need ${p.needed}, have ${p.available} (add ${p.missing} more)`)
                    .join('\n')
                setError(`Not enough stock yet:\n${detail}`)
                return
            }

            // All verified — reduce stock
            for (const { item, stockRow, needed } of verified) {
                await supabase.from('stock').update({
                    quantity_available: stockRow.quantity_available - needed,
                    updated_at: new Date().toISOString(),
                }).eq('id', stockRow.id)

                await supabase.from('stock_movements').insert([{
                    product_id: item.product_id,
                    type: 'sold',
                    quantity: needed,
                    is_positive: false,
                    order_id: order.id,
                    notes: `Restocked & fulfilled — ${order.clients?.name || ''}`,
                }])
            }

            // Advance order
            const { error: err2 } = await supabase
                .from('orders')
                .update({
                    status: 'ready',
                    // Note: fulfillRestockedOrder moves to 'ready', not 'paid'
                    // paid_at is set separately when the user marks it paid
                })
                .eq('id', order.id)

            if (err2) throw new Error(err2.message)

            // Update panel if open
            if (selected?.id === order.id) {
                setSelected(prev => ({ ...prev, status: 'ready' }))
            }
            await fetchAll()

        } catch (err) {
            console.error(err)
            setError(err.message || 'Something went wrong.')
        } finally {
            setSaving(false)
        }
    }

    // ─── DATA FETCHING ──────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const [{ data: o, error: e1 }, { data: c }, { data: p }] = await Promise.all([
                supabase.from('orders').select(`
          id, type, status, total_price, is_paid, paid_at, deadline, notes,
          custom_description, dimensions, reference_notes, reference_image_url, stl_url, created_at,
          clients(id, name, phone),
          order_items(id, quantity, unit_price, custom_description, product_id, products(id, name))
        `).order('created_at', { ascending: false }),
                supabase.from('clients').select('id, name, phone').order('name'),
                supabase.from('products').select('id, name, selling_price, category').eq('is_active', true).order('name'),
            ])
            if (e1) throw e1
            setOrders(o ?? [])
            setClients(c ?? [])
            setProducts(p ?? [])
        } catch (err) {
            setError('Failed to load orders. Please refresh.')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    // ─── HELPERS ────────────────────────────────────────────────
    const fmt = d => d
        ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        : null

    const isOverdue = o =>
        o.deadline &&
        !TERMINAL.includes(o.status) &&
        new Date(o.deadline) < new Date()

    const calcTotal = its =>
        its.reduce((s, i) => s + ((parseFloat(i.unit_price) || 0) * (parseInt(i.quantity) || 1)), 0)

    const orderLabel = o => {
        if (o.custom_description) return o.custom_description
        const names = (o.order_items || [])
            .map(i => i.products?.name || i.custom_description)
            .filter(Boolean)
        return names.length ? names.join(', ') : '—'
    }

    // ─── MODAL MANAGEMENT ───────────────────────────────────────
    function openAdd() {
        setForm(emptyForm)
        setItems([{ ...emptyItem }])
        setSelected(null)
        setClientSearch('')
        setShowNewClient(false)
        setShowNewProduct(null)
        setError('')
        setShowModal(true)
    }

    function closeModal() {
        setShowModal(false)
        setShowNewClient(false)
        setShowNewProduct(null)
        setClientSearch('')
        setError('')
    }

    function closeDetail() {
        setSelected(null)
        setFinancials(null)
        setError('')
        setEditingOrder(false)
    }

    // ─── INLINE CLIENT CREATE ────────────────────────────────────
    async function createClientInline() {
        if (!newClient.name.trim()) return
        setSavingInline(true)
        try {
            const { data, error } = await supabase.from('clients').insert([newClient]).select().single()
            if (error) throw error
            setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
            setForm(f => ({ ...f, client_id: data.id }))
            setClientSearch(data.name)
            setShowNewClient(false)
            setNewClient(emptyClient)
        } catch (err) {
            console.error(err)
        } finally {
            setSavingInline(false)
        }
    }

    // ─── INLINE PRODUCT CREATE ───────────────────────────────────
    async function createProductInline(itemIdx) {
        if (!newProduct.name.trim()) return
        setSavingInline(true)
        try {
            const { data, error } = await supabase.from('products').insert([{
                name: newProduct.name,
                category: newProduct.category,
                selling_price: parseFloat(newProduct.selling_price) || null,
                production_cost: parseFloat(newProduct.production_cost) || null,
                is_active: true,
            }]).select().single()
            if (error) throw error
            setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
            updateItem(itemIdx, 'product_id', data.id)
            if (data.selling_price) updateItem(itemIdx, 'unit_price', data.selling_price)
            setShowNewProduct(null)
            setNewProduct(emptyProduct)
        } catch (err) {
            console.error(err)
        } finally {
            setSavingInline(false)
        }
    }

    // ─── ITEM MANAGEMENT ─────────────────────────────────────────
    function updateItem(idx, field, val) {
        setItems(prev => {
            const updated = [...prev]
            updated[idx] = { ...updated[idx], [field]: val }
            if (field === 'product_id' && val) {
                const prod = products.find(p => p.id === val)
                if (prod?.selling_price) updated[idx].unit_price = prod.selling_price
            }
            return updated
        })
    }

    // ─── CHECK STOCK FOR STANDARD ORDERS ─────────────────────────
    // Replace checkAndReduceStock entirely with this:
    async function reduceStockAtomic(orderItems, orderId, clientName) {
        const results = []

        for (const item of orderItems.filter(i => i.product_id)) {
            const qty = parseInt(item.quantity) || 1

            const { data, error } = await supabase.rpc('reduce_stock_atomic', {
                p_product_id: item.product_id,
                p_quantity: qty,
                p_order_id: orderId,
                p_notes: `Sold — ${clientName}`,
            })

            if (error || !data?.success) {
                results.push({
                    success: false,
                    product_id: item.product_id,
                    reason: data?.reason || 'error',
                    available: data?.available ?? 0,
                })
            } else {
                results.push({ success: true, product_id: item.product_id })
            }
        }

        const allOk = results.every(r => r.success)
        return { allOk, results }
    }


    // ─── AUTO-CREATE PRODUCTION (custom orders only) ──────────────
    async function autoCreateProduction(order) {
        const description = order.custom_description || 'Custom order'
        await supabase.from('productions').insert([{
            order_id: order.id,
            description,
            product_id: null,
            quantity: 1,
            status: 'queued',
            material: 'PLA',
        }])
    }
    // ── Open packaging modal before delivering ────────────────────
    async function initDelivery(order) {
        setLoadingPkg(true)
        setPendingDelivery(order)
        setPackagingSelection({})

        const { data: mats } = await supabase
            .from('materials')
            .select('*')
            .gt('quantity_available', 0)
            .order('category')
            .order('name')

        setPackagingMaterials(mats || [])
        setLoadingPkg(false)
        setShowPackagingModal(true)
    }

    async function initProductionDetails(order) {
        // Pre-fill with existing production data if any
        const { data: prod } = await supabase
            .from('productions')
            .select('filament_grams, print_time_hours, actual_cost')
            .eq('order_id', order.id)
            .maybeSingle()

        setProductionForm({
            price: order.total_price ? String(order.total_price) : '',
            filament_grams: prod?.filament_grams ? String(prod.filament_grams) : '',
            print_time_hours: prod?.print_time_hours ? String(prod.print_time_hours) : '',
            actual_cost: prod?.actual_cost ? String(prod.actual_cost) : '',
        })
        setProductionFormError('')
        setPendingReady(order)
        setShowProductionModal(true)
    }

    async function confirmProductionDetails() {
        if (!pendingReady) return

        // Price is required if not already set
        const hasPrice = pendingReady.total_price || parseFloat(productionForm.price) > 0
        if (!hasPrice) {
            setProductionFormError('Price is required to finalize this order.')
            return
        }

        setSavingProduction(true)
        setProductionFormError('')
        try {
            const newPrice = parseFloat(productionForm.price) || null
            const filament = parseFloat(productionForm.filament_grams) || null
            const hours = parseFloat(productionForm.print_time_hours) || null
            const actualCost = parseFloat(productionForm.actual_cost) || null

            // 1. Update order price if user entered one
            if (newPrice && newPrice !== parseFloat(pendingReady.total_price)) {
                await supabase.from('orders')
                    .update({ total_price: newPrice })
                    .eq('id', pendingReady.id)
            }

            // 2. Update linked production with details
            const { data: prod } = await supabase
                .from('productions')
                .select('id')
                .eq('order_id', pendingReady.id)
                .maybeSingle()

            if (prod) {
                await supabase.from('productions').update({
                    filament_grams: filament,
                    print_time_hours: hours,
                    actual_cost: actualCost,
                    status: 'done',
                    filament_data: productionForm.filament_data ?? null,
                }).eq('id', prod.id)

                // ← ADD THIS: Deduct filament from spools
                const { data: updatedProd } = await supabase
                    .from('productions')
                    .select('*')
                    .eq('id', prod.id)
                    .single()

                await deductFilamentFromSpools(updatedProd)
            }

            // 3. Update selected panel state if it's open
            if (selected?.id === pendingReady.id) {
                setSelected(prev => ({
                    ...prev,
                    total_price: newPrice ?? prev.total_price,
                }))
            }

            setShowProductionModal(false)

            // 4. Advance order to ready
            const orderWithUpdatedPrice = {
                ...pendingReady,
                total_price: newPrice ?? pendingReady.total_price,
            }
            await applyStatusChange(orderWithUpdatedPrice, 'ready')
            setPendingReady(null)

        } catch (err) {
            console.error(err)
            setProductionFormError('Something went wrong. Please try again.')
        } finally {
            setSavingProduction(false)
        }
    }

    function handleOrderImport3mf(data) {
        const { filament_grams, support_grams, print_time_hours, filament_data, _filament_cost } = data

        // Calculate full cost: filament (from spool/rate) + electricity + machine wear
        const hours = parseFloat(print_time_hours) || 0
        const elecCost = hours * (settings.electricity_per_hour || 0.15)
        const machineRate = settings.machine_cost > 0 && settings.machine_lifespan_hours > 0
            ? settings.machine_cost / settings.machine_lifespan_hours : 0
        const nozzleRate = settings.nozzle_cost > 0 && settings.nozzle_lifespan_hours > 0
            ? settings.nozzle_cost / settings.nozzle_lifespan_hours : 0
        const wearCost = hours * (machineRate + nozzleRate)
        const totalCost = parseFloat(((_filament_cost || 0) + elecCost + wearCost).toFixed(3))

        setProductionForm(prev => ({
            ...prev,
            filament_grams: filament_grams ? String(filament_grams) : prev.filament_grams,
            print_time_hours: print_time_hours ? String(print_time_hours) : prev.print_time_hours,
            actual_cost: totalCost ? String(totalCost) : prev.actual_cost,
            filament_data: filament_data ?? prev.filament_data,
        }))
        setShowOrderImport3mf(false)
    }

    // ── Confirm delivery: consume packaging then advance order ────
    async function confirmDelivery(skipPackaging = false) {
        if (!pendingDelivery) return
        setConfirmingPkg(true)

        try {
            if (!skipPackaging) {
                const selected = Object.entries(packagingSelection).filter(([, qty]) => qty > 0)

                for (const [materialId, qty] of selected) {
                    const mat = packagingMaterials.find(m => m.id === materialId)
                    if (!mat) continue

                    // Deduct from material stock
                    await supabase.from('materials').update({
                        quantity_available: Math.max(0, mat.quantity_available - qty),
                    }).eq('id', materialId)

                    // Log movement
                    await supabase.from('material_movements').insert([{
                        material_id: materialId,
                        type: 'used',
                        quantity: qty,
                        is_positive: false,
                        order_id: pendingDelivery.id,
                        notes: `Packaging — ${pendingDelivery.clients?.name || 'order'}`,
                    }])
                }
            }

            // Close modal first, then advance order
            setShowPackagingModal(false)
            setPendingDelivery(null)
            setPackagingSelection([])

            await applyStatusChange(pendingDelivery, 'delivered')

        } catch (err) {
            console.error('Delivery error:', err)
            setError('Failed to confirm delivery.')
        } finally {
            setConfirmingPkg(false)
        }
    }

    // ── Helper: should this status change trigger packaging modal? ─
    function handleStatusAdvance(order, targetStatus) {
        if (targetStatus === 'delivered') {
            initDelivery(order)
        } else if (targetStatus === 'ready' && order.type === 'custom') {
            initProductionDetails(order)   // intercept for custom orders
        } else if (targetStatus === 'paid') {
            // Ask "when was this paid?" — pre-fill with the order's own creation date
            const orderDay = order.created_at
                ? order.created_at.split('T')[0]
                : new Date().toISOString().split('T')[0]
            setPaidDateOverride(orderDay)
            setPendingPaidOrder(order)
            setShowPaidDateModal(true)
        } else {
            applyStatusChange(order, targetStatus)
        }
    }

    // Confirm payment date then finalise the → paid transition
    async function confirmPaidDate() {
        if (!pendingPaidOrder) return
        setConfirmingPaidDate(true)
        try {
            const chosenDate = paidDateOverride
                ? new Date(paidDateOverride).toISOString()
                : new Date().toISOString()
            await applyStatusChange(pendingPaidOrder, 'paid', { paidAt: chosenDate })
            setShowPaidDateModal(false)
            setPendingPaidOrder(null)
        } finally {
            setConfirmingPaidDate(false)
        }
    }
    // ─── SAVE ORDER ───────────────────────────────────────────────
    async function saveOrder() {
        if (!form.client_id) return
        setSaving(true)
        setError('')
        try {
            const client = clients.find(c => c.id === form.client_id)
            const validItems = items.filter(i => i.product_id || i.custom_description?.trim())

            // If backdated, we inject created_at — everything else is identical
            const backdatedCreatedAt = form.isBackdated && form.orderDate
                ? new Date(form.orderDate).toISOString()
                : undefined

            let initialStatus = form.status
            let finalPrice = parseFloat(form.total_price) || null

            if (form.type === 'standard') {
                finalPrice = calcTotal(validItems) || null
                const hasProducts = validItems.some(i => i.product_id)

                if (hasProducts) {
                    // Check availability to decide initial status
                    let canFulfill = true
                    for (const item of validItems.filter(i => i.product_id)) {
                        const qty = parseInt(item.quantity) || 1
                        const { data: stockRow } = await supabase
                            .from('stock')
                            .select('quantity_available')
                            .eq('product_id', item.product_id)
                            .maybeSingle()
                        if ((stockRow?.quantity_available ?? 0) < qty) {
                            canFulfill = false
                            break
                        }
                    }
                    initialStatus = canFulfill ? 'ready' : 'waiting_restock'
                } else {
                    initialStatus = 'ready'
                }
            }

            // Create the order
            const { data: order, error: orderErr } = await supabase
                .from('orders')
                .insert([{
                    type: form.type,
                    client_id: form.client_id,
                    status: initialStatus,
                    total_price: finalPrice,
                    deadline: form.deadline || null,
                    notes: form.notes || null,
                    custom_description: form.type === 'custom' ? form.custom_description : null,
                    dimensions: form.type === 'custom' ? form.dimensions : null,
                    reference_notes: form.type === 'custom' ? form.reference_notes : null,
                    reference_image_url: form.type === 'custom' ? (form.reference_image_url || null) : null,
                    stl_url: form.type === 'custom' ? (form.stl_url || null) : null,
                    is_paid: false,
                    ...(backdatedCreatedAt ? { created_at: backdatedCreatedAt } : {}),
                }])
                .select().single()

            if (orderErr) throw orderErr

            // ── ALWAYS save order items for standard orders ──────────
            // This must happen regardless of stock status
            if (form.type === 'standard' && validItems.length > 0) {
                const { error: itemsErr } = await supabase
                    .from('order_items')
                    .insert(
                        validItems.map(i => ({
                            order_id: order.id,
                            product_id: i.product_id || null,
                            custom_description: i.custom_description || null,
                            quantity: parseInt(i.quantity) || 1,
                            unit_price: parseFloat(i.unit_price) || null,
                        }))
                    )
                if (itemsErr) throw itemsErr
            }

            // ── Reduce stock only if order is immediately ready ──────
            if (form.type === 'standard' && initialStatus === 'ready') {
                for (const item of validItems.filter(i => i.product_id)) {
                    const qty = parseInt(item.quantity) || 1
                    const { data: stockRow } = await supabase
                        .from('stock')
                        .select('id, quantity_available')
                        .eq('product_id', item.product_id)
                        .maybeSingle()

                    if (stockRow && stockRow.quantity_available >= qty) {
                        await supabase.from('stock').update({
                            quantity_available: stockRow.quantity_available - qty,
                            updated_at: new Date().toISOString(),
                        }).eq('id', stockRow.id)

                        await supabase.from('stock_movements').insert([{
                            product_id: item.product_id,
                            type: 'sold',
                            quantity: qty,
                            is_positive: false,
                            order_id: order.id,
                            notes: `Sold — ${client?.name || ''}`,
                        }])
                    } else {
                        // Race condition: stock disappeared — flip to waiting_restock
                        await supabase.from('orders')
                            .update({ status: 'waiting_restock' })
                            .eq('id', order.id)
                    }
                }
            }

            // ── Auto-create production for custom orders ─────────────
            if (form.type === 'custom') {
                await autoCreateProduction(order)
            }

            closeModal()
            await fetchAll()

        } catch (err) {
            console.error('Save order error:', err)
            setError('Something went wrong. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    async function saveOrderEdit() {
        if (!selected) return
        setSavingEdit(true)
        const payload = {
            total_price: parseFloat(editForm.total_price) || null,
            deadline: editForm.deadline || null,
            notes: editForm.notes || null,
            custom_description: editForm.custom_description || null,
            dimensions: editForm.dimensions || null,
            reference_notes: editForm.reference_notes || null,
            reference_image_url: editForm.reference_image_url || null,
            stl_url: editForm.stl_url || null,
            // ── Payment fields ──────────────────────────────────────
            is_paid: editForm.is_paid,
            paid_at: editForm.is_paid && editForm.paid_at
                ? new Date(editForm.paid_at + 'T12:00:00').toISOString()
                : editForm.is_paid && !editForm.paid_at
                    ? new Date().toISOString()
                    : null,
        }
        const { error } = await supabase.from('orders')
            .update(payload).eq('id', selected.id)
        if (!error) {
            setSelected(prev => ({ ...prev, ...payload }))
            setEditingOrder(false)
            await fetchAll()
        }
        setSavingEdit(false)
    }

    // ─── SYNC PRODUCTION WITH ORDER STATUS ───────────────────────
    async function syncProduction(orderId, newStatus) {
        const prodStatusMap = {
            in_production: 'printing',
            ready: 'done',
            cancelled: 'failed',
        }
        const prodStatus = prodStatusMap[newStatus]
        if (!prodStatus) return
        await supabase.from('productions')
            .update({ status: prodStatus })
            .eq('order_id', orderId)
    }

    // Auto-add custom product to catalogue when order is paid
    async function createProductFromOrder(order) {
        if (order.type !== 'custom' || !order.custom_description) return
        try {
            // Get production cost from linked production
            const { data: prod } = await supabase
                .from('productions')
                .select('actual_cost, filament_grams, print_time_hours, material, color')
                .eq('order_id', order.id)
                .maybeSingle()

            const clientName = order.clients?.name || ''
            const paidDate = new Date().toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            })

            await supabase.from('products').insert([{
                name: order.custom_description,
                category: 'Custom Orders',
                description: [
                    clientName ? `Made for ${clientName}` : null,
                    paidDate,
                    order.reference_notes || null,
                ].filter(Boolean).join(' — '),
                selling_price: parseFloat(order.total_price) || null,
                production_cost: parseFloat(prod?.actual_cost) || null,
                material: prod?.material || null,
                color: prod?.color || null,
                print_time_hours: prod?.print_time_hours || null,
                filament_grams: prod?.filament_grams || null,
                image_url: order.reference_image_url || null,
                stl_url: order.stl_url || null,
                is_active: true,
            }])
        } catch (err) {
            // Non-blocking — don't fail the order if product creation fails
            console.error('Failed to create product from order:', err)
        }
    }

    // ─── ADVANCE STATUS ───────────────────────────────────────────
    async function advanceStatus(order) {
        const next = getNextStatus(order)
        if (!next) return
        await applyStatusChange(order, next)
    }

    async function applyStatusChange(order, next, options = {}) {
        setSaving(true)
        setError('')

        try {

            // ── WAITING RESTOCK → READY ──────────────────────────────
            // Must verify stock is available now, then reduce it
            if (order.status === 'waiting_restock' && next === 'ready') {

                // Always fetch fresh order items directly from DB — never trust stale state
                const { data: rawItems, error: fetchErr } = await supabase
                    .from('order_items')
                    .select('id, product_id, quantity, products(id, name)')
                    .eq('order_id', order.id)

                if (fetchErr) throw new Error('Could not load order items.')

                const productItems = (rawItems || []).filter(i => i.product_id)

                if (productItems.length === 0) {
                    setError('No items found for this order. Cannot verify stock.')
                    setSaving(false)
                    return
                } else {

                    // ── PASS 1: Check ALL items before touching anything ──────
                    const problems = []

                    for (const item of productItems) {
                        const needed = parseInt(item.quantity) || 1

                        const { data: stockRow } = await supabase
                            .from('stock')
                            .select('quantity_available')
                            .eq('product_id', item.product_id)
                            .maybeSingle()

                        const available = stockRow?.quantity_available ?? 0

                        if (available < needed) {
                            problems.push({
                                name: item.products?.name || 'Unknown product',
                                needed,
                                available,
                                missing: needed - available,
                            })
                        }
                    }

                    // If ANY item fails → stop entirely, show exactly what's missing
                    if (problems.length > 0) {
                        const lines = problems.map(p =>
                            `• ${p.name}: need ${p.needed}, have ${p.available} (${p.missing} missing)`
                        ).join('\n')
                        setError(`Cannot fulfill — not enough stock:\n${lines}`)
                        setSaving(false)
                        return
                    }

                    // ── PASS 2: All checks passed → reduce stock atomically ───
                    for (const item of productItems) {
                        const qty = parseInt(item.quantity) || 1

                        const { data: stockRow } = await supabase
                            .from('stock')
                            .select('id, quantity_available')
                            .eq('product_id', item.product_id)
                            .maybeSingle()

                        if (!stockRow) continue

                        // Final safety check in case stock changed between Pass 1 and 2
                        if (stockRow.quantity_available < qty) {
                            setError(`Stock changed during update. Please try again.`)
                            setSaving(false)
                            return
                        }

                        await supabase.from('stock').update({
                            quantity_available: stockRow.quantity_available - qty,
                            updated_at: new Date().toISOString(),
                        }).eq('id', stockRow.id)

                        await supabase.from('stock_movements').insert([{
                            product_id: item.product_id,
                            type: 'sold',
                            quantity: qty,
                            is_positive: false,
                            order_id: order.id,
                            notes: `Restocked & fulfilled — ${order.clients?.name || ''}`,
                        }])
                    }
                }
            }

            // ── UPDATE ORDER STATUS ──────────────────────────────────
            const { error: updateErr } = await supabase
                .from('orders')
                .update({
                    status: next,
                    is_paid: next === 'paid',
                    // Use caller-supplied paidAt if provided (backdated orders), else now
                    ...(next === 'paid' ? { paid_at: options.paidAt ?? new Date().toISOString() } : {}),
                })
                .eq('id', order.id)

            if (updateErr) throw new Error(updateErr.message)

            // Auto-create product when custom order is paid
            if (next === 'paid' && order.type === 'custom') {
                await createProductFromOrder(order)
            }

            // ── SYNC PRODUCTION (custom orders only) ─────────────────
            if (order.type === 'custom') {
                await syncProduction(order.id, next)

                // Auto-create production when confirmed if none exists
                if (next === 'confirmed') {
                    const { data: existing } = await supabase
                        .from('productions')
                        .select('id')
                        .eq('order_id', order.id)
                        .maybeSingle()

                    if (!existing) await autoCreateProduction(order)
                }
            }

            // ── UPDATE LOCAL STATE ────────────────────────────────────
            if (selected?.id === order.id) {
                setSelected(prev => ({
                    ...prev,
                    status: next,
                    is_paid: next === 'paid',
                }))
            }

            await fetchAll()

        } catch (err) {
            console.error('Status change error:', err)
            setError(err.message || 'Failed to update status. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    // ─── DELETE ORDER ─────────────────────────────────────────────
    async function deleteOrder(id) {
        setSaving(true)
        setError('')
        try {

            // ── 1. Restore stock from standard order ─────────────────
            const { data: stockMoves } = await supabase
                .from('stock_movements')
                .select('id, product_id, quantity')
                .eq('order_id', id)
                .eq('type', 'sold')

            for (const m of stockMoves || []) {
                const { data: row } = await supabase
                    .from('stock')
                    .select('id, quantity_available')
                    .eq('product_id', m.product_id)
                    .maybeSingle()
                if (row) {
                    await supabase.from('stock').update({
                        quantity_available: (row.quantity_available || 0) + m.quantity,
                        updated_at: new Date().toISOString(),
                    }).eq('id', row.id)
                }
            }
            // Delete the movement records themselves
            if ((stockMoves || []).length > 0) {
                await supabase
                    .from('stock_movements')
                    .delete()
                    .eq('order_id', id)
            }

            // ── 2. Restore packaging materials (logged at delivery) ───
            const { data: packMoves } = await supabase
                .from('material_movements')
                .select('id, material_id, quantity')
                .eq('order_id', id)
                .eq('type', 'used')

            for (const m of packMoves || []) {
                const { data: mat } = await supabase
                    .from('materials')
                    .select('id, quantity_available')
                    .eq('id', m.material_id)
                    .maybeSingle()
                if (mat) {
                    await supabase.from('materials').update({
                        quantity_available: (mat.quantity_available || 0) + m.quantity,
                    }).eq('id', mat.id)
                }
            }
            // Delete packaging movement records
            if ((packMoves || []).length > 0) {
                await supabase
                    .from('material_movements')
                    .delete()
                    .eq('order_id', id)
            }

            // ── 3. Handle productions ─────────────────────────────────
            const { data: prods } = await supabase
                .from('productions')
                .select('id, status, product_id, quantity')
                .eq('order_id', id)

            for (const prod of prods || []) {
                if (prod.status === 'done') {

                    // 3a. Restore filament spools
                    const { data: spoolLogs } = await supabase
                        .from('filament_spool_logs')
                        .select('spool_id, grams_used')
                        .eq('production_id', prod.id)

                    for (const log of spoolLogs || []) {
                        const { data: spool } = await supabase
                            .from('filament_spools')
                            .select('id, current_weight_g')
                            .eq('id', log.spool_id)
                            .maybeSingle()
                        if (spool) {
                            await supabase.from('filament_spools').update({
                                current_weight_g:
                                    (spool.current_weight_g || 0) + log.grams_used,
                            }).eq('id', spool.id)
                        }
                    }

                    // Delete spool logs
                    await supabase
                        .from('filament_spool_logs')
                        .delete()
                        .eq('production_id', prod.id)

                    // 3b. Restore BOM materials consumed by this production
                    if (prod.product_id) {
                        const qty = parseInt(prod.quantity) || 1
                        const { data: bom } = await supabase
                            .from('product_materials')
                            .select('material_id, quantity_per_unit, materials(id, quantity_available)')
                            .eq('product_id', prod.product_id)

                        for (const b of bom || []) {
                            const mat = b.materials
                            if (mat) {
                                await supabase.from('materials').update({
                                    quantity_available:
                                        (mat.quantity_available || 0) +
                                        (b.quantity_per_unit || 1) * qty,
                                }).eq('id', mat.id)
                            }
                        }
                    }
                }

                // Delete the production
                await supabase.from('productions').delete().eq('id', prod.id)
            }

            // ── 4. Explicitly delete order_items (CASCADE safety net) ─
            await supabase.from('order_items').delete().eq('order_id', id)

            // ── 5. Delete the order ───────────────────────────────────
            await supabase.from('orders').delete().eq('id', id)

            setDeleting(null)
            setSelected(null)
            await fetchAll()

        } catch (err) {
            console.error('deleteOrder error:', err)
            setError('Failed to delete order cleanly. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    // ─── FILTER ORDERS ────────────────────────────────────────────
    const filtered = orders.filter(o => {
        const term = search.toLowerCase()
        const matchSearch =
            (o.clients?.name || '').toLowerCase().includes(term) ||
            (o.custom_description || '').toLowerCase().includes(term) ||
            o.id.slice(0, 8).includes(term)
        if (!matchSearch) return false
        if (filterStatus === 'active') return ACTIVE_STATUSES.includes(o.status)
        if (filterStatus === 'paid') return o.status === 'paid'
        if (filterStatus === 'cancelled') return o.status === 'cancelled'
        return true // 'all'
    })

    // Count per status (for header pills)
    const countByStatus = key => orders.filter(o => o.status === key).length
    const activeCount = orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.phone && c.phone.includes(clientSearch))
    )
    const selectedClient = clients.find(c => c.id === form.client_id)

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────
    return (
        <div className="max-w-4xl mx-auto">

            {/* ── HEADER ── */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
                    <p className="text-sm text-slate-500">{activeCount} active</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm">
                    <Plus size={18} /> New Order
                </button>
            </div>

            {/* ── GLOBAL ERROR ── */}
            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-600">
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    {error}
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ── STATUS COUNTS — horizontal scrollable ── */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: 'none' }}>
                {/* Active group */}
                <button onClick={() => setFilter('active')}
                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all
            ${filterStatus === 'active' ? 'bg-sky-500 text-white border-sky-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    🔥 Active
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterStatus === 'active' ? 'bg-white/30 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {activeCount}
                    </span>
                </button>

                {/* Individual status pills */}
                {STATUSES.filter(s => !['cancelled', 'paid'].includes(s.key)).map(s => {
                    const count = countByStatus(s.key)
                    if (count === 0) return null
                    return (
                        <button key={s.key}
                            onClick={() => setFilter(filterStatus === s.key ? 'active' : s.key)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all
                ${filterStatus === s.key ? s.color + ' ring-2 ring-offset-1' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                            {s.emoji} {s.label}
                            <span className="bg-white/60 text-current px-1 rounded-full">{count}</span>
                        </button>
                    )
                })}

                <div className="flex-shrink-0 w-px bg-slate-200 mx-1" />

                <button onClick={() => setFilter('paid')}
                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all
            ${filterStatus === 'paid' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    💰 Paid
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterStatus === 'paid' ? 'bg-white/30' : 'bg-slate-100 text-slate-600'}`}>
                        {countByStatus('paid')}
                    </span>
                </button>

                <button onClick={() => setFilter('all')}
                    className={`flex-shrink-0 px-3 py-2 rounded-xl border text-sm font-medium transition-all
            ${filterStatus === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    All ({orders.length})
                </button>
            </div>

            {/* ── SEARCH ── */}
            <div className="relative mb-5">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by client name or description..."
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
            </div>

            {/* ── ORDERS LIST ── */}
            {loading ? (
                <div className="text-center py-20 text-slate-400">Loading...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                    <p className="font-medium">No orders found</p>
                    <p className="text-sm mt-1">
                        {search ? 'Try a different search term' : 'Create your first order above'}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map(o => {
                        const s = si(o.status)
                        const overdue = isOverdue(o)
                        const next = getNextStatus(o)
                        const nextSi = next ? si(next) : null
                        const flow = getFlow(o.type)
                        const flowIdx = flow.indexOf(o.status)

                        return (
                            <div key={o.id}
                                className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">

                                {/* Card body — click to open detail */}
                                <div className="p-4 cursor-pointer" onClick={() => {
                                    setSelected(o)
                                    setError('')
                                    setEditingOrder(false)
                                    fetchOrderFinancials(o)
                                }}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">

                                            {/* Badges row */}
                                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                                                    {s.emoji} {s.label}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${o.type === 'custom' ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-600'}`}>
                                                    {o.type === 'custom' ? '✏️ Custom' : '📦 Standard'}
                                                </span>
                                                {overdue && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                                                        ⚠️ Overdue
                                                    </span>
                                                )}
                                                {o.status === 'waiting_restock' && (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-500 border border-pink-200">
                                                        Out of stock
                                                    </span>
                                                )}
                                            </div>

                                            {/* Client + description */}
                                            <p className="font-semibold text-slate-800 leading-tight">
                                                {o.clients?.name || '—'}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                                                {orderLabel(o)}
                                            </p>
                                        </div>

                                        {/* Price + deadline */}
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-bold text-slate-800">
                                                {o.total_price
                                                    ? `${parseFloat(o.total_price).toFixed(2)} TND`
                                                    : <span className="text-slate-300 text-sm font-normal">TBD</span>}
                                            </p>
                                            {o.deadline && (
                                                <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                                                    📅 {fmt(o.deadline)}
                                                </p>
                                            )}
                                        </div>

                                        <ChevronRight size={16} className="text-slate-300 mt-1 flex-shrink-0" />
                                    </div>

                                    {/* Progress bar — only for non-terminal, non-waiting statuses */}
                                    {!TERMINAL.includes(o.status) && o.status !== 'waiting_restock' && (
                                        <div className="mt-3 flex gap-0.5">
                                            {flow.map((key, idx) => (
                                                <div key={key}
                                                    className={`h-1 flex-1 rounded-full transition-colors
                            ${idx <= flowIdx ? si(key).dot : 'bg-slate-100'}`} />
                                            ))}
                                        </div>
                                    )}

                                    {/* Waiting restock progress bar */}
                                    {o.status === 'waiting_restock' && (
                                        <div className="mt-3 h-1 w-full rounded-full bg-pink-100">
                                            <div className="h-1 w-1/4 rounded-full bg-pink-400 animate-pulse" />
                                        </div>
                                    )}
                                </div>

                                {/* Quick advance button */}
                                {next && !TERMINAL.includes(o.status) && (
                                    <div className="px-4 pb-3">
                                        <button
                                            onClick={e => {
                                                e.stopPropagation()
                                                const next = getNextStatus(o)
                                                if (!next) return
                                                // waiting_restock → ready must go through stock verification
                                                if (o.status === 'waiting_restock' && next === 'ready') {
                                                    setSelected(o)         // open the detail panel
                                                    setError('')
                                                    fetchOrderFinancials(o)
                                                } else {
                                                    handleStatusAdvance(o, next)
                                                }
                                            }}
                                            disabled={saving}
                                            className={`w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border
                ${o.status === 'waiting_restock'
                                                    ? 'bg-pink-50 hover:bg-pink-100 text-pink-700 border-pink-200'
                                                    : 'bg-slate-50 hover:bg-sky-50 hover:text-sky-600 border-slate-200 hover:border-sky-200 text-slate-500'}`}>
                                            <ArrowRight size={13} />
                                            {o.status === 'waiting_restock' ? 'View to restock →' : `Move to ${si(next).label}`}
                                        </button>
                                    </div>
                                )}


                                {/* Paid indicator */}
                                {o.status === 'paid' && (
                                    <div className="px-4 pb-3">
                                        <div className="w-full py-2 rounded-xl text-xs font-semibold text-center bg-emerald-50 text-emerald-600 border border-emerald-200">
                                            ✅ Complete & Paid
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
          NEW ORDER MODAL
      ══════════════════════════════════════════════════════ */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl
            max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">

                        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl sm:rounded-t-2xl z-10">
                            <h2 className="text-lg font-bold text-slate-800">New Order</h2>
                            <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-5 space-y-5">

                            {/* Type selector */}
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { key: 'custom', label: '✏️ Custom', sub: 'Design → Quote → Print' },
                                    { key: 'standard', label: '📦 Standard', sub: 'From stock / catalogue' },
                                ].map(t => (
                                    <button key={t.key}
                                        onClick={() => setForm(f => ({ ...f, type: t.key, status: 'new' }))}
                                        className={`p-3 rounded-xl border-2 text-left transition-all
                      ${form.type === t.key
                                                ? 'border-sky-400 bg-sky-50'
                                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                                        <p className="text-sm font-bold text-slate-800">{t.label}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{t.sub}</p>
                                    </button>
                                ))}
                            </div>

                            {/* ── CLIENT SEARCH + INLINE CREATE ── */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Client *</label>

                                {form.client_id && selectedClient ? (
                                    <div className="flex items-center justify-between bg-sky-50 border-2 border-sky-200 rounded-xl px-3 py-2.5">
                                        <div>
                                            <p className="text-sm font-bold text-sky-800">{selectedClient.name}</p>
                                            {selectedClient.phone && <p className="text-xs text-sky-500">{selectedClient.phone}</p>}
                                        </div>
                                        <button onClick={() => { setForm(f => ({ ...f, client_id: '' })); setClientSearch('') }}
                                            className="p-1 text-sky-400 hover:text-sky-700 rounded-lg">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <input
                                            value={clientSearch}
                                            onChange={e => { setClientSearch(e.target.value); setShowClientDrop(true) }}
                                            onFocus={() => setShowClientDrop(true)}
                                            placeholder="Type to search or create..."
                                            className="w-full border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors" />

                                        {showClientDrop && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                                                <div className="max-h-40 overflow-y-auto">
                                                    {filteredClients.length > 0 ? filteredClients.map(c => (
                                                        <button key={c.id}
                                                            onClick={() => {
                                                                setForm(f => ({ ...f, client_id: c.id }))
                                                                setClientSearch(c.name)
                                                                setShowClientDrop(false)
                                                            }}
                                                            className="w-full text-left px-3 py-2.5 hover:bg-sky-50 border-b border-slate-50 last:border-0 transition-colors">
                                                            <p className="text-sm font-medium text-slate-800">{c.name}</p>
                                                            {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                                                        </button>
                                                    )) : (
                                                        <div className="px-3 py-3 text-sm text-slate-400 text-center">
                                                            {clientSearch ? 'No results' : 'Start typing to search'}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => { setShowNewClient(true); setShowClientDrop(false) }}
                                                    className="w-full text-left px-3 py-2.5 text-sky-600 hover:bg-sky-50 font-semibold text-sm flex items-center gap-2 border-t border-slate-100 transition-colors">
                                                    <UserPlus size={14} />
                                                    {clientSearch ? `Create "${clientSearch}"` : 'Create new client'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Inline client form */}
                                {showNewClient && (
                                    <div className="mt-2 bg-sky-50 border-2 border-sky-200 rounded-xl p-3 space-y-2">
                                        <p className="text-xs font-bold text-sky-700 uppercase tracking-wider">New Client</p>
                                        <input value={newClient.name}
                                            onChange={e => setNewClient(f => ({ ...f, name: e.target.value }))}
                                            placeholder="Full name *"
                                            className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-sky-300" />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input value={newClient.phone}
                                                onChange={e => setNewClient(f => ({ ...f, phone: e.target.value }))}
                                                placeholder="Phone"
                                                className="border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white outline-none" />
                                            <input value={newClient.email}
                                                onChange={e => setNewClient(f => ({ ...f, email: e.target.value }))}
                                                placeholder="Email"
                                                className="border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white outline-none" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowNewClient(false)}
                                                className="flex-1 py-2 text-xs border border-slate-200 bg-white rounded-lg hover:bg-slate-50">
                                                Cancel
                                            </button>
                                            <button onClick={createClientInline}
                                                disabled={savingInline || !newClient.name.trim()}
                                                className="flex-1 py-2 text-xs bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 font-semibold">
                                                {savingInline ? 'Creating...' : '+ Create & Select'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── CUSTOM ORDER FIELDS ── */}
                            {form.type === 'custom' && (
                                <div className="space-y-3">

                                    {/* Product name — was "What do they want?" */}
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                            Product Name *
                                        </label>
                                        <input
                                            value={form.custom_description}
                                            onChange={e => setForm(f => ({ ...f, custom_description: e.target.value }))}
                                            placeholder="e.g. Dragon Keychain, Custom Trophy, Phone Stand..."
                                            className="w-full border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none transition-colors" />
                                        <p className="text-xs text-slate-400 mt-1">
                                            Name of the product you will make — saved to catalogue when order is paid
                                        </p>
                                    </div>

                                    {/* Dimensions */}
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 block mb-1.5">Dimensions</label>
                                        <input
                                            value={form.dimensions}
                                            onChange={e => setForm(f => ({ ...f, dimensions: e.target.value }))}
                                            placeholder="e.g. 10×5×3 cm"
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                    </div>

                                    {/* Price */}
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                            Price (TND)
                                            <span className="text-slate-400 font-normal ml-1">— leave empty if not agreed yet</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={form.total_price}
                                            onChange={e => setForm(f => ({ ...f, total_price: e.target.value }))}
                                            placeholder="TBD"
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                    </div>

                                    {/* Reference / Instructions — now holds the description */}
                                    <div>
                                        <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                            Reference / Instructions
                                        </label>
                                        <textarea
                                            value={form.reference_notes}
                                            onChange={e => setForm(f => ({ ...f, reference_notes: e.target.value }))}
                                            placeholder="What the client wants, color preferences, special requirements, reference links..."
                                            rows={3}
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                                    </div>

                                    {/* Reference image and STL */}
                                    <ImageUpload
                                        folder="orders/images"
                                        value={form.reference_image_url}
                                        onChange={url => setForm(f => ({ ...f, reference_image_url: url }))}
                                        label="Reference Image — photo from client" />

                                    <StlUpload
                                        folder="orders/stl"
                                        value={form.stl_url}
                                        onChange={url => setForm(f => ({ ...f, stl_url: url }))}
                                        label="STL File — optional, add when design is ready" />

                                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                                        <p className="text-xs text-violet-700 font-medium">
                                            🖨️ A print job will be queued automatically · 📦 Product added to catalogue when paid
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* ── STANDARD ORDER ITEMS ── */}
                            {form.type === 'standard' && (
                                <div>
                                    <label className="text-sm font-medium text-slate-700 block mb-2">Items</label>
                                    <div className="space-y-3">
                                        {items.map((item, idx) => (
                                            <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                                                <div className="flex gap-2 items-start">
                                                    <div className="flex-1">
                                                        {/* Catalogue products only — no custom option */}
                                                        <select
                                                            value={item.product_id}
                                                            onChange={e => updateItem(idx, 'product_id', e.target.value)}
                                                            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                                            <option value="">— Select from catalogue —</option>
                                                            {products.map(p => (
                                                                <option key={p.id} value={p.id}>{p.name}</option>
                                                            ))}
                                                        </select>

                                                        {/* Add new product to catalogue inline */}
                                                        <button
                                                            onClick={() => setShowNewProduct(showNewProduct === idx ? null : idx)}
                                                            className="mt-1 text-xs text-sky-500 hover:text-sky-700 flex items-center gap-1">
                                                            <PackagePlus size={11} />
                                                            Product not in catalogue? Add it
                                                        </button>
                                                    </div>

                                                    {items.length > 1 && (
                                                        <button
                                                            onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                                                            className="p-2 text-red-400 hover:bg-red-50 rounded-lg mt-0.5 flex-shrink-0">
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Inline new product form */}
                                                {showNewProduct === idx && (
                                                    <div className="bg-white border-2 border-sky-200 rounded-xl p-3 space-y-2">
                                                        <p className="text-xs font-bold text-sky-700">Add to Catalogue</p>
                                                        <input
                                                            value={newProduct.name}
                                                            onChange={e => setNewProduct(f => ({ ...f, name: e.target.value }))}
                                                            placeholder="Product name *"
                                                            className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <select
                                                                value={newProduct.category}
                                                                onChange={e => setNewProduct(f => ({ ...f, category: e.target.value }))}
                                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none">
                                                                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                                            </select>
                                                            <input
                                                                type="number"
                                                                value={newProduct.selling_price}
                                                                onChange={e => setNewProduct(f => ({ ...f, selling_price: e.target.value }))}
                                                                placeholder="Price (TND)"
                                                                className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none" />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => setShowNewProduct(null)}
                                                                className="flex-1 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => createProductInline(idx)}
                                                                disabled={savingInline || !newProduct.name.trim()}
                                                                className="flex-1 py-1.5 text-xs bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 font-medium">
                                                                {savingInline ? '...' : '+ Add & Select'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-xs text-slate-400 block mb-0.5">Quantity</label>
                                                        <input
                                                            type="number" min="1" value={item.quantity}
                                                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                                                            className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-slate-400 block mb-0.5">Price (TND)</label>
                                                        <input
                                                            type="number" value={item.unit_price}
                                                            onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                                                            placeholder="0.00"
                                                            className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        onClick={() => setItems(p => [...p, { ...emptyItem }])}
                                        className="mt-2 w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-sky-300 hover:text-sky-500 transition-colors">
                                        + Add item
                                    </button>

                                    {items.some(i => i.unit_price && i.product_id) && (
                                        <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-sm font-bold text-emerald-700">
                                            Total: {calcTotal(items).toFixed(2)} TND
                                        </div>
                                    )}

                                    <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mt-2">
                                        <p className="text-xs text-teal-700 font-medium">
                                            📦 Stock will be checked automatically on creation.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Deadline */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Deadline</label>
                                <input type="date" value={form.deadline}
                                    onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                                    className="w-full border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors" />
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">Internal Notes</label>
                                <textarea value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Private notes, reminders..."
                                    rows={2}
                                    className="w-full border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-2.5 text-sm outline-none resize-none transition-colors" />
                            </div>

                            {/* ── BACKDATED ENTRY SECTION ── */}
                            <div className="border-2 border-dashed border-amber-300 rounded-xl overflow-hidden">
                                {/* Toggle header */}
                                <button
                                    type="button"
                                    onClick={() => setForm(f => ({
                                        ...f,
                                        isBackdated: !f.isBackdated,
                                        orderDate: f.isBackdated ? '' : f.orderDate,
                                    }))}
                                    className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors
                                        ${form.isBackdated ? 'bg-amber-50 text-amber-800' : 'bg-white text-slate-500 hover:bg-amber-50 hover:text-amber-700'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span>🕐</span>
                                        <span>Backdated Entry — order happened in the past</span>
                                    </span>
                                    <span className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5
                                        ${form.isBackdated ? 'bg-amber-400' : 'bg-slate-200'}`}>
                                        <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform
                                            ${form.isBackdated ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </span>
                                </button>

                                {/* Expanded — just the date picker */}
                                {form.isBackdated && (
                                    <div className="px-4 pb-4 pt-2 bg-amber-50 space-y-3">
                                        <p className="text-xs text-amber-700 leading-relaxed">
                                            🕐 Sets the order date to a past date. Stock checks, production jobs, and the full status workflow all run <strong>exactly as normal</strong> — only <code className="bg-amber-100 px-1 rounded">created_at</code> is backdated so your financial charts show it in the right week/month.
                                        </p>
                                        <div>
                                            <label className="text-xs font-semibold text-amber-800 block mb-1">Order Date *</label>
                                            <input
                                                type="date"
                                                value={form.orderDate}
                                                max={new Date().toISOString().split('T')[0]}
                                                onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))}
                                                className="w-full border border-amber-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Form error */}
                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-medium">
                                    ⚠️ {error}
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="p-5 pt-0 flex gap-3">
                            <button onClick={closeModal}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={saveOrder}
                                disabled={saving || !form.client_id || (form.type === 'custom' && !form.custom_description?.trim()) || (form.isBackdated && !form.orderDate)}
                                className={`flex-1 py-3 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors
                                    ${form.isBackdated ? 'bg-amber-500 hover:bg-amber-600' : 'bg-sky-500 hover:bg-sky-600'}`}>
                                {saving ? 'Creating...' : form.isBackdated ? '🕐 Create Backdated Order' : 'Create Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
          ORDER DETAIL PANEL
      ══════════════════════════════════════════════════════ */}
            {selected && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl
            max-h-[85vh] sm:max-h-[92vh] overflow-y-auto mb-16 sm:mb-0">

                        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-3xl z-10">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{selected.clients?.name}</h2>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${si(selected.status).color}`}>
                                        {si(selected.status).emoji} {si(selected.status).label}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${selected.type === 'custom' ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-600'}`}>
                                        {selected.type === 'custom' ? '✏️ Custom' : '📦 Standard'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => setDeleting(selected)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                                    <Trash2 size={16} />
                                </button>
                                <button onClick={closeDetail} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="p-5 space-y-4">

                            {/* ── PRIMARY ACTION BUTTON ── */}
                            {(() => {
                                const next = getNextStatus(selected)
                                const nextSI = next ? si(next) : null
                                if (selected.status === 'paid') return (
                                    <div className="w-full py-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold text-sm text-center">
                                        ✅ Order Complete
                                    </div>
                                )
                                if (selected.status === 'cancelled') return (
                                    <div className="w-full py-3.5 bg-red-50 border border-red-200 text-red-600 rounded-xl font-bold text-sm text-center">
                                        ❌ Cancelled
                                    </div>
                                )
                                if (selected.status === 'waiting_restock') return (
                                    <div className="space-y-2">
                                        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3">
                                            <p className="text-sm font-bold text-pink-700">⏸️ Waiting for restock</p>
                                            <p className="text-xs text-pink-500 mt-1">
                                                Go to <strong>Stock</strong> page → add the missing quantity → come back here.
                                            </p>
                                        </div>

                                        {error && (
                                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 whitespace-pre-line font-medium">
                                                ⚠️ {error}
                                                <button onClick={() => setError('')} className="block mt-1 text-red-400 underline">
                                                    Dismiss
                                                </button>
                                            </div>
                                        )}

                                        <button
                                            onClick={fulfillRestockedOrder}
                                            disabled={saving}
                                            className="w-full py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                                            {saving ? 'Checking stock...' : '✅ Stock ready — Mark as Ready'}
                                        </button>
                                    </div>
                                )
                                if (!next) return null
                                return (
                                    <button onClick={() => {
                                        const next = getNextStatus(selected)
                                        if (!next) return
                                        handleStatusAdvance(selected, next)
                                    }} disabled={saving}
                                        className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-sm">
                                        <ArrowRight size={16} /> Mark as {nextSI?.label}
                                    </button>
                                )
                            })()}

                            {/* ── EDIT TOGGLE ── */}
                            {(!TERMINAL.includes(selected.status) || selected.status === 'paid') && !editingOrder && (
                                <button
                                    onClick={() => {
                                        setEditForm({
                                            total_price: selected.total_price || '',
                                            deadline: selected.deadline || '',
                                            notes: selected.notes || '',
                                            custom_description: selected.custom_description || '',
                                            dimensions: selected.dimensions || '',
                                            reference_notes: selected.reference_notes || '',
                                            reference_image_url: selected.reference_image_url || '',
                                            stl_url: selected.stl_url || '',
                                            is_paid: selected.is_paid ?? false,
                                            paid_at: selected.paid_at
                                                ? new Date(selected.paid_at)
                                                    .toISOString()
                                                    .slice(0, 10)
                                                : '',
                                        })
                                        setEditingOrder(true)
                                    }}
                                    className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-sky-300 hover:text-sky-600 text-slate-400 rounded-xl text-sm font-medium transition-all">
                                    ✏️ Edit order details
                                </button>
                            )}

                            {/* ── EDIT FORM ── */}
                            {editingOrder && (
                                <div className="bg-slate-50 border-2 border-sky-200 rounded-2xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-bold text-slate-700">Edit Order</p>
                                        <button onClick={() => setEditingOrder(false)}
                                            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* Price — always editable */}
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 block mb-1">
                                            Price (TND)
                                            {!selected.total_price && (
                                                <span className="ml-2 text-amber-500 font-normal">— not set yet</span>
                                            )}
                                        </label>
                                        <input
                                            type="number"
                                            value={editForm.total_price}
                                            onChange={e => setEditForm(f => ({ ...f, total_price: e.target.value }))}
                                            placeholder="Enter agreed price..."
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                                    </div>

                                    {/* Deadline */}
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 block mb-1">Deadline</label>
                                        <input
                                            type="date"
                                            value={editForm.deadline}
                                            onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                                    </div>
                                    {/* Payment status + date — only relevant for paid or ready-to-pay orders */}
                                    <div className="border-t border-slate-100 pt-3 space-y-3">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                            Payment
                                        </p>

                                        {/* Toggle paid status */}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">Marked as paid</p>
                                                <p className="text-xs text-slate-400">
                                                    Affects revenue in dashboard stats
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setEditForm(f => ({
                                                    ...f,
                                                    is_paid: !f.is_paid,
                                                    // If marking paid now and no date set, default to today
                                                    paid_at: !f.is_paid && !f.paid_at
                                                        ? new Date().toISOString().slice(0, 10)
                                                        : f.paid_at,
                                                }))}
                                                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0
        ${editForm.is_paid ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow
        transition-transform
        ${editForm.is_paid ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>

                                        {/* Payment date — only show when paid */}
                                        {editForm.is_paid && (
                                            <div>
                                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                                    Payment date
                                                    <span className="text-xs text-slate-400 font-normal ml-1">
                                                        — used for revenue stats
                                                    </span>
                                                </label>
                                                <input
                                                    type="date"
                                                    value={editForm.paid_at || ''}
                                                    onChange={e => setEditForm(f => ({ ...f, paid_at: e.target.value }))}
                                                    className="w-full border-2 border-slate-200 focus:border-sky-400
          rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors" />
                                                <p className="text-xs text-slate-400 mt-1">
                                                    This date determines which month the revenue appears in.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    {/* Custom order fields */}
                                    {selected.type === 'custom' && (
                                        <>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-500 block mb-1">Description</label>
                                                <textarea
                                                    value={editForm.custom_description}
                                                    onChange={e => setEditForm(f => ({ ...f, custom_description: e.target.value }))}
                                                    rows={2}
                                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white resize-none" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 block mb-1">Dimensions</label>
                                                    <input
                                                        value={editForm.dimensions}
                                                        onChange={e => setEditForm(f => ({ ...f, dimensions: e.target.value }))}
                                                        placeholder="10×5×3 cm"
                                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-500 block mb-1">Reference</label>
                                                    <input
                                                        value={editForm.reference_notes}
                                                        onChange={e => setEditForm(f => ({ ...f, reference_notes: e.target.value }))}
                                                        placeholder="Color, ref..."
                                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Notes */}
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 block mb-1">Internal Notes</label>
                                        <textarea
                                            value={editForm.notes}
                                            onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                                            rows={2}
                                            placeholder="Internal notes..."
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white resize-none" />
                                    </div>

                                    {selected.type === 'custom' && (
                                        <div className="space-y-3 pt-1">
                                            <ImageUpload
                                                folder="orders/images"
                                                value={editForm.reference_image_url || selected.reference_image_url || ''}
                                                onChange={url => setEditForm(f => ({ ...f, reference_image_url: url }))}
                                                label="Reference Image" />

                                            <StlUpload
                                                folder="orders/stl"
                                                value={editForm.stl_url || selected.stl_url || ''}
                                                onChange={url => setEditForm(f => ({ ...f, stl_url: url }))}
                                                label="STL File" />
                                        </div>
                                    )}

                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => setEditingOrder(false)}
                                            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-white transition-colors">
                                            Cancel
                                        </button>
                                        <button onClick={saveOrderEdit} disabled={savingEdit}
                                            className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                                            {savingEdit ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── PIPELINE STEPPER ── */}
                            <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                    {selected.type === 'custom' ? 'Custom Order Pipeline' : 'Standard Order Pipeline'}
                                </p>
                                <div className="space-y-2">
                                    {getFlow(selected.type).map((key, idx) => {
                                        const currentIdx = getFlow(selected.type).indexOf(selected.status)
                                        const s = si(key)
                                        const isDone = idx < currentIdx
                                        const isCurrent = idx === currentIdx
                                        const isFuture = idx > currentIdx
                                        return (
                                            <div key={key} className="flex items-center gap-3">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors
                          ${isCurrent ? s.dot + ' text-white' : isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                                                    {isDone ? '✓' : isCurrent ? s.emoji : idx + 1}
                                                </div>
                                                <span className={`flex-1 text-sm transition-colors
                          ${isCurrent ? 'font-bold text-slate-800' : isDone ? 'text-slate-400 line-through' : 'text-slate-400'}`}>
                                                    {s.label}
                                                </span>
                                                {isCurrent && (
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>
                                                        Current
                                                    </span>
                                                )}
                                                {isFuture && !TERMINAL.includes(key) && (
                                                    <button onClick={() => handleStatusAdvance(selected, key)} disabled={saving}
                                                        className="text-xs px-2 py-1 bg-white border border-slate-200 text-slate-400 hover:border-sky-300 hover:text-sky-500 rounded-lg transition-colors">
                                                        Set
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Cancel button */}
                                {!TERMINAL.includes(selected.status) && (
                                    <button onClick={() => applyStatusChange(selected, 'cancelled')} disabled={saving}
                                        className="mt-3 w-full py-2 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-200">
                                        ❌ Cancel this order
                                    </button>
                                )}
                            </div>

                            {/* ── ORDER INFO ── */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs text-slate-400 mb-1">Price</p>
                                    <p className="font-bold text-slate-800 text-lg">
                                        {selected.total_price
                                            ? `${parseFloat(selected.total_price).toFixed(2)} TND`
                                            : <span className="text-slate-400 text-sm font-normal">Not set</span>}
                                    </p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs text-slate-400 mb-1">Deadline</p>
                                    <p className={`font-semibold text-sm ${isOverdue(selected) ? 'text-red-500' : 'text-slate-800'}`}>
                                        {selected.deadline ? fmt(selected.deadline) : 'No deadline'}
                                    </p>
                                </div>
                            </div>

                            {/* Custom details */}
                            {selected.type === 'custom' && selected.custom_description && (
                                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                                    <p className="text-xs font-bold text-violet-500 mb-1.5">📋 Request Details</p>
                                    <p className="text-sm text-slate-700">{selected.custom_description}</p>
                                    {selected.dimensions && (
                                        <p className="text-xs text-slate-500 mt-1.5 font-medium">📐 {selected.dimensions}</p>
                                    )}
                                </div>
                            )}

                            {selected.reference_notes && (
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                    <p className="text-xs font-bold text-amber-600 mb-1">🗒️ Reference / Instructions</p>
                                    <p className="text-sm text-slate-700">{selected.reference_notes}</p>
                                </div>
                            )}

                            {/* Reference image */}
                            {selected.reference_image_url && (
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        📸 Client Reference Image
                                    </p>
                                    <div className="rounded-xl overflow-hidden border border-slate-200">
                                        <img
                                            src={selected.reference_image_url}
                                            alt="Reference"
                                            className="w-full max-h-64 object-contain bg-slate-50" />
                                    </div>
                                </div>
                            )}

                            {/* STL file */}
                            {selected.stl_url && (
                                <a href={selected.stl_url} download target="_blank" rel="noreferrer"
                                    className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 hover:bg-violet-100 transition-colors">
                                    <div className="p-2 bg-violet-100 rounded-lg">
                                        <Box size={16} className="text-violet-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-violet-700">STL File</p>
                                        <p className="text-xs text-violet-400">Click to download design file</p>
                                    </div>
                                    <Download size={16} className="text-violet-500 flex-shrink-0" />
                                </a>
                            )}

                            {/* Standard items */}
                            {(selected.order_items || []).length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Items</p>
                                    <div className="space-y-2">
                                        {selected.order_items.map(item => (
                                            <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700">
                                                        {item.products?.name || item.custom_description || 'Item'}
                                                    </p>
                                                    <p className="text-xs text-slate-400">×{item.quantity}</p>
                                                </div>
                                                <p className="text-sm font-bold text-slate-700">
                                                    {item.unit_price
                                                        ? `${(parseFloat(item.unit_price) * parseInt(item.quantity)).toFixed(2)} TND`
                                                        : '—'}
                                                </p>
                                            </div>
                                        ))}
                                        {selected.total_price && (
                                            <div className="flex justify-between px-3 py-2 font-bold text-sm text-slate-800">
                                                <span>Total</span>
                                                <span>{parseFloat(selected.total_price).toFixed(2)} TND</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Notes */}
                            {selected.notes && (
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-xs font-bold text-slate-400 mb-1">Notes</p>
                                    <p className="text-sm text-slate-600">{selected.notes}</p>
                                </div>
                            )}

                            {/* ── ORDER FINANCIALS ── */}
                            <div className="border-t border-slate-100 pt-4 mb-4">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                    💰 Order Financials
                                </p>

                                {loadingFin ? (
                                    <div className="text-xs text-slate-400 text-center py-4 animate-pulse">
                                        Calculating...
                                    </div>

                                ) : !financials || financials.error ? (
                                    <div className="text-xs text-slate-400 text-center py-4">
                                        Could not load financial data.
                                    </div>

                                ) : (
                                    <div className="space-y-2">

                                        {/* Cost breakdown table */}
                                        <div className="bg-slate-50 rounded-xl overflow-hidden">

                                            {/* Revenue row */}
                                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                                                <span className="text-sm font-bold text-slate-700">Revenue</span>
                                                <span className="text-sm font-bold text-slate-800">
                                                    {financials.hasRevenue
                                                        ? `${financials.revenue.toFixed(2)} TND`
                                                        : <span className="text-amber-500 font-normal text-xs">Not set — edit order to add price</span>}
                                                </span>
                                            </div>

                                            {/* Cost lines */}
                                            {financials.costBreakdown.map((line, idx) => (
                                                <div key={idx} className="px-4 py-2.5 border-b border-slate-100 last:border-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-medium text-slate-600">{line.label}</span>
                                                        <span className={`text-xs font-semibold ${line.amount > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                                            {line.amount > 0 ? `− ${line.amount.toFixed(2)} TND` : '—'}
                                                        </span>
                                                    </div>
                                                    {line.sub && (
                                                        <p className="text-xs text-slate-400 mt-0.5">{line.sub}</p>
                                                    )}
                                                </div>
                                            ))}

                                            {/* No cost data hint */}
                                            {!financials.hasCost && (
                                                <div className="px-4 py-3 text-xs text-slate-400">
                                                    {financials.type === 'custom'
                                                        ? '💡 Log the production with filament & time to see costs.'
                                                        : '💡 Set production cost in the Products catalogue to see costs.'}
                                                </div>
                                            )}
                                        </div>

                                        {/* Profit result */}
                                        {financials.hasRevenue && financials.hasCost && (
                                            <div className={`rounded-xl p-4 ${financials.profit >= 0
                                                ? 'bg-emerald-50 border border-emerald-200'
                                                : 'bg-red-50 border border-red-200'
                                                }`}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-xs font-semibold uppercase tracking-wider ${financials.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {financials.profit >= 0 ? '✅ Profit' : '⚠️ Loss'}
                                                    </span>
                                                    <span className={`text-xl font-bold ${financials.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                        {financials.profit >= 0 ? '+' : ''}{financials.profit.toFixed(2)} TND
                                                    </span>
                                                </div>

                                                {financials.margin !== null && (
                                                    <div className="mt-2">
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span className="text-slate-500">Margin</span>
                                                            <span className={`font-bold ${financials.margin >= 40 ? 'text-emerald-600' :
                                                                financials.margin >= 20 ? 'text-amber-600' : 'text-red-500'
                                                                }`}>
                                                                {financials.margin.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${financials.margin >= 40 ? 'bg-emerald-500' :
                                                                    financials.margin >= 20 ? 'bg-amber-400' : 'bg-red-400'
                                                                    }`}
                                                                style={{ width: `${Math.min(Math.max(financials.margin, 0), 100)}%` }} />
                                                        </div>
                                                        <div className="flex justify-between text-xs text-slate-300 mt-0.5">
                                                            <span>0%</span>
                                                            <span>20%</span>
                                                            <span>40%</span>
                                                            <span>100%</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Missing price warning */}
                                        {!financials.hasRevenue && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                                                ⚠️ No price set on this order. Edit the order to add the agreed price and see profitability.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Contact buttons */}
                            {selected.clients?.phone && (
                                <div className="grid grid-cols-2 gap-2">
                                    <a href={`https://wa.me/${selected.clients.phone.replace(/[\s+\-()]/g, '')}`}
                                        target="_blank" rel="noreferrer"
                                        className="flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-colors">
                                        💬 WhatsApp
                                    </a>
                                    <a href={`tel:${selected.clients.phone}`}
                                        className="flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors">
                                        <Phone size={15} /> Call
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── DELETE CONFIRM ── */}
            {deleting && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
                        <h3 className="font-bold text-slate-800 text-lg mb-1">Delete order?</h3>
                        <p className="text-slate-500 text-sm mb-3">
                            Order for <span className="font-semibold">{deleting.clients?.name}</span> will be permanently deleted.
                        </p>

                        {/* Show exactly what will be reversed */}
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-5 space-y-1">
                            <p className="text-xs font-bold text-red-700 mb-1.5">This will also:</p>
                            {deleting.status === 'paid' && (
                                <p className="text-xs text-red-600">💰 Remove from revenue &amp; income stats</p>
                            )}
                            {deleting.type === 'standard' && ['ready', 'delivered', 'paid'].includes(deleting.status) && (
                                <p className="text-xs text-red-600">📦 Restore stock quantities</p>
                            )}
                            {deleting.type === 'custom' && (
                                <p className="text-xs text-red-600">🖨️ Delete linked print job(s)</p>
                            )}
                            {['delivered', 'paid'].includes(deleting.status) && (
                                <p className="text-xs text-red-600">🧴 Restore packaging materials used</p>
                            )}
                            {deleting.type === 'custom' && ['ready', 'delivered', 'paid'].includes(deleting.status) && (
                                <p className="text-xs text-red-600">🧵 Restore filament &amp; BOM materials</p>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setDeleting(null)}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50">
                                Cancel
                            </button>
                            <button onClick={() => deleteOrder(deleting.id)}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════
                CUSTOM ORDER — PRODUCTION DETAILS MODAL
                Shown when moving custom order to "Ready"
            ═══════════════════════════════════════════════════════ */}
            {showProductionModal && pendingReady && (
                <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl
                        max-h-[85vh] sm:max-h-[92vh] flex flex-col mb-16 sm:mb-0">

                        {/* Header */}
                        <div className="flex items-start justify-between p-5 border-b flex-shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">✅ Mark as Ready</h2>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    {pendingReady.clients?.name}
                                    {pendingReady.custom_description &&
                                        <span className="text-slate-400"> — {pendingReady.custom_description}</span>}
                                </p>
                            </div>
                            <button
                                onClick={() => { setShowProductionModal(false); setPendingReady(null) }}
                                className="p-2 hover:bg-slate-100 rounded-xl flex-shrink-0">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-5">

                            {/* Price — required if not set */}
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <label className="text-sm font-bold text-slate-700">
                                        Final Price (TND)
                                    </label>
                                    {!pendingReady.total_price && (
                                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                                            Required
                                        </span>
                                    )}
                                    {pendingReady.total_price && (
                                        <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                                            Already set: {pendingReady.total_price} TND
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    value={productionForm.price}
                                    onChange={e => setProductionForm(f => ({ ...f, price: e.target.value }))}
                                    placeholder={pendingReady.total_price
                                        ? `Current: ${pendingReady.total_price} TND`
                                        : 'Enter the agreed price...'}
                                    className={`w-full border-2 rounded-xl px-3 py-3 text-lg font-bold focus:outline-none transition-colors
                                        ${!pendingReady.total_price && !productionForm.price
                                            ? 'border-red-300 focus:border-red-400 bg-red-50'
                                            : 'border-slate-200 focus:border-sky-400 bg-white'}`} />
                                <p className="text-xs text-slate-400 mt-1">
                                    This is what the client will pay. Leave empty to keep the current price.
                                </p>
                            </div>

                            {/* Divider */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-slate-200" />
                                <span className="text-xs text-slate-400 font-medium">Production details (optional)</span>
                                <div className="flex-1 h-px bg-slate-200" />
                            </div>

                            {/* ── 3MF Import button ── */}
                            <button
                                type="button"
                                onClick={() => setShowOrderImport3mf(true)}
                                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-violet-300 hover:border-violet-400 hover:bg-violet-50 text-violet-600 rounded-xl text-sm font-semibold transition-all">
                                📁 Import from .3mf file
                                <span className="text-xs font-normal text-violet-400 hidden sm:inline">
                                    — auto-fills filament & time
                                </span>
                            </button>

                            {/* Show badge if data was imported */}
                            {productionForm.filament_data?.length > 0 && (
                                <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                                    <div className="flex gap-1">
                                        {productionForm.filament_data
                                            .filter(f => !f.is_support && f.color_hex)
                                            .slice(0, 5)
                                            .map((f, i) => (
                                                <div key={i}
                                                    className="w-4 h-4 rounded-sm border border-white shadow-sm flex-shrink-0"
                                                    style={{ backgroundColor: f.color_hex }} />
                                            ))}
                                    </div>
                                    <span className="text-xs text-violet-700 font-medium flex-1">
                                        {productionForm.filament_data.length} color{productionForm.filament_data.length !== 1 ? 's' : ''} ·{' '}
                                        {productionForm.filament_data.reduce((s, f) => s + f.grams, 0).toFixed(1)}g
                                    </span>
                                    <button
                                        onClick={() => setProductionForm(f => ({ ...f, filament_data: null }))}
                                        className="text-xs text-violet-400 hover:text-red-500 transition-colors">
                                        ✕
                                    </button>
                                </div>
                            )}

                            {/* Filament + Print time — with auto-calculation */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm font-medium text-slate-600 block mb-1.5">
                                        🧵 Filament used (g)
                                    </label>
                                    <input
                                        type="number"
                                        value={productionForm.filament_grams}
                                        onChange={e => {
                                            const val = e.target.value
                                            setProductionForm(prev => {
                                                const grams = parseFloat(val) || 0
                                                const hours = parseFloat(prev.print_time_hours) || 0
                                                const cost = (grams / 1000 * 35) + (hours * 0.15)
                                                return {
                                                    ...prev,
                                                    filament_grams: val,
                                                    actual_cost: cost > 0 ? cost.toFixed(2) : '',
                                                }
                                            })
                                        }}
                                        placeholder="e.g. 85"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-600 block mb-1.5">
                                        ⏱️ Print time (h)
                                    </label>
                                    <input
                                        type="number"
                                        value={productionForm.print_time_hours}
                                        onChange={e => {
                                            const val = e.target.value
                                            setProductionForm(prev => {
                                                const grams = parseFloat(prev.filament_grams) || 0
                                                const hours = parseFloat(val) || 0
                                                const cost = (grams / 1000 * 35) + (hours * 0.15)
                                                return {
                                                    ...prev,
                                                    print_time_hours: val,
                                                    actual_cost: cost > 0 ? cost.toFixed(2) : '',
                                                }
                                            })
                                        }}
                                        placeholder="e.g. 3.5"
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                </div>
                            </div>

                            {/* Auto-calculated cost */}
                            {productionForm.actual_cost && (
                                <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 flex items-center justify-between">
                                    <span className="text-sm text-sky-700 font-medium">
                                        🖨️ Calculated production cost
                                    </span>
                                    <span className="text-base font-bold text-sky-700">
                                        {productionForm.actual_cost} TND
                                    </span>
                                </div>
                            )}

                            {/* Margin preview */}
                            {productionForm.actual_cost && (productionForm.price || pendingReady.total_price) && (() => {
                                const price = parseFloat(productionForm.price) || parseFloat(pendingReady.total_price) || 0
                                const cost = parseFloat(productionForm.actual_cost) || 0
                                const profit = price - cost
                                const margin = price > 0 ? (profit / price * 100) : 0
                                if (price <= 0) return null
                                return (
                                    <div className={`rounded-xl px-4 py-3 flex items-center justify-between
                                        ${profit >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                                        <div>
                                            <p className={`text-xs font-semibold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {profit >= 0 ? '✅ Profitable' : '⚠️ Loss'}
                                            </p>
                                            <p className="text-xs text-slate-400">Based on production cost only</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-base font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                {profit >= 0 ? '+' : ''}{profit.toFixed(2)} TND
                                            </p>
                                            <p className={`text-xs font-semibold ${profit >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                                {margin.toFixed(1)}% margin
                                            </p>
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Form error */}
                            {productionFormError && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-medium">
                                    ⚠️ {productionFormError}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="p-5 border-t bg-white flex-shrink-0 space-y-2 rounded-b-3xl sm:rounded-b-2xl">
                            <button
                                onClick={confirmProductionDetails}
                                disabled={savingProduction}
                                className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm">
                                {savingProduction ? 'Saving...' : '📦 Confirm — Mark as Ready'}
                            </button>
                            <button
                                onClick={() => { setShowProductionModal(false); setPendingReady(null) }}
                                disabled={savingProduction}
                                className="w-full py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors">
                                Cancel
                            </button>
                        </div>
                        {/* 3MF Import modal — triggered from inside production modal */}
                        {showOrderImport3mf && (
                            <Import3mfModal
                                onImport={handleOrderImport3mf}
                                onClose={() => setShowOrderImport3mf(false)} />
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════
                PACKAGING MODAL
            ═══════════════════════════════════════════════════════ */}
            {showPackagingModal && pendingDelivery && (
                <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[92vh] flex flex-col mb-16 sm:mb-0">

                        {/* Header */}
                        <div className="flex items-start justify-between p-5 border-b flex-shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">📦 Delivery Packaging</h2>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Order for <span className="font-semibold text-slate-700">{pendingDelivery.clients?.name}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => { setShowPackagingModal(false); setPendingDelivery(null) }}
                                className="p-2 hover:bg-slate-100 rounded-xl transition-colors flex-shrink-0">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrollable content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">

                            {/* Info banner */}
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-700 leading-relaxed">
                                Select materials used to package this delivery. Selected items will be automatically removed from your stock.
                                Skip if delivering hand-to-hand with no packaging.
                            </div>

                            {/* Materials list */}
                            {loadingPkg ? (
                                <div className="text-center py-10 text-slate-400">Loading materials...</div>
                            ) : packagingMaterials.length === 0 ? (
                                <div className="text-center py-10">
                                    <p className="text-2xl mb-2">📭</p>
                                    <p className="text-slate-500 text-sm font-medium">No materials in stock</p>
                                    <p className="text-slate-400 text-xs mt-1">Add materials in the Materials page first</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {packagingMaterials.map(mat => {
                                        const qty = packagingSelection[mat.id] || 0
                                        const CAT_EMOJI = {
                                            switches: '🔘', chains: '🔗', packaging: '🛍️',
                                            stickers: '🏷️', hardware: '🔩', other: '📦',
                                        }
                                        const isSelected = qty > 0

                                        return (
                                            <div key={mat.id}
                                                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all
                                ${isSelected
                                                        ? 'border-indigo-300 bg-indigo-50'
                                                        : 'border-slate-100 bg-white hover:border-slate-200'}`}>

                                                <span className="text-2xl flex-shrink-0">{CAT_EMOJI[mat.category] || '📦'}</span>

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 leading-tight">{mat.name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-xs text-slate-400">
                                                            {mat.quantity_available} in stock
                                                        </span>
                                                        {mat.cost_per_unit > 0 && (
                                                            <>
                                                                <span className="text-slate-300">·</span>
                                                                <span className="text-xs text-slate-400">
                                                                    {mat.cost_per_unit} TND/{mat.unit}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Quantity control */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => setPackagingSelection(prev => ({
                                                            ...prev,
                                                            [mat.id]: Math.max(0, (prev[mat.id] || 0) - 1),
                                                        }))}
                                                        disabled={qty === 0}
                                                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 font-bold text-slate-600 flex items-center justify-center text-lg transition-colors leading-none">
                                                        −
                                                    </button>

                                                    <span className={`w-8 text-center text-sm font-bold transition-colors
                                  ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`}>
                                                        {qty}
                                                    </span>

                                                    <button
                                                        onClick={() => setPackagingSelection(prev => ({
                                                            ...prev,
                                                            [mat.id]: Math.min(mat.quantity_available, (prev[mat.id] || 0) + 1),
                                                        }))}
                                                        disabled={qty >= mat.quantity_available}
                                                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 disabled:opacity-30 font-bold text-slate-600 flex items-center justify-center text-lg transition-colors leading-none">
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Packaging summary */}
                            {Object.values(packagingSelection).some(q => q > 0) && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">
                                        Summary
                                    </p>
                                    <div className="space-y-1.5">
                                        {Object.entries(packagingSelection)
                                            .filter(([, qty]) => qty > 0)
                                            .map(([matId, qty]) => {
                                                const mat = packagingMaterials.find(m => m.id === matId)
                                                if (!mat) return null
                                                const cost = qty * (mat.cost_per_unit || 0)
                                                return (
                                                    <div key={matId} className="flex items-center justify-between text-xs">
                                                        <span className="text-emerald-700">{mat.name} ×{qty}</span>
                                                        <span className="font-semibold text-emerald-700">
                                                            {cost > 0 ? `${cost.toFixed(2)} TND` : '—'}
                                                        </span>
                                                    </div>
                                                )
                                            })}

                                        {/* Total packaging cost */}
                                        {(() => {
                                            const total = Object.entries(packagingSelection)
                                                .filter(([, qty]) => qty > 0)
                                                .reduce((sum, [matId, qty]) => {
                                                    const mat = packagingMaterials.find(m => m.id === matId)
                                                    return sum + (qty * (mat?.cost_per_unit || 0))
                                                }, 0)
                                            return total > 0 ? (
                                                <div className="flex justify-between text-xs font-bold text-emerald-800 border-t border-emerald-200 pt-2 mt-1">
                                                    <span>Total packaging cost</span>
                                                    <span>{total.toFixed(2)} TND</span>
                                                </div>
                                            ) : null
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="p-5 border-t bg-white flex-shrink-0 space-y-2 rounded-b-3xl sm:rounded-b-2xl">

                            {/* Selected summary */}
                            {Object.values(packagingSelection).some(q => q > 0) ? (
                                <div className="bg-slate-50 rounded-xl px-3 py-2 mb-3">
                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                        <span className="font-medium">Packaging selected:</span>
                                        <span className="font-bold text-slate-700">
                                            {Object.entries(packagingSelection)
                                                .filter(([, q]) => q > 0)
                                                .map(([mid, q]) => {
                                                    const mat = packagingMaterials.find(m => m.id === mid)
                                                    return `${mat?.name} ×${q}`
                                                }).join(' · ')}
                                        </span>
                                    </div>
                                    {(() => {
                                        const total = Object.entries(packagingSelection)
                                            .filter(([, q]) => q > 0)
                                            .reduce((s, [mid, q]) => {
                                                const mat = packagingMaterials.find(m => m.id === mid)
                                                return s + (q * (mat?.cost_per_unit || 0))
                                            }, 0)
                                        return total > 0
                                            ? <p className="text-xs text-indigo-600 font-semibold text-right">
                                                Packaging cost: {total.toFixed(2)} TND
                                            </p>
                                            : null
                                    })()}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 text-center mb-3">
                                    No packaging selected — leave empty for hand-to-hand delivery
                                </p>
                            )}

                            <button
                                onClick={() => confirmDelivery(false)}
                                disabled={confirmingPkg}
                                className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm">
                                {confirmingPkg ? 'Confirming...' : '🚚 Confirm Delivery'}
                            </button>

                            <button
                                onClick={() => { setShowPackagingModal(false); setPendingDelivery(null); setPackagingSelection({}) }}
                                disabled={confirmingPkg}
                                className="w-full py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ══════════════════════════════════════════════════════
          PAYMENT DATE MODAL
      ══════════════════════════════════════════════════════ */}
            {showPaidDateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="font-bold text-slate-800">Confirm Payment Date</h2>
                            <button onClick={() => { setShowPaidDateModal(false); setPendingPaidOrder(null) }} className="p-1 hover:bg-slate-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-slate-600">
                                When was the payment received for this order? This affects your financial dashboard charts.
                            </p>
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Payment Date *</label>
                                <input
                                    type="date"
                                    value={paidDateOverride}
                                    max={new Date().toISOString().split('T')[0]}
                                    onChange={e => setPaidDateOverride(e.target.value)}
                                    className="w-full border-2 border-slate-200 focus:border-sky-400 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
                                />
                            </div>
                        </div>
                        <div className="p-5 pt-0 flex gap-2">
                            <button
                                onClick={() => { setShowPaidDateModal(false); setPendingPaidOrder(null) }}
                                disabled={confirmingPaidDate}
                                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 text-slate-600"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmPaidDate}
                                disabled={confirmingPaidDate || !paidDateOverride}
                                className="flex-[2] py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
                            >
                                {confirmingPaidDate ? 'Saving...' : '💰 Mark as Paid'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}