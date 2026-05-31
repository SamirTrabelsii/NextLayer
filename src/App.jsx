import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
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
import Settings from './pages/Settings'
import UserManagement from './pages/UserManagement'
import Filaments from './pages/Filaments'
import Analytics from './pages/Analytics'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected */}
        <Route path="/" element={
          <ProtectedRoute allowedRoles={['admin', 'reseller']}>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* Both roles */}
          <Route path="dashboard" element={
            <ProtectedRoute allowedRoles={['admin', 'reseller']}>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="reseller" element={
            <ProtectedRoute allowedRoles={['admin', 'reseller']}>
              <Reseller />
            </ProtectedRoute>
          } />

          {/* Admin only */}
          {[
            { path: 'orders', el: <Orders /> },
            { path: 'productions', el: <Productions /> },
            { path: 'stock', el: <Stock /> },
            { path: 'materials', el: <Materials /> },
            { path: 'filaments', el: <Filaments /> },
            { path: 'products', el: <Products /> },
            { path: 'clients', el: <Clients /> },
            { path: 'expenses', el: <Expenses /> },
            { path: 'ideas', el: <Ideas /> },
            { path: 'settings', el: <Settings /> },
            { path: 'users', el: <UserManagement /> },
            { path: 'analytics', el: <Analytics /> },
          ].map(({ path, el }) => (
            <Route key={path} path={path} element={
              <ProtectedRoute allowedRoles={['admin']}>
                {el}
              </ProtectedRoute>
            } />
          ))}
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}