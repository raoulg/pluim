import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function OAuthCallbackPage() {
  const [params] = useSearchParams()
  const { login } = useAuth()
  const nav = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      toast.error('Authentication failed')
      nav('/login')
      return
    }
    login(token)
      .then(() => nav('/'))
      .catch(() => {
        toast.error('Failed to load user')
        nav('/login')
      })
  }, [])

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center">
      <div className="text-slate-400 text-sm animate-pulse">Signing you in…</div>
    </div>
  )
}
