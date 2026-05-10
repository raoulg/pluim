export interface User {
  id: number
  github_id: number
  github_username: string
  github_avatar_url: string
  github_email: string | null
  is_admin: boolean
  created_at: string
}

export interface Course {
  id: number
  name: string
  description: string | null
  enrollment_code: string
  is_archived: boolean
  created_at: string
}

export type SubmissionRequirement = 'mandatory' | 'optional' | 'none'

export interface Exercise {
  id: number
  course_id: number
  title: string
  description: string
  start_date: string | null
  due_date: string | null
  allowed_extensions: string
  allow_late_upload: boolean
  grade_type: 'numeric' | 'pass_fail'
  grade_min: number | null
  grade_max: number | null
  rubric_description: string | null
  order_index: number
  upload_requirement: SubmissionRequirement
  url_requirement: SubmissionRequirement
  created_at: string
  updated_at: string
}

export interface Submission {
  id: number
  user_id: number
  exercise_id: number
  submission_type: 'file' | 'url'
  original_filename: string | null
  url: string | null
  submitted_at: string
  is_late: boolean
}

export interface Grade {
  id: number
  user_id: number
  exercise_id: number
  value: string
  comment: string | null
  graded_by: User
  viewed_at: string | null
  created_at: string
  updated_at: string
}

export interface MySubmissions {
  file: Submission | null
  url: Submission | null
}

export interface Finalization {
  id: number
  user_id: number
  exercise_id: number
  finalized_at: string
}

export interface OverviewCell {
  submission: Submission | null
  grade: Grade | null
}

export interface OverviewRow {
  student: User
  cells: Record<number, OverviewCell>
}

export interface CourseOverview {
  course: Course
  exercises: Exercise[]
  rows: OverviewRow[]
}
