import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { getCourseOverview } from '../api/courses'
import { setGrade } from '../api/grades'
import Layout from '../components/Layout'
import type { CourseOverview, Exercise, Grade, OverviewCell } from '../types'

export default function GradingPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const cid = Number(courseId)
  const [overview, setOverview] = useState<CourseOverview | null>(null)
  const [editing, setEditing] = useState<{ userId: number; exerciseId: number } | null>(null)

  const load = () =>
    getCourseOverview(cid)
      .then(setOverview)
      .catch(() => toast.error('Failed to load overview'))

  useEffect(() => { load() }, [cid])

  const handleGrade = async (
    userId: number,
    exerciseId: number,
    value: string,
    comment: string,
    exercise: Exercise
  ) => {
    if (!value.trim()) return
    try {
      await setGrade(cid, userId, exerciseId, value.trim(), comment.trim() || undefined)
      toast.success('Grade saved')
      setEditing(null)
      await load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save grade')
    }
  }

  if (!overview) {
    return (
      <Layout>
        <div className="animate-pulse text-slate-500">Loading overview…</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-4">
        <Link to={`/courses/${cid}`} className="text-sm text-primary-400/60 hover:text-primary-300 transition-colors">
          ← {overview.course.name}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold bg-gradient-to-r from-fuchsia-200 to-primary-300 bg-clip-text text-transparent">Grade Overview</h1>
        <span className="text-sm text-slate-500">
          {overview.rows.length} student{overview.rows.length !== 1 ? 's' : ''} · {overview.exercises.length} exercise{overview.exercises.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface-950 z-10 text-left px-3 py-2 text-slate-400 font-medium border-b border-violet-800/40 min-w-40">
                Student
              </th>
              {overview.exercises.map((ex) => (
                <th
                  key={ex.id}
                  className="px-3 py-2 text-left text-slate-400 font-medium border-b border-violet-800/40 min-w-40 max-w-48"
                >
                  <div className="truncate" title={ex.title}>{ex.title}</div>
                  <div className="text-xs text-slate-600 font-normal mt-0.5">
                    {ex.grade_type === 'pass_fail' ? 'pass/fail' : `${ex.grade_min}–${ex.grade_max}`}
                    {ex.due_date && ` · ${format(new Date(ex.due_date), 'MMM d')}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overview.rows.map((row) => (
              <tr key={row.student.id} className="group">
                <td className="sticky left-0 bg-surface-950 z-10 px-3 py-2 border-b border-violet-900/50 group-hover:bg-surface-900">
                  <div className="flex items-center gap-2">
                    <img
                      src={row.student.github_avatar_url}
                      alt=""
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-slate-200 font-medium">{row.student.github_username}</span>
                  </div>
                </td>
                {overview.exercises.map((ex) => {
                  const cell = row.cells[ex.id] ?? { submission: null, grade: null }
                  const isEdit = editing?.userId === row.student.id && editing?.exerciseId === ex.id
                  return (
                    <td
                      key={ex.id}
                      className="px-3 py-2 border-b border-violet-900/50 group-hover:bg-surface-900/50"
                    >
                      {isEdit ? (
                        <GradeForm
                          exercise={ex}
                          currentGrade={cell.grade}
                          onSubmit={(value, comment) =>
                            handleGrade(row.student.id, ex.id, value, comment, ex)
                          }
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <CellView
                          cell={cell}
                          exercise={ex}
                          onEdit={() => setEditing({ userId: row.student.id, exerciseId: ex.id })}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}

function CellView({
  cell,
  exercise,
  onEdit,
}: {
  cell: OverviewCell
  exercise: Exercise
  onEdit: () => void
}) {
  const { submission, grade } = cell

  const statusColor = () => {
    if (!submission) return 'bg-slate-800 text-slate-500'
    if (submission.is_late) return 'bg-amber-900/30 text-amber-400'
    return 'bg-emerald-900/30 text-emerald-400'
  }

  return (
    <div className="space-y-1">
      {/* submission status */}
      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${statusColor()}`}>
        {!submission
          ? '—'
          : submission.submission_type === 'file'
          ? (
            <a
              href={`/api/exercises/${exercise.id}/submissions/${submission.id}/download`}
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {submission.original_filename ?? 'file'}
            </a>
          )
          : (
            <a
              href={submission.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              url
            </a>
          )}
      </div>

      {/* grade */}
      <div>
        {grade ? (
          <button
            onClick={onEdit}
            className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors"
            title={grade.comment ?? undefined}
          >
            {grade.value} ✎
          </button>
        ) : (
          <button
            onClick={onEdit}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            + grade
          </button>
        )}
      </div>
    </div>
  )
}

function GradeForm({
  exercise,
  currentGrade,
  onSubmit,
  onCancel,
}: {
  exercise: Exercise
  currentGrade: Grade | null
  onSubmit: (value: string, comment: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(currentGrade?.value ?? '')
  const [comment, setComment] = useState(currentGrade?.comment ?? '')

  return (
    <div className="space-y-1 w-36">
      {exercise.grade_type === 'pass_fail' ? (
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-2 py-1 text-xs bg-surface-800 border border-slate-600 rounded text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
          autoFocus
        >
          <option value="">Select…</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      ) : (
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${exercise.grade_min}–${exercise.grade_max}`}
          step="0.1"
          min={exercise.grade_min ?? undefined}
          max={exercise.grade_max ?? undefined}
          className="w-full px-2 py-1 text-xs bg-surface-800 border border-slate-600 rounded text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
          autoFocus
        />
      )}
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comment (optional)"
        className="w-full px-2 py-1 text-xs bg-surface-800 border border-slate-600 rounded text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <div className="flex gap-1">
        <button
          onClick={() => onSubmit(value, comment)}
          className="flex-1 px-2 py-1 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-xs bg-surface-700 hover:bg-surface-600 text-slate-300 rounded transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
