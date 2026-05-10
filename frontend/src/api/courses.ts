import client from './client'
import type { Course, CourseOverview, Exercise, User } from '../types'

export const getCourses = () => client.get<Course[]>('/courses').then((r) => r.data)
export const getCourse = (id: number) => client.get<Course>(`/courses/${id}`).then((r) => r.data)
export const createCourse = (data: { name: string; description?: string }) =>
  client.post<Course>('/courses', data).then((r) => r.data)
export const updateCourse = (id: number, data: Partial<Course>) =>
  client.put<Course>(`/courses/${id}`, data).then((r) => r.data)
export const deleteCourse = (id: number) => client.delete(`/courses/${id}`)
export const regenerateCode = (id: number) =>
  client.post<Course>(`/courses/${id}/regenerate-code`).then((r) => r.data)

export const joinCourse = (enrollment_code: string) =>
  client.post<Course>('/courses/join', { enrollment_code }).then((r) => r.data)

export const getCourseStudents = (courseId: number) =>
  client.get<User[]>(`/courses/${courseId}/students`).then((r) => r.data)
export const addStudent = (courseId: number, github_username: string) =>
  client.post<User>(`/courses/${courseId}/students`, { github_username }).then((r) => r.data)
export const removeStudent = (courseId: number, userId: number) =>
  client.delete(`/courses/${courseId}/students/${userId}`)

export const getExercises = (courseId: number) =>
  client.get<Exercise[]>(`/courses/${courseId}/exercises`).then((r) => r.data)
export const createExercise = (courseId: number, data: Partial<Exercise>) =>
  client.post<Exercise>(`/courses/${courseId}/exercises`, data).then((r) => r.data)
export const updateExercise = (courseId: number, exerciseId: number, data: Partial<Exercise>) =>
  client.put<Exercise>(`/courses/${courseId}/exercises/${exerciseId}`, data).then((r) => r.data)
export const deleteExercise = (courseId: number, exerciseId: number) =>
  client.delete(`/courses/${courseId}/exercises/${exerciseId}`)

export const getCourseOverview = (courseId: number) =>
  client.get<CourseOverview>(`/courses/${courseId}/overview`).then((r) => r.data)
