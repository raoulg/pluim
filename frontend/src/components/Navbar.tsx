import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getAdminTodoCount } from '../api/grades'

export default function Navbar() {
  const { user, logout, isImpersonating, endImpersonation, unviewedGradeCount, firstUnviewedCourseId } = useAuth()
  const nav = useNavigate()
  const [todoCount, setTodoCount] = useState(0)

  useEffect(() => {
    if (!user?.is_admin) return
    getAdminTodoCount().then((d) => setTodoCount(d.count)).catch(() => {})
  }, [user])

  const handleLogout = () => {
    logout()
    nav('/login')
  }

  const handleEndImpersonation = async () => {
    await endImpersonation()
    nav('/')
  }

  return (
    <header className="border-b border-fuchsia-500/25 bg-surface-900/85 backdrop-blur-sm sticky top-0 z-50">
      {isImpersonating && (
        <div className="bg-amber-500/10 border-b border-amber-500/25 px-4 py-1.5 flex items-center justify-between gap-4">
          <span className="text-xs text-amber-300">
            Viewing as student: <strong>{user?.github_username}</strong>
          </span>
          <button
            onClick={handleEndImpersonation}
            className="text-xs text-amber-300 hover:text-amber-100 underline transition-colors"
          >
            End session →
          </button>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <picture>
            <source type="image/webp" srcSet="/icons/logo-64.webp" />
            <img src="/icons/logo-64.png" alt="pluim" className="h-8 w-8" />
          </picture>
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-primary-400 bg-clip-text text-transparent">
            pluim
          </span>
        </Link>
        {user && (
          <div className="flex items-center gap-4">
            {user.is_admin && (
              <Link to="/admin" className="text-sm text-slate-400 hover:text-fuchsia-300 transition-colors">
                Admin
              </Link>
            )}
            {user.is_admin && todoCount > 0 && (
              <Link to="/todo" className="flex items-center gap-1.5 text-sm text-fuchsia-400 hover:text-fuchsia-300 transition-colors">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 text-xs font-bold">
                  {todoCount}
                </span>
                to grade
              </Link>
            )}
            {!user.is_admin && unviewedGradeCount > 0 && (
              <Link to={firstUnviewedCourseId ? `/courses/${firstUnviewedCourseId}` : '/'} className="flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                  {unviewedGradeCount}
                </span>
                new grade{unviewedGradeCount !== 1 ? 's' : ''}
              </Link>
            )}
            <div className="flex items-center gap-2">
              <img src={user.github_avatar_url} alt="" className="w-7 h-7 rounded-full ring-1 ring-primary-500/50" />
              <span className="text-sm text-slate-300">{user.github_username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
