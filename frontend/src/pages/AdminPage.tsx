import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getUsers, updateUser } from '../api/admin'
import { getCourses, createCourse, updateCourse, deleteCourse } from '../api/courses'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import type { Course, User } from '../types'

export default function AdminPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [tab, setTab] = useState<'courses' | 'users'>('courses')
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseDesc, setNewCourseDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const loadUsers = () => getUsers().then(setUsers).catch(() => toast.error('Failed to load users'))
  const loadCourses = () => getCourses().then(setCourses).catch(() => toast.error('Failed to load courses'))

  useEffect(() => {
    loadUsers()
    loadCourses()
  }, [])

  const handleToggleAdmin = async (u: User) => {
    if (u.id === me?.id) { toast.error("Can't change your own admin status"); return }
    try {
      const updated = await updateUser(u.id, !u.is_admin)
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      toast.success(updated.is_admin ? `${updated.github_username} is now admin` : `${updated.github_username} removed from admin`)
    } catch {
      toast.error('Failed to update user')
    }
  }

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCourseName.trim()) return
    setCreating(true)
    try {
      const course = await createCourse({ name: newCourseName.trim(), description: newCourseDesc.trim() || undefined })
      setCourses((prev) => [course, ...prev])
      setNewCourseName('')
      setNewCourseDesc('')
      toast.success('Course created')
    } catch {
      toast.error('Failed to create course')
    } finally {
      setCreating(false)
    }
  }

  const handleArchive = async (course: Course) => {
    try {
      const updated = await updateCourse(course.id, { is_archived: !course.is_archived })
      setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      toast.success(updated.is_archived ? 'Archived' : 'Unarchived')
    } catch {
      toast.error('Failed to update course')
    }
  }

  const handleDelete = async (course: Course) => {
    if (!confirm(`Delete "${course.name}"? This is permanent.`)) return
    try {
      await deleteCourse(course.id)
      setCourses((prev) => prev.filter((c) => c.id !== course.id))
      toast.success('Deleted')
    } catch {
      toast.error('Failed to delete course')
    }
  }

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">← Dashboard</Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-100 mb-6">Admin</h1>

      <div className="flex gap-1 mb-6 bg-surface-900 border border-slate-700/60 rounded-xl p-1 w-fit">
        {(['courses', 'users'] as const).map((t) => (
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

      {tab === 'courses' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateCourse} className="bg-surface-900 border border-slate-700/60 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">New course</h2>
            <input
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="Course name"
              className="w-full px-3 py-2 bg-surface-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <input
              value={newCourseDesc}
              onChange={(e) => setNewCourseDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 bg-surface-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Create
            </button>
          </form>

          <div className="space-y-2">
            {courses.map((course) => (
              <div key={course.id} className="flex items-center justify-between gap-4 bg-surface-900 border border-slate-700/60 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/courses/${course.id}/manage`}
                      className="font-medium text-slate-100 hover:text-primary-400 transition-colors truncate"
                    >
                      {course.name}
                    </Link>
                    {course.is_archived && (
                      <span className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Archived</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 font-mono mt-0.5">{course.enrollment_code}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/courses/${course.id}/manage`}
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                  >
                    Manage
                  </Link>
                  <button
                    onClick={() => handleArchive(course)}
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                  >
                    {course.is_archived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    onClick={() => handleDelete(course)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded border border-red-900/40 hover:border-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-4 bg-surface-900 border border-slate-700/60 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <img src={u.github_avatar_url} alt="" className="w-8 h-8 rounded-full" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-100">{u.github_username}</span>
                    {u.is_admin && (
                      <span className="px-1.5 py-0.5 text-xs bg-primary-900/40 text-primary-400 rounded border border-primary-800/40">Admin</span>
                    )}
                    {u.id === me?.id && (
                      <span className="text-xs text-slate-500">(you)</span>
                    )}
                  </div>
                  {u.github_email && <p className="text-xs text-slate-500">{u.github_email}</p>}
                </div>
              </div>
              <button
                onClick={() => handleToggleAdmin(u)}
                disabled={u.id === me?.id}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  u.is_admin
                    ? 'border-red-900/40 text-red-400 hover:bg-red-900/20'
                    : 'border-slate-700 text-slate-400 hover:bg-surface-800 hover:text-slate-200'
                }`}
              >
                {u.is_admin ? 'Remove admin' : 'Make admin'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
