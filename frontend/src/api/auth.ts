import client from './client'
import type { User } from '../types'

export const getMe = () => client.get<User>('/auth/me').then((r) => r.data)
export const getConfig = () => client.get<{ dev_mode: boolean }>('/auth/config').then((r) => r.data)
export const devLogin = () =>
  client.post<{ access_token: string }>('/auth/dev-login').then((r) => r.data.access_token)
export const devLoginUser = () =>
  client.post<{ access_token: string }>('/auth/dev-login-user').then((r) => r.data.access_token)
