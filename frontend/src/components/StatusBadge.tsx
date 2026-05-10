import type { Exercise, Submission } from '../types'

interface Props {
  exercise: Exercise
  submission: Submission | null
  finalized?: boolean
}

export default function StatusBadge({ exercise, submission, finalized }: Props) {
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
