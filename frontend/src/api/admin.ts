import client from './client'
import type { User } from '../types'

export const getUsers = () => client.get<User[]>('/admin/users').then((r) => r.data)
export const updateUser = (userId: number, is_admin: boolean) =>
  client.put<User>(`/admin/users/${userId}`, { is_admin }).then((r) => r.data)
