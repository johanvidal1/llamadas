import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getMe, login as apiLogin, type AuthUser } from '../api/client'
import { clearStoredElevation } from '../lib/adminElevation'

export type User = AuthUser

interface AuthContextValue {
  user: User | null
  isAdmin: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  /** Merge fields into stored user (e.g. after avatar upload). */
  updateUser: (patch: Partial<User>) => void
  /** Refresh profile from /auth/me (avatar flag, name, etc.). */
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function persistUser(next: User | null) {
  if (next) {
    localStorage.setItem('user', JSON.stringify(next))
  } else {
    localStorage.removeItem('user')
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      persistUser(next)
      return next
    })
  }, [])

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const me = await getMe()
      setUser((prev) => {
        const next: User = {
          id: me.id,
          name: me.name,
          email: me.email,
          role: me.role,
          isSuperAdmin: me.isSuperAdmin,
          isSystemOwner: me.isSystemOwner,
          hasAvatar: me.hasAvatar,
          avatarVersion: prev?.avatarVersion,
        }
        persistUser(next)
        return next
      })
    } catch {
      // Keep local session; interceptor handles hard 401
    }
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('user')
    const token = localStorage.getItem('token')
    if (stored && token) {
      try {
        setUser(JSON.parse(stored) as User)
      } catch {
        localStorage.removeItem('user')
        localStorage.removeItem('token')
      }
      void refreshUser()
    }
    setIsLoading(false)
  }, [refreshUser])

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password)
    localStorage.setItem('token', data.token)
    const next = data.user as User
    persistUser(next)
    setUser(next)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    clearStoredElevation()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: user?.role === 'ADMIN',
        isLoading,
        login,
        logout,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
