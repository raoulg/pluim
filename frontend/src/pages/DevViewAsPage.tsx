import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'

export default function DevViewAsPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()

  // Set sessionStorage synchronously during render — before AuthContext's useEffect
  // fires — so the auth context picks up the student token, not the admin localStorage token.
  const token = params.get('token')
  const returnTo = params.get('return') ?? '/'
  if (token && !sessionStorage.getItem('token')) {
    sessionStorage.setItem('token', token)
  }

  useEffect(() => {
    if (!token) {
      toast.error('Missing token')
      nav('/login')
      return
    }
    nav(returnTo, { replace: true })
  }, [])

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center">
      <div className="text-slate-400 text-sm animate-pulse">Switching to student view…</div>
    </div>
  )
}
