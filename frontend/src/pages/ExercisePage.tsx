import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, isPast } from 'date-fns'
import toast from 'react-hot-toast'
import { getExercises } from '../api/courses'
import {
  getMySubmissions,
  getMyFinalization,
  finalizeSubmission,
  submitFile,
  submitUrl,
  downloadUrl,
} from '../api/submissions'
import { getMyGrade, markGradeViewed, addStudentFeedback } from '../api/grades'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import MarkdownRenderer from '../components/MarkdownRenderer'
import StatusBadge from '../components/StatusBadge'
import type { Exercise, Feedback, Finalization, Grade, Submission } from '../types'

export default function ExercisePage() {
  const { courseId, exerciseId } = useParams<{ courseId: string; exerciseId: string }>()
  const cid = Number(courseId)
  const eid = Number(exerciseId)
  const { user, refreshUnviewedCount } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [fileSubmission, setFileSubmission] = useState<Submission | null>(null)
  const [urlSubmission, setUrlSubmission] = useState<Submission | null>(null)
  const [finalization, setFinalization] = useState<Finalization | null>(null)
  const [grade, setGrade] = useState<Grade | null>(null)
  const [remarkText, setRemarkText] = useState('')
  const [addingRemark, setAddingRemark] = useState(false)
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [handInAttempted, setHandInAttempted] = useState(false)

  useEffect(() => {
    getExercises(cid)
      .then((exs) => {
        const ex = exs.find((e) => e.id === eid)
        if (ex) setExercise(ex)
      })
      .catch(() => toast.error('Failed to load exercise'))

    getMySubmissions(eid)
      .then((s) => {
        setFileSubmission(s.file)
        setUrlSubmission(s.url)
      })
      .catch(() => null)

    getMyFinalization(eid).then(setFinalization).catch(() => null)
    getMyGrade(eid).then((g) => {
      setGrade(g)
      if (g) {
        markGradeViewed(eid).then(() => refreshUnviewedCount())
      }
    }).catch(() => null)
  }, [cid, eid])

  const canSubmit = () => {
    if (!exercise) return false
    const now = new Date()
    if (exercise.start_date && new Date(exercise.start_date) > now) return false
    if (exercise.due_date && !exercise.allow_late_upload && isPast(new Date(exercise.due_date))) return false
    return true
  }

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setSubmitting(true)
    try {
      const sub = await submitFile(eid, file)
      setFileSubmission(sub)
      setHandInAttempted(false)
      toast.success('File uploaded!')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    try {
      const sub = await submitUrl(eid, url.trim())
      setUrlSubmission(sub)
      setHandInAttempted(false)
      toast.success('URL submitted!')
      setUrl('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleHandIn = async () => {
    if (!exercise) return
    const missingFile = exercise.upload_requirement === 'mandatory' && !fileSubmission
    const missingUrl = exercise.url_requirement === 'mandatory' && !urlSubmission
    if (missingFile || missingUrl) {
      setHandInAttempted(true)
      toast.error('Please complete all required submissions first')
      return
    }
    setFinalizing(true)
    try {
      const fin = await finalizeSubmission(eid)
      setFinalization(fin)
      toast.success('Handed in!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Hand in failed')
    } finally {
      setFinalizing(false)
    }
  }

  const handleAddRemark = async () => {
    if (!remarkText.trim() || !grade) return
    setAddingRemark(true)
    try {
      const fb = await addStudentFeedback(eid, remarkText.trim())
      setGrade({ ...grade, feedbacks: [...grade.feedbacks, fb] })
      setRemarkText('')
      toast.success('Remark added')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to add remark')
    } finally {
      setAddingRemark(false)
    }
  }

  if (!exercise) {
    return (
      <Layout>
        <div className="animate-pulse text-slate-500">Loading…</div>
      </Layout>
    )
  }

  const showUpload = exercise.upload_requirement !== 'none'
  const showUrl = exercise.url_requirement !== 'none'
  const hasAnySubmissionType = showUpload || showUrl

  const fileMissing = handInAttempted && exercise.upload_requirement === 'mandatory' && !fileSubmission
  const urlMissing = handInAttempted && exercise.url_requirement === 'mandatory' && !urlSubmission

  // For StatusBadge: treat the exercise as submitted if any required/optional submission exists
  const anySubmission = fileSubmission ?? urlSubmission

  return (
    <Layout>
      <div className="mb-6">
        <Link to={`/courses/${cid}`} className="text-sm text-primary-400/60 hover:text-primary-300 transition-colors">
          ← Back to course
        </Link>
      </div>

      <div className="max-w-3xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-slate-100">{exercise.title}</h1>
          <div className="flex items-center gap-2">
            {finalization && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-400">
                Handed in
              </span>
            )}
            <StatusBadge exercise={exercise} submission={anySubmission} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-6">
          {exercise.start_date && (
            <span>Opens: {format(new Date(exercise.start_date), 'MMM d, yyyy HH:mm')}</span>
          )}
          {exercise.due_date && (
            <span className={isPast(new Date(exercise.due_date)) ? 'text-red-400' : ''}>
              Due: {format(new Date(exercise.due_date), 'MMM d, yyyy HH:mm')}
              {exercise.allow_late_upload && ' (late allowed)'}
            </span>
          )}
          {showUpload && (
            <span>
              Upload ({exercise.upload_requirement}): {exercise.allowed_extensions}
            </span>
          )}
          {showUrl && <span>URL ({exercise.url_requirement})</span>}
        </div>

        {exercise.description && (
          <div className="bg-surface-900 border border-violet-800/30 border-l-2 border-l-fuchsia-500/40 rounded-xl p-5 mb-6">
            <MarkdownRenderer content={exercise.description} />
          </div>
        )}

        {/* Rubric */}
        <div className="bg-surface-900 border border-violet-800/30 border-l-2 border-l-primary-500/35 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Grading</h2>
          <div className="text-sm text-slate-400">
            {exercise.grade_type === 'pass_fail' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-800 border border-slate-700 text-slate-300">
                Pass / Fail
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-800 border border-slate-700 text-slate-300">
                Score: {exercise.grade_min} – {exercise.grade_max}
              </span>
            )}
          </div>
          {exercise.rubric_description && (
            <div className="mt-3 pt-3 border-t border-slate-700/60">
              <MarkdownRenderer content={exercise.rubric_description} />
            </div>
          )}
        </div>

        {/* Grade result */}
        {grade && (
          <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-5 mb-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-emerald-400 mb-1">Your grade</h2>
              <div className="text-2xl font-bold text-emerald-300">{grade.value}</div>
              <p className="mt-1 text-xs text-slate-500">
                Graded by {grade.graded_by.github_username} · {format(new Date(grade.updated_at), 'MMM d, yyyy')}
              </p>
            </div>

            {/* Feedback thread */}
            <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Feedback</h3>
                {grade.feedbacks.length === 0 ? (
                  <p className="text-xs text-slate-600">No feedback yet.</p>
                ) : (
                  <div className="space-y-2">
                    {grade.feedbacks.map((fb: Feedback) => (
                      <div key={fb.id} className="bg-surface-800 rounded-lg px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-300">{fb.author.github_username}</span>
                          <span className="text-xs text-slate-500">{format(new Date(fb.created_at), 'MMM d, yyyy HH:mm')}</span>
                        </div>
                        <p className="text-sm text-slate-200 whitespace-pre-wrap">{fb.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Student can add a remark */}
                {!user?.is_admin && (
                  <div className="pt-1 space-y-2">
                    <textarea
                      value={remarkText}
                      onChange={(e) => setRemarkText(e.target.value)}
                      placeholder="Add a remark…"
                      rows={2}
                      className="w-full px-3 py-2 text-sm bg-surface-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                    />
                    <button
                      onClick={handleAddRemark}
                      disabled={addingRemark || !remarkText.trim()}
                      className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {addingRemark ? 'Saving…' : 'Add remark'}
                    </button>
                  </div>
                )}
              </div>
            </div>
        )}

        {/* Finalization status */}

        {finalization && (
          <div className="bg-emerald-900/10 border border-emerald-700/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-emerald-400">
              Handed in on {format(new Date(finalization.finalized_at), 'MMM d, yyyy HH:mm')}
            </p>
          </div>
        )}

        {/* Submission section */}
        {!user?.is_admin && hasAnySubmissionType && canSubmit() && (
          <div className="space-y-4">
            {/* File upload */}
            {showUpload && (
              <div
                className={`bg-surface-900 border-l-2 rounded-xl p-5 transition-colors ${
                  fileMissing
                    ? 'border border-red-500/60 border-l-red-500'
                    : 'border border-violet-800/30 border-l-primary-500/35'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-300">
                    File upload
                    {exercise.upload_requirement === 'mandatory' && (
                      <span className="ml-2 text-xs text-red-400">required</span>
                    )}
                  </h2>
                  {fileMissing && (
                    <span className="text-xs text-red-400">Upload a file to hand in</span>
                  )}
                </div>

                {fileSubmission && (
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-700/60">
                    <span className="text-sm text-slate-300">{fileSubmission.original_filename}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {format(new Date(fileSubmission.submitted_at), 'MMM d, HH:mm')}
                        {fileSubmission.is_late && <span className="ml-1.5 text-amber-400">Late</span>}
                      </span>
                      <a
                        href={downloadUrl(eid, fileSubmission.id)}
                        className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                )}

                <form onSubmit={handleFileSubmit} className="space-y-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept={exercise.allowed_extensions
                      .split(',')
                      .map((e) => `.${e.trim()}`)
                      .join(',')}
                    className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-surface-700 file:text-slate-200 hover:file:bg-surface-600 cursor-pointer"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 text-sm"
                  >
                    {submitting ? 'Uploading…' : fileSubmission ? 'Replace file' : 'Upload file'}
                  </button>
                </form>
              </div>
            )}

            {/* URL submission */}
            {showUrl && (
              <div
                className={`bg-surface-900 border-l-2 rounded-xl p-5 transition-colors ${
                  urlMissing
                    ? 'border border-red-500/60 border-l-red-500'
                    : 'border border-violet-800/30 border-l-primary-500/35'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-300">
                    URL submission
                    {exercise.url_requirement === 'mandatory' && (
                      <span className="ml-2 text-xs text-red-400">required</span>
                    )}
                  </h2>
                  {urlMissing && (
                    <span className="text-xs text-red-400">Submit a URL to hand in</span>
                  )}
                </div>

                {urlSubmission && (
                  <div className="mb-3 pb-3 border-b border-slate-700/60">
                    <a
                      href={urlSubmission.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-400 hover:text-primary-300 transition-colors break-all"
                    >
                      {urlSubmission.url}
                    </a>
                    <p className="text-xs text-slate-500 mt-1">
                      {format(new Date(urlSubmission.submitted_at), 'MMM d, HH:mm')}
                      {urlSubmission.is_late && <span className="ml-1.5 text-amber-400">Late</span>}
                    </p>
                  </div>
                )}

                <form onSubmit={handleUrlSubmit} className="space-y-3">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                    type="url"
                    className="w-full px-3 py-2 bg-surface-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 text-sm"
                  >
                    {submitting ? 'Submitting…' : urlSubmission ? 'Update URL' : 'Submit URL'}
                  </button>
                </form>
              </div>
            )}

            {/* Hand In button */}
            <button
              onClick={handleHandIn}
              disabled={finalizing}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm"
            >
              {finalizing ? 'Handing in…' : finalization ? 'Update hand-in' : 'Hand in'}
            </button>
          </div>
        )}

        {!user?.is_admin && !canSubmit() && !anySubmission && (
          <div className="bg-surface-900 border border-violet-800/25 rounded-xl p-5 text-center text-slate-500 text-sm">
            {exercise.start_date && new Date(exercise.start_date) > new Date()
              ? `This exercise opens on ${format(new Date(exercise.start_date), 'MMM d, yyyy HH:mm')}`
              : 'Submissions are closed.'}
          </div>
        )}
      </div>
    </Layout>
  )
}
