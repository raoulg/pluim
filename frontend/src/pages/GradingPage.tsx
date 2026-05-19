import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'
import { getCourseOverview } from '../api/courses'
import { setGrade, addTeacherFeedback, saveRubricScores } from '../api/grades'
import { getConfig, devLoginAs } from '../api/auth'
import client from '../api/client'
import Layout from '../components/Layout'
import MarkdownRenderer from '../components/MarkdownRenderer'
import type {
  CourseOverview,
  Exercise,
  Feedback,
  Grade,
  OverviewCell,
  OverviewRow,
  RubricCriterion,
  RubricCriterionScore,
  RubricScores,
  RubricTemplate,
  User,
} from '../types'

// ── Rubric helpers ────────────────────────────────────────────────────────────

function parseTemplate(raw: string | null): RubricTemplate | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

type RubricCategory = 'knockout' | 'onvoldoende' | 'voldoende' | 'uitstekend'

const CATEGORY_RANGE: Record<Exclude<RubricCategory, 'knockout'>, [number, number]> = {
  onvoldoende: [0, 0.4],
  voldoende: [0.6, 0.8],
  uitstekend: [0.8, 1.0],
}
const CATEGORY_DEFAULT: Record<Exclude<RubricCategory, 'knockout'>, number> = {
  onvoldoende: 0.3,
  voldoende: 0.7,
  uitstekend: 0.9,
}
const CATEGORY_COLOR: Record<RubricCategory, string> = {
  knockout: 'bg-red-600 text-white',
  onvoldoende: 'bg-orange-600 text-white',
  voldoende: 'bg-blue-600 text-white',
  uitstekend: 'bg-emerald-600 text-white',
}
const CATEGORY_GHOST: Record<RubricCategory, string> = {
  knockout: 'bg-surface-700 text-red-400 hover:bg-red-900/30 border border-red-900/40',
  onvoldoende: 'bg-surface-700 text-orange-400 hover:bg-orange-900/30 border border-orange-900/30',
  voldoende: 'bg-surface-700 text-blue-400 hover:bg-blue-900/30 border border-blue-900/30',
  uitstekend: 'bg-surface-700 text-emerald-400 hover:bg-emerald-900/30 border border-emerald-900/30',
}

function scoreToCategory(s: RubricCriterionScore): RubricCategory {
  if (s.is_knockout) return 'knockout'
  if (s.score <= 0.4) return 'onvoldoende'
  if (s.score <= 0.8) return 'voldoende'
  return 'uitstekend'
}

function calcGrade(template: RubricTemplate, scores: RubricScores, bonuses: Record<string, number> = {}) {
  const { criteria, verslag_weight, code_weight } = template
  const hasKnockout = criteria.some((c) => scores[c.id]?.is_knockout)
  if (hasKnockout) return { verslagScore: 0, codeScore: 0, base: 1, finalGrade: 1, bonusTotal: 0, hasKnockout: true }

  const verslag = criteria.filter((c) => c.section === 'verslag')
  const code = criteria.filter((c) => c.section === 'code')
  const vW = verslag.reduce((a, c) => a + c.weight, 0)
  const cW = code.reduce((a, c) => a + c.weight, 0)
  const vSum = verslag.reduce((a, c) => a + (scores[c.id]?.score ?? 0) * c.weight, 0)
  const cSum = code.reduce((a, c) => a + (scores[c.id]?.score ?? 0) * c.weight, 0)
  const verslagScore = Math.round(((vW > 0 ? vSum / vW : 0) * 10) * 10) / 10
  const codeScore = Math.round(((cW > 0 ? cSum / cW : 0) * 10) * 10) / 10
  const base = Math.round((verslag_weight * verslagScore + code_weight * codeScore) * 10) / 10

  const bonusCaps = Object.fromEntries((template.bonuses ?? []).map((b) => [b.id, b.max]))
  const bonusTotal = Math.round(
    Object.entries(bonuses).reduce((sum, [id, val]) => sum + Math.min(val, bonusCaps[id] ?? val), 0) * 10
  ) / 10
  const finalGrade = Math.round((base + bonusTotal) * 10) / 10

  return { verslagScore, codeScore, base, finalGrade, bonusTotal, hasKnockout: false }
}

// ── CriterionRow ──────────────────────────────────────────────────────────────

