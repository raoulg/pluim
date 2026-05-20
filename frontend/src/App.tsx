import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import OAuthCallbackPage from './pages/OAuthCallbackPage'
import DashboardPage from './pages/DashboardPage'
import CoursePage from './pages/CoursePage'
import ExercisePage from './pages/ExercisePage'
import GradingPage from './pages/GradingPage'
import AdminPage from './pages/AdminPage'
import CourseManagePage from './pages/CourseManagePage'
import DevViewAsPage from './pages/DevViewAsPage'
import TodoPage from './pages/TodoPage'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-surface-950 flex items-center justify-center text-slate-500 text-sm animate-pulse">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user?.is_admin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route path="/dev-view-as" element={<DevViewAsPage />} />
      <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/courses/:courseId" element={<RequireAuth><CoursePage /></RequireAuth>} />
      <Route path="/courses/:courseId/exercises/:exerciseId" element={<RequireAuth><ExercisePage /></RequireAuth>} />
      <Route path="/courses/:courseId/grade" element={<RequireAdmin><GradingPage /></RequireAdmin>} />
      <Route path="/courses/:courseId/manage" element={<RequireAdmin><CourseManagePage /></RequireAdmin>} />
      <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
      <Route path="/todo" element={<RequireAdmin><TodoPage /></RequireAdmin>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
