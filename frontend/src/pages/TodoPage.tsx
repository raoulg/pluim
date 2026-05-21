import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { getAdminTodo } from '../api/grades'
import Layout from '../components/Layout'
import type { TodoItem } from '../types'

export default function TodoPage() {
  const [items, setItems] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAdminTodo()
      .then(setItems)
      .catch(() => toast.error('Failed to load todo list'))
      .finally(() => setLoading(false))
  }, [])

  const byCourse = items.reduce<Record<number, { name: string; items: TodoItem[] }>>((acc, item) => {
    if (!acc[item.course_id]) acc[item.course_id] = { name: item.course_name, items: [] }
    acc[item.course_id].items.push(item)
    return acc
  }, {})

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-fuchsia-200 to-primary-300 bg-clip-text text-transparent">
          Grading Queue
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {items.length === 0 && !loading
            ? 'All caught up!'
            : `${items.length} submission${items.length !== 1 ? 's' : ''} awaiting a grade`}
        </p>
      </div>

      {loading && <div className="text-slate-500 text-sm">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 text-slate-500">Nothing to grade right now.</div>
      )}

      <div className="space-y-8">
        {Object.entries(byCourse).map(([courseId, { name, items: courseItems }]) => (
          <div key={courseId}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-300">{name}</h2>
              <Link
                to={`/courses/${courseId}/grade`}
                className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
              >
                Open grading →
              </Link>
            </div>
            <div className="space-y-2">
              {courseItems.map((item) => (
                <Link
                  key={`${item.student_id}-${item.exercise_id}`}
                  to={`/courses/${item.course_id}/grade?student=${item.student_id}&exercise=${item.exercise_id}`}
                  className="flex items-center gap-4 bg-surface-900 border border-violet-800/30 border-l-2 border-l-fuchsia-500/40 rounded-xl px-4 py-3 hover:border-primary-400/60 hover:bg-surface-800 transition-all duration-150 group"
                >
                  <img
                    src={item.student_avatar}
                    alt=""
                    className="w-8 h-8 rounded-full ring-1 ring-primary-500/30 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200 group-hover:text-primary-300 transition-colors">
                        {item.student_username}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-sm text-slate-400 truncate">{item.exercise_title}</span>
                      {item.has_draft && (
                        <span className="px-1.5 py-0.5 text-xs bg-amber-900/30 text-amber-400 rounded border border-amber-800/40">
                          draft saved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Submitted {formatDistanceToNow(new Date(item.finalized_at), { addSuffix: true })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  )
}
