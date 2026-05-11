import client from './client'
import type { RubricTemplate } from '../types'

export const listRubrics = () =>
  client.get<string[]>('/rubrics').then((r) => r.data)

export const getRubric = (name: string) =>
  client.get<RubricTemplate>(`/rubrics/${name}`).then((r) => r.data)
