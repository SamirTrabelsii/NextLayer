import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Productions from './pages/Productions'
import Stock from './pages/Stock'
import Materials from './pages/Materials'
import Products from './pages/Products'
import Clients from './pages/Clients'
import Reseller from './pages/Reseller'
import Expenses from './pages/Expenses'
import Ideas from './pages/Ideas'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="productions" element={<Productions />} />
          <Route path="stock" element={<Stock />} />
          <Route path="materials" element={<Materials />} />
          <Route path="products" element={<Products />} />
          <Route path="clients" element={<Clients />} />
          <Route path="reseller" element={<Reseller />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="ideas" element={<Ideas />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}