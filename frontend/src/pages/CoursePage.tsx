import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, isPast, isFuture } from 'date-fns'
import toast from 'react-hot-toast'
import { getCourse, getExercises } from '../api/courses'
import { getMySubmission } from '../api/submissions'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import StatusBadge from '../components/StatusBadge'
import type { Course, Exercise, Submission } from '../types'

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const id = Number(courseId)
  const { user } = useAuth()
  const [course, setCourse] = useState<Course | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [submissions, setSubmissions] = useState<Record<number, Submission | null>>({})

  useEffect(() => {
    getCourse(id).then(setCourse).catch(() => toast.error('Failed to load course'))
    getExercises(id).then(async (exs) => {
      setExercises(exs)
      if (!user?.is_admin) {
        const subs = await Promise.all(exs.map((e) => getMySubmission(e.id).catch(() => null)))
        const map: Record<number, Submission | null> = {}
        exs.forEach((e, i) => { map[e.id] = subs[i] })
        setSubmissions(map)
      }
    }).catch(() => toast.error('Failed to load exercises'))
  }, [id])

  const now = new Date()

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/" className="text-sm text-primary-400/60 hover:text-primary-300 transition-colors">
          ← Dashboard
        </Link>
      </div>

      {course && (
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{course.name}</h1>
            {course.description && <p className="text-slate-400 mt-1 text-sm">{course.description}</p>}
            {user?.is_admin && (
              <p className="mt-2 text-xs text-slate-600 font-mono">
                Enrollment code: <span className="text-slate-400">{course.enrollment_code}</span>
              </p>
            )}
          </div>
          {user?.is_admin && (
            <div className="flex gap-2 shrink-0">
              <Link
                to={`/courses/${id}/grade`}
                className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Grade overview
              </Link>
              <Link
                to={`/courses/${id}/manage`}
                className="px-3 py-2 bg-surface-800 hover:bg-surface-700 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
              >
                Manage
              </Link>
            </div>
          )}
        </div>
      )}

      {exercises.length === 0 && (
        <div className="text-center py-16 text-slate-500">No exercises yet.</div>
      )}

      <div className="space-y-3">
        {exercises.map((ex) => {
          const isLocked = ex.start_date && isFuture(new Date(ex.start_date))
          const sub = submissions[ex.id] ?? null

          return (
            <Link
              key={ex.id}
              to={isLocked && !user?.is_admin ? '#' : `/courses/${id}/exercises/${ex.id}`}
              className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition-all duration-150 ${
                isLocked && !user?.is_admin
                  ? 'bg-surface-900 border-violet-800/20 opacity-60 cursor-not-allowed'
                  : 'bg-surface-900 border-violet-800/30 border-l-2 border-l-fuchsia-500/35 hover:border-primary-400/55 hover:border-l-primary-400/65 hover:bg-surface-800 group'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-slate-100 group-hover:text-primary-400 transition-colors truncate">
                    {ex.title}
                  </h3>
                  {isLocked && (
                    <span className="shrink-0 text-xs text-sky-400/70">
                      🔒 Opens {format(new Date(ex.start_date!), 'MMM d')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  {ex.due_date && (
                    <span className={isPast(new Date(ex.due_date)) ? 'text-red-400' : ''}>
                      Due {format(new Date(ex.due_date), 'MMM d, HH:mm')}
                    </span>
                  )}
                  <span>Allowed: {ex.allowed_extensions}</span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                {!user?.is_admin && <StatusBadge exercise={ex} submission={sub} />}
                {user?.is_admin && (
                  <span className="text-xs text-slate-500">
                    {ex.grade_type === 'pass_fail' ? 'Pass/Fail' : `${ex.grade_min}–${ex.grade_max}`}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </Layout>
  )
}
