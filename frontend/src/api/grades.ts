import client from './client'
import type { Grade } from '../types'

export const getMyGrade = (exerciseId: number) =>
  client.get<Grade | null>(`/exercises/${exerciseId}/grades/me`).then((r) => r.data)

export const setGrade = (courseId: number, studentId: number, exerciseId: number, value: string, comment?: string) =>
  client
    .put<Grade>(`/courses/${courseId}/students/${studentId}/exercises/${exerciseId}/grade`, { value, comment })
    .then((r) => r.data)

export const deleteGrade = (courseId: number, studentId: number, exerciseId: number) =>
  client.delete(`/courses/${courseId}/students/${studentId}/exercises/${exerciseId}/grade`)
