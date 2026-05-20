import type { Exercise, Grade, Submission } from '../types'

interface Props {
  exercise: Exercise
  submission: Submission | null
  grade?: Grade | null
  finalized?: boolean
}

function hasRemarks(grade: Grade): boolean {
  if (grade.comment) return true
  if (grade.feedbacks.length > 0) return true
  if (grade.rubric_scores) {
    return Object.values(grade.rubric_scores).some(
      (s) => typeof s === 'object' && s !== null && 'remark' in s && !!(s as { remark?: string }).remark
    )
  }
  return false
}

export default function StatusBadge({ exercise, submission, grade, finalized }: Props) {
  const now = new Date()
  const due = exercise.due_date ? new Date(exercise.due_date) : null
  const start = exercise.start_date ? new Date(exercise.start_date) : null

  if (start && start > now) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400">
        Locked
      </span>
    )
  }

  if (grade?.is_published) {
    const isNew = grade.viewed_at === null
    const withRemarks = hasRemarks(grade)

    if (exercise.grade_type === 'pass_fail') {
      const passed = grade.value === 'pass'
      const color = isNew
        ? 'bg-amber-900/40 text-amber-400'
        : passed
        ? 'bg-emerald-900/40 text-emerald-400'
        : 'bg-red-900/40 text-red-400'
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
          {passed ? 'Pass' : 'Fail'}
          {withRemarks && <span title="Has remarks">·</span>}
        </span>
      )
    }

    const display = exercise.grade_max != null
      ? `${grade.value} / ${exercise.grade_max}`
      : grade.value
    const color = isNew ? 'bg-amber-900/40 text-amber-400' : 'bg-sky-900/40 text-sky-400'
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
        {display}
        {withRemarks && <span className="opacity-70" title="Has remarks">✦</span>}
      </span>
    )
  }

  if (!submission) {
    if (due && now > due) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400">
          Missing
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400">
        Not submitted
      </span>
    )
  }

  if (submission.is_late) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/40 text-amber-400">
        Late
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/40 text-emerald-400">
      Submitted
    </span>
  )
}
