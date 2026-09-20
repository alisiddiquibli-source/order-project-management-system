import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { CoordinatorDashboardPage } from './pages/CoordinatorDashboardPage'
import { CustomerDashboardPage } from './pages/CustomerDashboardPage'
import { EngineerDashboardPage } from './pages/EngineerDashboardPage'
import { ImportManagerDashboardPage } from './pages/ImportManagerDashboardPage'
import { LoginPage } from './pages/LoginPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OwnerDashboardPage } from './pages/OwnerDashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SalesManagerDashboardPage } from './pages/SalesManagerDashboardPage'
import { SupplierDashboardPage } from './pages/SupplierDashboardPage'
import { UserManagementPage } from './pages/UserManagementPage'

function HomePage() {
  const { user } = useAuth()

  switch (user?.role) {
    case 'company_owner':
      return <OwnerDashboardPage />
    case 'sales_manager':
      return <SalesManagerDashboardPage />
    case 'project_coordinator':
      return <CoordinatorDashboardPage />
    case 'import_manager':
      return <ImportManagerDashboardPage />
    case 'installation_engineer':
      return <EngineerDashboardPage />
    case 'supplier':
      return <SupplierDashboardPage />
    case 'customer':
      return <CustomerDashboardPage />
    default:
      return <ComingSoonPage />
  }
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/** Account administration (§7.1) is Owner-only — matches the backend's own gate. */
function RequireOwner({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user?.role === 'company_owner' ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <ProtectedRoute>
            <OrderDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <ProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <RequireOwner>
              <UserManagementPage />
            </RequireOwner>
          </ProtectedRoute>
        }
      />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
