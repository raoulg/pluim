import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getMe } from '../api/auth'
import { getUnviewedGradeCount } from '../api/grades'
import type { User } from '../types'

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (token: string) => Promise<void>
  logout: () => void
  endImpersonation: () => Promise<void>
  isImpersonating: boolean
  unviewedGradeCount: number
  refreshUnviewedCount: () => void
}

const Ctx = createContext<AuthCtx>({} as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [unviewedGradeCount, setUnviewedGradeCount] = useState(0)

  const fetchUnviewedCount = (currentUser: User | null) => {
    if (!currentUser || currentUser.is_admin) {
      setUnviewedGradeCount(0)
      return
    }
    getUnviewedGradeCount()
      .then(({ count }) => setUnviewedGradeCount(count))
      .catch(() => {})
  }

  const refreshUnviewedCount = () => fetchUnviewedCount(user)

  useEffect(() => {
    const sessionToken = sessionStorage.getItem('token')
    const token = sessionToken ?? localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    if (sessionToken) setIsImpersonating(true)
    getMe()
      .then((me) => {
        setUser(me)
        fetchUnviewedCount(me)
      })
      .catch(() => {
        sessionStorage.removeItem('token')
        localStorage.removeItem('token')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (token: string) => {
    localStorage.setItem('token', token)
    const me = await getMe()
    setUser(me)
    fetchUnviewedCount(me)
  }

  const logout = () => {
    sessionStorage.removeItem('token')
    localStorage.removeItem('token')
    setUser(null)
    setIsImpersonating(false)
    setUnviewedGradeCount(0)
  }

  const endImpersonation = async () => {
    sessionStorage.removeItem('token')
    setIsImpersonating(false)
    const adminToken = localStorage.getItem('token')
    if (adminToken) {
      const me = await getMe()
      setUser(me)
      setUnviewedGradeCount(0)
    } else {
      setUser(null)
    }
  }

  return (
    <Ctx.Provider value={{ user, loading, login, logout, endImpersonation, isImpersonating, unviewedGradeCount, refreshUnviewedCount }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
