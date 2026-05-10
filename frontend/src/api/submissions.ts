import client from './client'
import type { Finalization, MySubmissions, Submission } from '../types'

export const getMySubmission = (exerciseId: number) =>
  client.get<Submission | null>(`/exercises/${exerciseId}/my-submission`).then((r) => r.data)

export const getMySubmissions = (exerciseId: number) =>
  client.get<MySubmissions>(`/exercises/${exerciseId}/my-submissions`).then((r) => r.data)

export const getMyFinalization = (exerciseId: number) =>
  client.get<Finalization | null>(`/exercises/${exerciseId}/my-finalization`).then((r) => r.data)

export const finalizeSubmission = (exerciseId: number) =>
  client.post<Finalization>(`/exercises/${exerciseId}/finalize`).then((r) => r.data)

export const submitUrl = (exerciseId: number, url: string) => {
  const form = new FormData()
  form.append('url', url)
  return client.post<Submission>(`/exercises/${exerciseId}/submit-url`, form).then((r) => r.data)
}

export const submitFile = (exerciseId: number, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return client.post<Submission>(`/exercises/${exerciseId}/submit-file`, form).then((r) => r.data)
}

export const downloadUrl = (exerciseId: number, submissionId: number) =>
  `/api/exercises/${exerciseId}/submissions/${submissionId}/download`
