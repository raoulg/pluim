import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getMe } from '../api/auth'
import type { User } from '../types'

interface AuthCtx {
  user: User | null
  loading: boolean
  login: (token: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx>({} as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    getMe()
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  const login = async (token: string) => {
    localStorage.setItem('token', token)
    const me = await getMe()
    setUser(me)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