function CriterionRow({
  criterion,
  score,
  onChange,
}: {
  criterion: RubricCriterion
  score: RubricCriterionScore | undefined
  onChange: (s: RubricCriterionScore) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [richRemark, setRichRemark] = useState(false)
  const category = score ? scoreToCategory(score) : null

  const select = (cat: RubricCategory) => {
    if (cat === 'knockout') {
      onChange({ score: 0, is_knockout: true, remark: score?.remark ?? '' })
    } else {
      const [min, max] = CATEGORY_RANGE[cat]
      const s = score && !score.is_knockout && scoreToCategory(score) === cat
        ? Math.min(Math.max(score.score, min), max)
        : CATEGORY_DEFAULT[cat]
      onChange({ score: s, is_knockout: false, remark: score?.remark ?? '' })
    }
  }

  const categories: RubricCategory[] = criterion.knockout
    ? ['knockout', 'onvoldoende', 'voldoende', 'uitstekend']
    : ['onvoldoende', 'voldoende', 'uitstekend']

  const catLabel: Record<RubricCategory, string> = {
    knockout: 'KO',
    onvoldoende: 'Onv',
    voldoende: 'Vold',
    uitstekend: 'Uitst',
  }

  return (
    <div className="border border-violet-900/30 rounded-lg p-3 space-y-2 bg-surface-900/60">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-200">{criterion.title}</span>
          <span className="ml-2 text-xs text-slate-500">×{criterion.weight}</span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-slate-600 hover:text-slate-400 shrink-0 transition-colors"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => select(cat)}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              category === cat ? CATEGORY_COLOR[cat] : CATEGORY_GHOST[cat]
            }`}
          >
            {catLabel[cat]}
          </button>
        ))}
        {score && !score.is_knockout && (
          <div className="flex items-center gap-1 ml-1">
            <input
              type="number"
              value={score.score}
              min={CATEGORY_RANGE[scoreToCategory(score) as Exclude<RubricCategory, 'knockout'>]?.[0] ?? 0}
              max={CATEGORY_RANGE[scoreToCategory(score) as Exclude<RubricCategory, 'knockout'>]?.[1] ?? 1}
              step={0.05}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) onChange({ ...score, score: v })
              }}
              className="w-16 px-2 py-1 text-xs bg-surface-700 border border-slate-600 rounded text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <span className="text-xs text-slate-500">
              = {(score.score * criterion.weight).toFixed(2)} pt
            </span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-1 space-y-1.5 text-xs text-slate-400 bg-surface-800/60 rounded p-2.5">
          {criterion.knockout && (
            <div><span className="font-medium text-red-400">Knock out: </span>{criterion.knockout}</div>
          )}
          <div><span className="font-medium text-orange-400">Onvoldoende (0–0.4): </span>{criterion.onvoldoende}</div>
          <div><span className="font-medium text-blue-400">Voldoende (0.6–0.8): </span>{criterion.voldoende}</div>
          <div><span className="font-medium text-emerald-400">Uitstekend (0.8–1.0): </span>{criterion.uitstekend}</div>
          {criterion.aandachtspunten && (
            <div><span className="font-medium text-slate-300">Aandachtspunten: </span>{criterion.aandachtspunten}</div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-600">Opmerking</span>
          <button
            type="button"
            onClick={() => setRichRemark((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {richRemark ? 'plain text' : 'rich text'}
          </button>
        </div>
        {richRemark ? (
          <div data-color-mode="dark">
            <MDEditor
              value={score?.remark ?? ''}
              onChange={(v) =>
                onChange({ ...(score ?? { score: 0, is_knockout: false }), remark: v ?? '' })
              }
              preview="edit"
              height={120}
            />
          </div>
        ) : (
          <input
            type="text"
            value={score?.remark ?? ''}
            onChange={(e) =>
              onChange({ ...(score ?? { score: 0, is_knockout: false }), remark: e.target.value })
            }
            placeholder="Opmerking…"
            className="w-full px-2 py-1 text-xs bg-surface-700 border border-slate-600/50 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        )}
      </div>
    </div>
  )
}

// ── RubricGrader ──────────────────────────────────────────────────────────────

function RubricGrader({
  template,
  initialScores,
  initialBonuses,
  student,
  exercise,
  courseId,
  onSaved,
}: {
  template: RubricTemplate
  initialScores: RubricScores | null
  initialBonuses: Record<string, number>
  student: User
  exercise: Exercise
  courseId: number
  onSaved: () => Promise<void>
}) {
  const [scores, setScores] = useState<RubricScores>(() => initialScores ?? {})
  const [bonuses, setBonuses] = useState<Record<string, number>>(() => initialBonuses)
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null)

  const setScore = (id: string, s: RubricCriterionScore) =>
    setScores((prev) => ({ ...prev, [id]: s }))

  const setBonus = (id: string, val: number) =>
    setBonuses((prev) => ({ ...prev, [id]: val }))

  const { verslagScore, codeScore, base, finalGrade, bonusTotal, hasKnockout } = calcGrade(template, scores, bonuses)
  const scoredCount = template.criteria.filter((c) => c.id in scores).length
  const total = template.criteria.length
  const allScored = scoredCount === total
  const hasAnyScore = scoredCount > 0
  const hasBonuses = (template.bonuses ?? []).length > 0

  const handleSave = async (publish: boolean) => {
    setSaving(publish ? 'publish' : 'draft')
    try {
      await saveRubricScores(courseId, student.id, exercise.id, scores, publish, bonuses)
      toast.success(publish ? 'Grade published' : 'Draft saved')
      await onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save rubric')
    } finally {
      setSaving(null)
    }
  }

  const verslagCriteria = template.criteria.filter((c) => c.section === 'verslag')
  const codeCriteria = template.criteria.filter((c) => c.section === 'code')

  return (
    <div className="space-y-4">
      {/* Verslag section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Verslag
          </h4>
          <span className="text-xs text-slate-600">{template.verslag_weight * 100}%</span>
        </div>
        <div className="space-y-2">
          {verslagCriteria.map((c) => (
            <CriterionRow
              key={c.id}
              criterion={c}
              score={scores[c.id]}
              onChange={(s) => setScore(c.id, s)}
            />
          ))}
        </div>
      </div>

      {/* Code section */}
      {codeCriteria.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Code
            </h4>
            <span className="text-xs text-slate-600">{template.code_weight * 100}%</span>
          </div>
          <div className="space-y-2">
            {codeCriteria.map((c) => (
              <CriterionRow
                key={c.id}
                criterion={c}
                score={scores[c.id]}
                onChange={(s) => setScore(c.id, s)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bonus section */}
      {hasBonuses && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bonus</h4>
          </div>
          <div className="space-y-2">
            {(template.bonuses ?? []).map((b) => (
              <div key={b.id} className="border border-violet-900/30 rounded-lg p-3 bg-surface-900/60 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-200">{b.title}</span>
                  <span className="ml-2 text-xs text-slate-500">max +{b.max}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    value={bonuses[b.id] ?? 0}
                    min={0}
                    max={b.max}
                    step={0.05}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setBonus(b.id, isNaN(v) ? 0 : Math.min(Math.max(v, 0), b.max))
                    }}
                    className="w-16 px-2 py-1 text-xs bg-surface-700 border border-slate-600 rounded text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <span className="text-xs text-slate-500">/ {b.max}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grade summary */}
      <div className={`rounded-xl p-4 border ${hasKnockout ? 'border-red-600/60 bg-red-900/20' : 'border-violet-800/30 bg-surface-800'}`}>
        {hasKnockout ? (
          <div className="text-red-400 font-semibold text-sm">Knock out — eindcijfer: 1</div>
        ) : hasBonuses ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Verslag</div>
                <div className="text-lg font-bold text-slate-200">{scoredCount > 0 ? verslagScore.toFixed(1) : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Code</div>
                <div className="text-lg font-bold text-slate-200">
                  {codeCriteria.length > 0 && codeCriteria.every((c) => c.id in scores)
                    ? codeScore.toFixed(1)
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Basis</div>
                <div className="text-lg font-bold text-slate-200">{allScored ? base.toFixed(1) : '—'}</div>
              </div>
            </div>
            {allScored && (
              <div className="flex items-center justify-between pt-2 border-t border-violet-900/30">
                <span className="text-xs text-slate-500">
                  {base.toFixed(1)} + {bonusTotal.toFixed(2)} bonus
                </span>
                <div className={`text-2xl font-bold text-primary-400`}>
                  {finalGrade.toFixed(1)}
                </div>
              </div>
            )}
            {!allScored && (
              <div className="text-center text-slate-600 text-2xl font-bold">—</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Verslag</div>
              <div className="text-lg font-bold text-slate-200">{scoredCount > 0 ? verslagScore.toFixed(1) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Code</div>
              <div className="text-lg font-bold text-slate-200">
                {codeCriteria.length > 0 && codeCriteria.every((c) => c.id in scores)
                  ? codeScore.toFixed(1)
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Eindcijfer</div>
              <div className={`text-2xl font-bold ${allScored ? 'text-primary-400' : 'text-slate-600'}`}>
                {allScored ? finalGrade.toFixed(1) : '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleSave(false)}
          disabled={saving !== null || !hasAnyScore}
          className="flex-1 py-2 bg-surface-700 hover:bg-surface-600 disabled:opacity-50 text-slate-200 font-medium rounded-lg transition-colors text-sm border border-slate-600"
        >
          {saving === 'draft' ? 'Saving…' : 'Save draft'}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving !== null || !allScored}
          className="flex-1 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
          title={!allScored ? `Score all ${total} criteria first` : undefined}
        >
          {saving === 'publish'
            ? 'Publishing…'
            : allScored
            ? 'Publish'
            : `Publish (${scoredCount}/${total})`}
        </button>
      </div>
    </div>
  )
}

export default function GradingPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const cid = Number(courseId)
  const [overview, setOverview] = useState<CourseOverview | null>(null)
  const [editing, setEditing] = useState<{ userId: number; exerciseId: number } | null>(null)
  const [reviewStudent, setReviewStudent] = useState<OverviewRow | null>(null)
  const [devMode, setDevMode] = useState(false)

  const load = () =>
    getCourseOverview(cid)
      .then(setOverview)
      .catch(() => toast.error('Failed to load overview'))

  useEffect(() => {
    load()
    getConfig().then((c) => setDevMode(c.dev_mode)).catch(() => {})
  }, [cid])

  const handleViewAs = async (userId: number) => {
    try {
      const token = await devLoginAs(userId)
      window.open(`/dev-view-as?token=${token}&return=/courses/${cid}`, '_blank')
    } catch {
      toast.error('View as student failed')
    }
  }

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
                    {devMode && (
                      <button
                        onClick={() => handleViewAs(row.student.id)}
                        className="text-xs text-slate-600 hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="Open course as this student in a new tab"
                      >
                        View as →
                      </button>
                    )}
                  </div>
                </td>
                {overview.exercises.map((ex) => {
                  const cell = row.cells[ex.id] ?? { file: null, url: null, grade: null }
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
  const { file, url, grade } = cell
  const hasSubmission = !!(file || url)
  const isLate = !!(file?.is_late || url?.is_late)

  const statusColor = () => {
    if (!hasSubmission) return 'bg-slate-800 text-slate-500'
    if (isLate) return 'bg-amber-900/30 text-amber-400'
    return 'bg-emerald-900/30 text-emerald-400'
  }

  return (
    <div className="space-y-1">
      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${statusColor()}`}>
        {!hasSubmission
          ? '—'
          : (
            <span className="inline-flex items-center gap-1">
              {file && (
                <a
                  href={`/api/exercises/${exercise.id}/submissions/${file.id}/download`}
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {file.original_filename ?? 'file'}
                </a>
              )}
              {url && (
                <a
                  href={url.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {file ? 'url' : 'url'}
                </a>
              )}
            </span>
          )}
      </div>

      <div>
        {grade ? (
          <button
            onClick={onEdit}
            className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors inline-flex items-center gap-1"
            title={grade.comment ?? undefined}
          >
            {grade.is_published ? grade.value : (
              <span className="text-amber-400">draft</span>
            )}
            {' '}✎
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
  const cell = selectedEx ? (currentRow.cells[selectedExId] ?? { file: null, url: null, grade: null }) : null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ml-auto w-[90%] h-full bg-surface-900 flex flex-col shadow-2xl border-l border-violet-800/40">
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
              const c = currentRow.cells[ex.id] ?? { file: null, url: null, grade: null }
              const hasSubmission = !!(c.file || c.url)
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
                key={`${selectedExId}-${cell.grade?.feedbacks?.length}`}
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
  const { file, url, grade } = cell
  const rubricTemplate = parseTemplate(exercise.rubric_template ?? null)
  const rawScores = grade?.rubric_scores ?? null
  const initialBonuses = (rawScores?.['__bonuses__'] as Record<string, number> | undefined) ?? {}
  const initialScores = rawScores
    ? (Object.fromEntries(Object.entries(rawScores).filter(([k]) => k !== '__bonuses__')) as RubricScores)
    : null
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [value, setValue] = useState(grade?.value ?? '')
  const [saving, setSaving] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [addingFeedback, setAddingFeedback] = useState(false)
  const prevBlobUrl = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current)
      prevBlobUrl.current = null
    }
    setPdfBlobUrl(null)

    if (file) {
      setPdfLoading(true)
      client
        .get(`/exercises/${exercise.id}/submissions/${file.id}/download`, {
          responseType: 'blob',
          signal: controller.signal,
        })
        .then((res) => {
          const blob = new Blob([res.data], {
            type: (res.headers['content-type'] as string) || 'application/octet-stream',
          })
          const blobUrl = URL.createObjectURL(blob)
          prevBlobUrl.current = blobUrl
          setPdfBlobUrl(blobUrl)
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
  }, [exercise.id, file?.id])

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await setGrade(courseId, student.id, exercise.id, value.trim())
      toast.success('Grade saved')
      await onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save grade')
    } finally {
      setSaving(false)
    }
  }

  const handleAddFeedback = async () => {
    if (!feedbackText.trim() || !grade) return
    setAddingFeedback(true)
    try {
      await addTeacherFeedback(courseId, student.id, exercise.id, feedbackText.trim())
      setFeedbackText('')
      toast.success('Feedback added')
      await onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to add feedback')
    } finally {
      setAddingFeedback(false)
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
      {!file && !url && (
        <div className="bg-surface-800 border border-violet-900/40 rounded-xl p-4 text-sm text-slate-500">
          No submission for this exercise.
        </div>
      )}

      {url && (
        <div className="bg-surface-800 border border-violet-900/40 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500 uppercase tracking-wide">URL submission</div>
          <a
            href={url.url!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:text-primary-300 transition-colors text-sm break-all"
          >
            {url.url}
          </a>
          <div className="text-xs text-slate-600">
            {format(new Date(url.submitted_at), 'MMM d, yyyy HH:mm')}
            {url.is_late && <span className="ml-2 text-amber-500">Late</span>}
          </div>
        </div>
      )}

      {file && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              {file.original_filename}
              {file.is_late && <span className="ml-2 text-amber-500">Late</span>}
            </div>
            <a
              href={`/api/exercises/${exercise.id}/submissions/${file.id}/download`}
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

      {/* Grade form — rubric or manual */}
      {rubricTemplate ? (
        <div className="bg-surface-800 border border-violet-800/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-300">Rubric</h4>
            {grade && (
              <div className="flex items-center gap-2">
                {!grade.is_published && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 border border-amber-700/40">
                    draft
                  </span>
                )}
                <span className="text-xs text-primary-400 font-semibold">
                  {grade.is_published ? grade.value : '—'}
                </span>
              </div>
            )}
          </div>
          {grade && !grade.is_published && (
            <div className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800/30 rounded-lg px-3 py-2">
              Draft — not yet visible to the student. Click <strong>Publish</strong> when ready.
            </div>
          )}
          <RubricGrader
            key={`rubric-${grade?.id ?? 'new'}`}
            template={rubricTemplate}
            initialScores={initialScores}
            initialBonuses={initialBonuses}
            student={student}
            exercise={exercise}
            courseId={courseId}
            onSaved={onSaved}
          />
        </div>
      ) : (
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
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="w-full py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {saving ? 'Saving…' : 'Save grade'}
          </button>
        </div>
      )}

      {/* Feedback thread */}
      {grade && (
        <div className="bg-surface-800 border border-violet-800/30 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-300">Feedback</h4>
          {grade.feedbacks.length === 0 ? (
            <p className="text-xs text-slate-500">No feedback yet.</p>
          ) : (
            <div className="space-y-2">
              {grade.feedbacks.map((fb) => (
                <FeedbackEntry key={fb.id} feedback={fb} />
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-violet-900/30 space-y-2">
            <div data-color-mode="dark">
              <MDEditor
                value={feedbackText}
                onChange={(v) => setFeedbackText(v ?? '')}
                preview="edit"
                height={120}
              />
            </div>
            <button
              onClick={handleAddFeedback}
              disabled={addingFeedback || !feedbackText.trim()}
              className="w-full py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {addingFeedback ? 'Saving…' : 'Add remark'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FeedbackEntry({ feedback }: { feedback: Feedback }) {
  return (
    <div className="bg-surface-700 rounded-lg px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">{feedback.author.github_username}</span>
        <span className="text-xs text-slate-500">{format(new Date(feedback.created_at), 'MMM d, yyyy HH:mm')}</span>
      </div>
      <MarkdownRenderer content={feedback.content} />
    </div>
  )
}
