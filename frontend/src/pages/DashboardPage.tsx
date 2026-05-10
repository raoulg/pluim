import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getCourses, joinCourse } from '../api/courses'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import type { Course } from '../types'

export default function DashboardPage() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)

  const load = () => getCourses().then(setCourses).catch(() => toast.error('Failed to load courses'))

  useEffect(() => { load() }, [])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setJoining(true)
    try {
      await joinCourse(code.trim())
      setCode('')
      toast.success('Enrolled!')
      await load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Invalid code')
    } finally {
      setJoining(false)
    }
  }

  const active = courses.filter((c) => !c.is_archived)
  const archived = courses.filter((c) => c.is_archived)

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-fuchsia-200 to-primary-300 bg-clip-text text-transparent">My Courses</h1>
          <p className="text-slate-400 text-sm mt-1">
            Welcome back, {user?.github_username}
          </p>
        </div>
        {user?.is_admin && (
          <Link
            to="/admin"
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Manage
          </Link>
        )}
      </div>

      {!user?.is_admin && (
        <form onSubmit={handleJoin} className="mb-8 flex gap-2 max-w-sm">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enrollment code…"
            className="flex-1 px-3 py-2 bg-surface-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={joining}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            Join
          </button>
        </form>
      )}

      {active.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          {user?.is_admin ? 'No courses yet — create one in the admin panel.' : 'No courses yet — enter an enrollment code to join.'}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((course) => (
          <CourseCard key={course.id} course={course} isAdmin={user?.is_admin ?? false} />
        ))}
      </div>

      {archived.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-amber-400/70 mt-10 mb-4">Archived</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((course) => (
              <CourseCard key={course.id} course={course} isAdmin={user?.is_admin ?? false} />
            ))}
          </div>
        </>
      )}
    </Layout>
  )
}

function CourseCard({ course, isAdmin }: { course: Course; isAdmin: boolean }) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="block bg-surface-900 border border-violet-800/30 border-l-2 border-l-primary-500/40 rounded-xl p-5 hover:border-primary-400/60 hover:border-l-primary-400/70 hover:bg-surface-800 transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-100 group-hover:text-primary-400 transition-colors line-clamp-2">
          {course.name}
        </h3>
        {course.is_archived && (
          <span className="shrink-0 px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Archived</span>
        )}
      </div>
      {course.description && (
        <p className="text-slate-400 text-sm mt-2 line-clamp-2">{course.description}</p>
      )}
      {isAdmin && (
        <p className="mt-3 text-xs text-slate-600 font-mono">{course.enrollment_code}</p>
      )}
    </Link>
  )
}
