import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Productions from './pages/Productions'
import Stock from './pages/Stock'
import Products from './pages/Products'
import Clients from './pages/Clients'
import Expenses from './pages/Expenses'
import Ideas from './pages/Ideas'
import Reseller from './pages/Reseller'

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
          <Route path="products" element={<Products />} />
          <Route path="clients" element={<Clients />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="reseller" element={<Reseller />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}