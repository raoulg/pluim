# Canvas

Course assignment submission and grading platform. Students authenticate via GitHub, submit files/URLs, and see their results. Professors manage exercises, view a grid overview of all students, and assign grades.

## Quick start

### 1. Create a GitHub OAuth App

Go to https://github.com/settings/developers → **New OAuth App**:
- **Homepage URL**: `http://YOUR_VM_IP`
- **Authorization callback URL**: `http://YOUR_VM_IP/api/auth/callback`

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
GITHUB_CLIENT_ID=...        # from the OAuth App
GITHUB_CLIENT_SECRET=...    # from the OAuth App
SECRET_KEY=...              # run: make secret
FRONTEND_URL=http://YOUR_VM_IP
ADMIN_GITHUB_USERNAMES=your_github_username
```

### 3. Build and run

```bash
docker compose up --build -d
```

Open `http://YOUR_VM_IP` in your browser. Log in with GitHub — your account gets admin rights automatically on first login (since it's in `ADMIN_GITHUB_USERNAMES`).

---

## Usage

### As a professor (admin)

1. Go to **Admin** → create a course → share the enrollment code with students
2. From the course page → **Manage** to add exercises with due dates, allowed file types, and grading rubrics
3. From the course page → **Grade overview** to see all students × exercises in a grid, with inline grade input
4. In the grade overview, hover a student row and click **Review →** to open a side panel — browse all their submissions per exercise, view PDFs embedded in the browser, and enter grades and feedback
5. Click **↓ all submissions** in any exercise column header to download a ZIP of all students' latest file submissions for that exercise

### As a student

1. Log in with GitHub
2. Enter an enrollment code on the dashboard to join a course
3. Click an exercise to view the description, rubric, and submit a file or URL
4. Your grades appear on the exercise page once the professor grades them
5. A notification badge in the navbar shows how many new or updated grades you haven't seen yet — it clears automatically when you visit the exercise page

---

## Features

- GitHub OAuth login
- Multiple courses with enrollment codes
- Exercises with start/due dates, allowed file extensions, late submission toggle
- Markdown descriptions and rubrics (with bold, links, lists, etc.)
- File uploads (PDF, etc.) and URL submissions, up to 50 MB
- Resubmission allowed at any time
- Grade scales: numeric (e.g. 0–10, 0–2) or Pass/Fail, with optional comments
- Professor grading grid: one screen, all students × all exercises
- Quick review panel: per-student side drawer with PDF embed, grade form, and feedback across all exercises
- Bulk download: ZIP of all students' latest file submissions per exercise
- Student grade notifications: navbar badge clears when the student views their grade
- Admin panel to manage users and toggle admin rights
- Dark mode UI

## Local development (no VM, no GitHub OAuth)

```bash
make dev-env        # creates .env with DEV_MODE=true and a local SQLite DB
make install        # npm install for the frontend (first time only)
```

Then in two terminals:
```bash
make dev-backend    # FastAPI on :8000 with hot-reload
make dev-frontend   # Vite on :3000, proxies /api → :8000
```

Open `http://localhost:3000` — a **⚡ Dev login** button appears instead of GitHub OAuth.
One click logs you in as an admin (`localdev`). No GitHub credentials needed.

> `DEV_MODE=true` disables the `/api/auth/dev-login` guard. Never set it in production.

All Makefile targets: `make help`

---

## Data persistence

All data lives in a Docker volume (`canvas_data`):
- SQLite database at `/data/db/canvas.db`
- Uploaded files at `/data/uploads/`

To back up: `docker run --rm -v canvas_canvas_data:/data -v $(pwd):/backup alpine tar czf /backup/canvas-backup.tar.gz /data`
