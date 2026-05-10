import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { getCourseOverview } from '../api/courses'
import { setGrade } from '../api/grades'
import client from '../api/client'
import Layout from '../components/Layout'
import type { CourseOverview, Exercise, Grade, OverviewCell, OverviewRow, Submission, User } from '../types'

export default function GradingPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const cid = Number(courseId)
  const [overview, setOverview] = useState<CourseOverview | null>(null)
  const [editing, setEditing] = useState<{ userId: number; exerciseId: number } | null>(null)
  const [reviewStudent, setReviewStudent] = useState<OverviewRow | null>(null)

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

  const handleDownloadAll = async (exerciseId: number) => {
    try {
      const response = await client.get(`/exercises/${exerciseId}/submissions/download-all`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `exercise_${exerciseId}_submissions.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('No file submissions to download')
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
                  {ex.upload_requirement !== 'none' && (
                    <button
                      onClick={() => handleDownloadAll(ex.id)}
                      className="mt-1 text-xs text-slate-500 hover:text-primary-400 transition-colors flex items-center gap-1"
                      title="Download all submissions as ZIP"
                    >
                      ↓ all submissions
                    </button>
                  )}
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
                    <button
                      onClick={() => setReviewStudent(row)}
                      className="ml-1 text-xs text-slate-600 hover:text-primary-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Quick review"
                    >
                      Review →
                    </button>
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
                            handleGrade(row.student.id, ex.id, value, comment)
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

      {reviewStudent && overview && (
        <ReviewModal
          overview={overview}
          studentRow={reviewStudent}
          courseId={cid}
          onClose={() => setReviewStudent(null)}
          onGradeSaved={async () => { await load() }}
        />
      )}
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

// ── Review Modal ──────────────────────────────────────────────────────────────

function ReviewModal({
  overview,
  studentRow,
  courseId,
  onClose,
  onGradeSaved,
}: {
  overview: CourseOverview
  studentRow: OverviewRow
  courseId: number
  onClose: () => void
  onGradeSaved: () => Promise<void>
}) {
  const [selectedExId, setSelectedExId] = useState(overview.exercises[0]?.id)

  // Always use the freshest version of this student's row from the overview
  const currentRow = overview.rows.find((r) => r.student.id === studentRow.student.id) ?? studentRow
  const selectedEx = overview.exercises.find((e) => e.id === selectedExId)
  const cell = selectedEx ? (currentRow.cells[selectedExId] ?? { submission: null, grade: null }) : null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-4xl h-full bg-surface-900 flex flex-col shadow-2xl border-l border-violet-800/40">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-violet-800/40 shrink-0">
          <img src={currentRow.student.github_avatar_url} alt="" className="w-8 h-8 rounded-full ring-1 ring-primary-500/40" />
          <div>
            <div className="font-semibold text-slate-100">{currentRow.student.github_username}</div>
            <div className="text-xs text-slate-500">Quick review</div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-slate-400 hover:text-slate-200 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Exercise sidebar */}
          <div className="w-52 shrink-0 border-r border-violet-800/40 overflow-y-auto">
            {overview.exercises.map((ex) => {
              const c = currentRow.cells[ex.id] ?? { submission: null, grade: null }
              const hasSubmission = !!c.submission
              const hasGrade = !!c.grade
              return (
                <button
                  key={ex.id}
                  onClick={() => setSelectedExId(ex.id)}
                  className={`w-full text-left px-4 py-3 text-sm border-b border-violet-900/30 transition-colors ${
                    selectedExId === ex.id
                      ? 'bg-primary-900/40 text-slate-100'
                      : 'hover:bg-surface-800 text-slate-300'
                  }`}
                >
                  <div className="font-medium truncate" title={ex.title}>{ex.title}</div>
                  <div className="text-xs mt-0.5">
                    {!hasSubmission ? (
                      <span className="text-slate-600">no submission</span>
                    ) : hasGrade ? (
                      <span className="text-primary-400">{c.grade!.value}</span>
                    ) : (
                      <span className="text-amber-500">submitted · no grade</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Review area */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedEx && cell && (
              <ReviewArea
                key={selectedExId}
                exercise={selectedEx}
                cell={cell}
                student={currentRow.student}
                courseId={courseId}
                onSaved={onGradeSaved}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewArea({
  exercise,
  cell,
  student,
  courseId,
  onSaved,
}: {
  exercise: Exercise
  cell: OverviewCell
  student: User
  courseId: number
  onSaved: () => Promise<void>
}) {
  const { submission, grade } = cell
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [value, setValue] = useState(grade?.value ?? '')
  const [comment, setComment] = useState(grade?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const prevBlobUrl = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current)
      prevBlobUrl.current = null
    }
    setPdfBlobUrl(null)

    if (submission?.submission_type === 'file') {
      setPdfLoading(true)
      client
        .get(`/exercises/${exercise.id}/submissions/${submission.id}/download`, {
          responseType: 'blob',
          signal: controller.signal,
        })
        .then((res) => {
          const blob = new Blob([res.data], {
            type: (res.headers['content-type'] as string) || 'application/octet-stream',
          })
          const url = URL.createObjectURL(blob)
          prevBlobUrl.current = url
          setPdfBlobUrl(url)
        })
        .catch(() => {})
        .finally(() => setPdfLoading(false))
    }

    return () => {
      controller.abort()
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current)
        prevBlobUrl.current = null
      }
    }
  }, [exercise.id, submission?.id])

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await setGrade(courseId, student.id, exercise.id, value.trim(), comment.trim() || undefined)
      toast.success('Grade saved')
      await onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save grade')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Exercise header */}
      <div>
        <h3 className="text-base font-semibold text-slate-100">{exercise.title}</h3>
        <div className="text-xs text-slate-500 mt-0.5">
          {exercise.grade_type === 'pass_fail' ? 'pass / fail' : `Score ${exercise.grade_min}–${exercise.grade_max}`}
          {exercise.due_date && ` · due ${format(new Date(exercise.due_date), 'MMM d, yyyy')}`}
        </div>
      </div>

      {/* Submission */}
      {!submission && (
        <div className="bg-surface-800 border border-violet-900/40 rounded-xl p-4 text-sm text-slate-500">
          No submission for this exercise.
        </div>
      )}

      {submission?.submission_type === 'url' && (
        <div className="bg-surface-800 border border-violet-900/40 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500 uppercase tracking-wide">URL submission</div>
          <a
            href={submission.url!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:text-primary-300 transition-colors text-sm break-all"
          >
            {submission.url}
          </a>
          <div className="text-xs text-slate-600">
            {format(new Date(submission.submitted_at), 'MMM d, yyyy HH:mm')}
            {submission.is_late && <span className="ml-2 text-amber-500">Late</span>}
          </div>
        </div>
      )}

      {submission?.submission_type === 'file' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              {submission.original_filename}
              {submission.is_late && <span className="ml-2 text-amber-500">Late</span>}
            </div>
            <a
              href={`/api/exercises/${exercise.id}/submissions/${submission.id}/download`}
              className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              Download
            </a>
          </div>
          {pdfLoading && (
            <div className="bg-surface-800 border border-violet-900/40 rounded-xl flex items-center justify-center h-64 text-slate-500 text-sm">
              Loading…
            </div>
          )}
          {pdfBlobUrl && (
            <iframe
              src={pdfBlobUrl}
              className="w-full rounded-xl border border-violet-800/40"
              style={{ height: '60vh' }}
              title="Submission preview"
            />
          )}
          {!pdfLoading && !pdfBlobUrl && (
            <div className="bg-surface-800 border border-violet-900/40 rounded-xl flex items-center justify-center h-32 text-slate-500 text-sm">
              Preview not available
            </div>
          )}
        </div>
      )}

      {/* Grade form */}
      <div className="bg-surface-800 border border-violet-800/30 rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">
          {grade ? 'Edit grade' : 'Add grade'}
        </h4>
        {exercise.grade_type === 'pass_fail' ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-surface-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
            className="w-full px-3 py-2 text-sm bg-surface-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        )}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Feedback / comments (optional)"
          rows={3}
          className="w-full px-3 py-2 text-sm bg-surface-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
        />
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="w-full py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
        >
          {saving ? 'Saving…' : 'Save grade'}
        </button>
      </div>
    </div>
  )
}
