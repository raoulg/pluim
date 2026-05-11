import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'
import {
  getCourse,
  getExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  getCourseStudents,
  addStudent,
  removeStudent,
  regenerateCode,
  updateCourse,
} from '../api/courses'
import { listRubrics, getRubric } from '../api/rubrics'
import Layout from '../components/Layout'
import type { Course, Exercise, User } from '../types'

const INPUT =
  'w-full px-3 py-2 bg-surface-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

const toLocalISOString = (dt: string | null) => {
  if (!dt) return ''
  const d = new Date(dt)
  const offsetMs = d.getTimezoneOffset() * 60 * 1000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16)
}

const emptyExercise = (): Partial<Exercise> => ({
  title: '',
  description: '',
  start_date: null,
  due_date: null,
  allowed_extensions: 'pdf',
  allow_late_upload: true,
  grade_type: 'numeric',
  grade_min: 0,
  grade_max: 10,
  rubric_description: '',
  rubric_template: null,
  order_index: 0,
  upload_requirement: 'optional',
  url_requirement: 'optional',
})

export default function CourseManagePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const cid = Number(courseId)

  const [course, setCourse] = useState<Course | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [students, setStudents] = useState<User[]>([])
  const [tab, setTab] = useState<'exercises' | 'students' | 'settings'>('exercises')

  const [editingEx, setEditingEx] = useState<Partial<Exercise> | null>(null)
  const [editingExId, setEditingExId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const [studentUsername, setStudentUsername] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)

  const loadAll = async () => {
    const [c, exs, sts] = await Promise.all([
      getCourse(cid),
      getExercises(cid),
      getCourseStudents(cid),
    ])
    setCourse(c)
    setExercises(exs)
    setStudents(sts)
  }

  useEffect(() => { loadAll().catch(() => toast.error('Failed to load')) }, [cid])

  const startNew = () => {
    setEditingEx(emptyExercise())
    setEditingExId(null)
  }

  const startEdit = (ex: Exercise) => {
    setEditingEx({ ...ex })
    setEditingExId(ex.id)
  }

  const handleSaveExercise = async () => {
    if (!editingEx?.title?.trim()) { toast.error('Title required'); return }
    setSaving(true)
    try {
      if (editingExId) {
        const updated = await updateExercise(cid, editingExId, editingEx)
        setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        toast.success('Exercise updated')
      } else {
        const created = await createExercise(cid, editingEx)
        setExercises((prev) => [...prev, created])
        toast.success('Exercise created')
      }
      setEditingEx(null)
      setEditingExId(null)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExercise = async (ex: Exercise) => {
    if (!confirm(`Delete "${ex.title}"?`)) return
    try {
      await deleteExercise(cid, ex.id)
      setExercises((prev) => prev.filter((e) => e.id !== ex.id))
      toast.success('Deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentUsername.trim()) return
    setAddingStudent(true)
    try {
      const student = await addStudent(cid, studentUsername.trim())
      setStudents((prev) => [...prev, student])
      setStudentUsername('')
      toast.success('Student added')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to add student')
    } finally {
      setAddingStudent(false)
    }
  }

  const handleRemoveStudent = async (u: User) => {
    if (!confirm(`Remove ${u.github_username}?`)) return
    try {
      await removeStudent(cid, u.id)
      setStudents((prev) => prev.filter((s) => s.id !== u.id))
      toast.success('Removed')
    } catch {
      toast.error('Failed to remove')
    }
  }

  const handleRegenCode = async () => {
    if (!confirm('Regenerate enrollment code? Old code stops working.')) return
    try {
      const updated = await regenerateCode(cid)
      setCourse(updated)
      toast.success('Code regenerated')
    } catch {
      toast.error('Failed')
    }
  }

  const set = (field: keyof Exercise, value: any) =>
    setEditingEx((prev) => ({ ...prev, [field]: value }))

  return (
    <Layout>
      <div className="mb-4 flex items-center gap-3">
        <Link to={`/courses/${cid}`} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
          ← {course?.name ?? 'Course'}
        </Link>
        <span className="text-slate-700">|</span>
        <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
          Admin
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-100 mb-6">Manage: {course?.name}</h1>

      <div className="flex gap-1 mb-6 bg-surface-900 border border-slate-700/60 rounded-xl p-1 w-fit">
        {(['exercises', 'students', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg capitalize transition-colors ${
              tab === t ? 'bg-surface-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Exercises ── */}
      {tab === 'exercises' && (
        <div>
          {editingEx ? (
            <ExerciseForm
              data={editingEx}
              set={set}
              onSave={handleSaveExercise}
              onCancel={() => { setEditingEx(null); setEditingExId(null) }}
              saving={saving}
              isNew={!editingExId}
            />
          ) : (
            <>
              <button
                onClick={startNew}
                className="mb-4 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                + New exercise
              </button>
              <div className="space-y-2">
                {exercises.map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between gap-4 bg-surface-900 border border-slate-700/60 rounded-xl px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-100">{ex.title}</span>
                        <span className="text-xs text-slate-500">
                          {ex.grade_type === 'pass_fail' ? 'pass/fail' : `${ex.grade_min}–${ex.grade_max}`}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-slate-600 mt-0.5">
                        {ex.start_date && <span>Opens {format(new Date(ex.start_date), 'MMM d')}</span>}
                        {ex.due_date && <span>Due {format(new Date(ex.due_date), 'MMM d')}</span>}
                        <span>{ex.allowed_extensions}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(ex)}
                        className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteExercise(ex)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded border border-red-900/40 hover:border-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {exercises.length === 0 && (
                  <div className="text-center py-12 text-slate-500">No exercises yet.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Students ── */}
      {tab === 'students' && (
        <div className="space-y-4">
          <form onSubmit={handleAddStudent} className="flex gap-2 max-w-sm">
            <input
              value={studentUsername}
              onChange={(e) => setStudentUsername(e.target.value)}
              placeholder="GitHub username"
              className={INPUT + ' flex-1'}
            />
            <button
              type="submit"
              disabled={addingStudent}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </form>
          <div className="space-y-2">
            {students.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 bg-surface-900 border border-slate-700/60 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <img src={s.github_avatar_url} alt="" className="w-7 h-7 rounded-full" />
                  <span className="text-slate-200">{s.github_username}</span>
                </div>
                <button
                  onClick={() => handleRemoveStudent(s)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
            {students.length === 0 && (
              <div className="text-center py-12 text-slate-500">No students enrolled.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Settings ── */}
      {tab === 'settings' && course && (
        <div className="bg-surface-900 border border-slate-700/60 rounded-xl p-5 max-w-md space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Enrollment code</label>
            <div className="flex gap-2 items-center">
              <span className="font-mono text-slate-200 bg-surface-800 px-3 py-2 rounded-lg text-sm">{course.enrollment_code}</span>
              <button
                onClick={handleRegenCode}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded border border-slate-700"
              >
                Regenerate
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Grade link</label>
            <Link to={`/courses/${cid}/grade`} className="text-sm text-primary-400 hover:text-primary-300">
              Open grading overview →
            </Link>
          </div>
        </div>
      )}
    </Layout>
  )
}

function ExerciseForm({
  data,
  set,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  data: Partial<Exercise>
  set: (field: keyof Exercise, value: any) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew: boolean
}) {
  const [rubricList, setRubricList] = useState<string[]>([])
  const [selectedRubric, setSelectedRubric] = useState('')
  const [loadingRubric, setLoadingRubric] = useState(false)

  useEffect(() => {
    listRubrics().then(setRubricList).catch(() => {})
  }, [])

  const handleLoadRubric = async () => {
    if (!selectedRubric) return
    setLoadingRubric(true)
    try {
      const rubric = await getRubric(selectedRubric)
      set('rubric_template', JSON.stringify(rubric, null, 2))
    } catch {
      toast.error('Failed to load rubric')
    } finally {
      setLoadingRubric(false)
    }
  }

  return (
    <div className="bg-surface-900 border border-slate-700/60 rounded-xl p-6 space-y-4 max-w-2xl" data-color-mode="dark">
      <h2 className="font-semibold text-slate-100">{isNew ? 'New exercise' : 'Edit exercise'}</h2>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Title *</label>
        <input value={data.title ?? ''} onChange={(e) => set('title', e.target.value)} className={INPUT} placeholder="Exercise 1" />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-2">Description (Markdown)</label>
        <MDEditor
          value={data.description ?? ''}
          onChange={(v) => set('description', v ?? '')}
          preview="edit"
          height={220}
          className="!bg-surface-800"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Start date (optional)</label>
          <input
            type="datetime-local"
            value={data.start_date ? toLocalISOString(data.start_date) : ''}
            onChange={(e) => set('start_date', e.target.value ? new Date(e.target.value).toISOString() : null)}
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Due date (optional)</label>
          <input
            type="datetime-local"
            value={data.due_date ? toLocalISOString(data.due_date) : ''}
            onChange={(e) => set('due_date', e.target.value ? new Date(e.target.value).toISOString() : null)}
            className={INPUT}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Allowed extensions (comma-separated)</label>
          <input
            value={data.allowed_extensions ?? 'pdf'}
            onChange={(e) => set('allowed_extensions', e.target.value)}
            placeholder="pdf,py,ipynb"
            className={INPUT}
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id="lateUpload"
            checked={data.allow_late_upload ?? true}
            onChange={(e) => set('allow_late_upload', e.target.checked)}
            className="rounded"
          />
          <label htmlFor="lateUpload" className="text-sm text-slate-300">Allow late uploads</label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">File upload</label>
          <select
            value={data.upload_requirement ?? 'optional'}
            onChange={(e) => set('upload_requirement', e.target.value)}
            className={INPUT}
          >
            <option value="mandatory">Mandatory</option>
            <option value="optional">Optional</option>
            <option value="none">Disabled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">URL submission</label>
          <select
            value={data.url_requirement ?? 'optional'}
            onChange={(e) => set('url_requirement', e.target.value)}
            className={INPUT}
          >
            <option value="mandatory">Mandatory</option>
            <option value="optional">Optional</option>
            <option value="none">Disabled</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Grade type</label>
        <select
          value={data.grade_type ?? 'numeric'}
          onChange={(e) => set('grade_type', e.target.value)}
          className={INPUT}
        >
          <option value="numeric">Numeric</option>
          <option value="pass_fail">Pass / Fail</option>
        </select>
      </div>

      {data.grade_type === 'numeric' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Min score</label>
            <input
              type="number"
              value={data.grade_min ?? 0}
              onChange={(e) => set('grade_min', parseFloat(e.target.value))}
              step="0.5"
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Max score</label>
            <input
              type="number"
              value={data.grade_max ?? 10}
              onChange={(e) => set('grade_max', parseFloat(e.target.value))}
              step="0.5"
              className={INPUT}
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-400 mb-2">Rubric / grading criteria (Markdown, optional)</label>
        <MDEditor
          value={data.rubric_description ?? ''}
          onChange={(v) => set('rubric_description', v ?? '')}
          preview="edit"
          height={160}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs text-slate-400">Structured rubric template (JSON, optional)</label>
          {data.rubric_template && (
            <button
              type="button"
              onClick={() => set('rubric_template', null)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {rubricList.length > 0 && (
          <div className="flex gap-2 mb-2">
            <select
              value={selectedRubric}
              onChange={(e) => setSelectedRubric(e.target.value)}
              className={INPUT + ' flex-1 text-xs py-1'}
            >
              <option value="">Select a rubric…</option>
              {rubricList.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleLoadRubric}
              disabled={!selectedRubric || loadingRubric}
              className="px-3 py-1 text-xs bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded transition-colors"
            >
              {loadingRubric ? 'Loading…' : 'Load'}
            </button>
          </div>
        )}
        <textarea
          value={data.rubric_template ?? ''}
          onChange={(e) => set('rubric_template', e.target.value || null)}
          placeholder="Paste JSON rubric template here, or use the DAV preset above…"
          rows={6}
          className={INPUT + ' font-mono text-xs resize-y'}
        />
        {data.rubric_template && (() => {
          try {
            const t = JSON.parse(data.rubric_template)
            return (
              <div className="mt-1 text-xs text-emerald-500">
                {t.criteria?.length ?? 0} criteria · verslag {(t.verslag_weight ?? 0.7) * 100}% / code {(t.code_weight ?? 0.3) * 100}%
              </div>
            )
          } catch {
            return <div className="mt-1 text-xs text-red-400">Invalid JSON</div>
          }
        })()}
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Order index</label>
        <input
          type="number"
          value={data.order_index ?? 0}
          onChange={(e) => set('order_index', parseInt(e.target.value))}
          className={INPUT + ' w-24'}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : isNew ? 'Create exercise' : 'Save changes'}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 bg-surface-800 hover:bg-surface-700 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
