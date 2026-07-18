import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Imports from './pages/Imports'
import Clients from './pages/Clients'
import Assignments from './pages/Assignments'
import Agents from './pages/Agents'
import Callbacks from './pages/Callbacks'
import MyLeads from './pages/MyLeads'
import Reports from './pages/Reports'
import BatchReports from './pages/BatchReports'
import BatchDetail from './pages/BatchDetail'
import CallHistory from './pages/CallHistory'
import Contacto from './pages/Contacto'
import PlatformTenants from './pages/PlatformTenants'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isAdmin, isLoading } = useAuth()
  if (isLoading) return <div className="flex items-center justify-center h-screen text-gray-500">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function PlatformRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="flex items-center justify-center h-screen text-gray-500">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  const isPlatform = user.isSystemOwner === true || user.isSuperAdmin === true
  if (!isPlatform) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route path="/contacto" element={<Contacto />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="callbacks" element={<Callbacks />} />
          <Route path="calls" element={<CallHistory />} />
          {/* Admin routes */}
          <Route
            path="imports"
            element={
              <ProtectedRoute adminOnly>
                <Imports />
              </ProtectedRoute>
            }
          />
          <Route
            path="clients"
            element={
              <ProtectedRoute adminOnly>
                <Clients />
              </ProtectedRoute>
            }
          />
          <Route
            path="assignments"
            element={
              <ProtectedRoute adminOnly>
                <Assignments />
              </ProtectedRoute>
            }
          />
          <Route
            path="agents"
            element={
              <ProtectedRoute adminOnly>
                <Agents />
              </ProtectedRoute>
            }
          />
          <Route
            path="platform/tenants"
            element={
              <PlatformRoute>
                <PlatformTenants />
              </PlatformRoute>
            }
          />
          {/* Agent routes */}
          <Route path="my-leads" element={<MyLeads />} />
          {/* Admin reports */}
          <Route
            path="reports"
            element={
              <ProtectedRoute adminOnly>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/lotes"
            element={
              <ProtectedRoute adminOnly>
                <BatchReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/lotes/:batchId"
            element={
              <ProtectedRoute adminOnly>
                <BatchDetail />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
