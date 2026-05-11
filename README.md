# Canvas

![status](https://img.shields.io/badge/status-alpha-orange)
[![uv](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/uv/main/assets/badge/v0.json)](https://github.com/astral-sh/uv)
[![ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![ty](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ty/main/assets/badge/v0.json)](https://github.com/astral-sh/ty)
[![Built with Claude](https://img.shields.io/badge/built%20with-Claude-%23CC785C?logo=anthropic&logoColor=white)](https://claude.ai)

Course assignment submission and grading platform. Students authenticate via GitHub, submit files/URLs, and see their results. Teachers manage exercises, view a grid overview of all students, and assign grades.

## Features

- GitHub OAuth login
- Multiple courses with enrollment codes
- Exercises with start/due dates, allowed file extensions, late submission toggle
- Markdown descriptions and rubrics (with bold, links, lists, etc.)
- File uploads (PDF, etc.) and URL submissions, up to 50 MB
- Resubmission allowed at any time
- Grade scales: numeric (e.g. 0–10, 0–2) or Pass/Fail, with timestamped rich-text feedback
- Structured rubric grading: per-criterion scoring (Knock out / Onvoldoende / Voldoende / Uitstekend) with weighted final grade calculated automatically; rubrics stored as JSON files and loaded from a `rubrics/` directory
- Professor grading grid: one screen, all students × all exercises
- Quick review panel: per-student side drawer with PDF embed, grade form, and rich-text feedback history across all exercises
- Bulk download: ZIP of all students' latest file submissions per exercise
- Student grade notifications: navbar badge clears when the student views their grade
- Admin panel to manage users and toggle admin rights
- Dark mode UI

---
## Quick start
### 1. Provision a VM

Recommended: Ubuntu 22.04, 8 GB RAM (e.g. SURF Research Cloud or any VPS).
Note the public IP — you'll need it in the steps below.

Install Docker and uv on the VM:

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then log out and back in

# uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Clone the repo and run the setup helper:

```bash
git clone <repo-url>
cd pluim
make setup
```

`make setup` copies `.env.example` → `.env` and prints the remaining steps.

### 2. Create a GitHub OAuth App

Go to **https://github.com/settings/developers** → **New OAuth App** and fill in:
- **Homepage URL**: `http://YOUR_VM_IP`
- **Authorization callback URL**: `http://YOUR_VM_IP/api/auth/callback`

After saving, copy the **Client ID** and generate a **Client Secret**.

### 3. Configure `.env`

Edit the `.env` file that `make setup` created:

```
GITHUB_CLIENT_ID=...              # from the OAuth App
GITHUB_CLIENT_SECRET=...          # from the OAuth App
FRONTEND_URL=http://YOUR_VM_IP
ADMIN_GITHUB_USERNAMES=your_github_username
SECRET_KEY=...                    # run: make secret, then paste the output
```

Run `make secret` to generate a secure `SECRET_KEY`.

### 4. Build and run

```bash
make build && make up
```

Open `http://YOUR_VM_IP` in your browser. Log in with GitHub — your account gets admin rights automatically on first login (since it's in `ADMIN_GITHUB_USERNAMES`).

For subsequent deploys after a `git pull`, use `make deploy`. From your local machine you can run `make push-deploy` to push, pull on the server, and redeploy in one step (requires `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_PATH` in `.env`).

---

## Usage

### As an admin

1. Go to **Admin** → create a course → share the enrollment code with students
2. From the course page → **Manage** to add exercises with due dates, allowed file types, and grading rubrics
3. From the course page → **Grade overview** to see all students × exercises in a grid, with inline grade input
4. In the grade overview, hover a student row and click **Review →** to open a side panel — browse all their submissions per exercise, view PDFs embedded in the browser, and enter grades and feedback
5. Click **↓ all submissions** in any exercise column header to download a ZIP of all students' latest file submissions for that exercise

### Rubric grading

Exercises can be graded with a structured rubric instead of a free numeric grade. The rubric is defined as a JSON file and loaded onto the exercise in the Manage page.

**Setting up rubrics:**

Rubric files live in the `rubrics/` directory at the project root. Only `rubrics/example.json` is committed to git — all other rubric files are gitignored so each teacher can keep their own locally.

```
rubrics/
  example.json   ← committed; shows the JSON format
  dav.json       ← gitignored; your own rubric
  mlops.json     ← gitignored; another course
  ...
```

A rubric file looks like this (see `rubrics/example.json` for the full structure):

```json
{
  "criteria": [
    {
      "id": "introduction",
      "title": "Introduction",
      "weight": 1.0,
      "section": "verslag",
      "knockout": null,
      "onvoldoende": "No context or motivation.",
      "voldoende": "Basic context provided.",
      "uitstekend": "Rich context with a precise research question.",
      "aandachtspunten": null
    }
  ],
  "verslag_weight": 0.7,
  "code_weight": 0.3
}
```

Each criterion belongs to either the `verslag` or `code` section. The final grade is:

```
final = verslag_weight × (weighted average of verslag scores × 10)
      + code_weight    × (weighted average of code scores × 10)
```

Scores per criterion are 0–0.4 (Onvoldoende), 0.6–0.8 (Voldoende), or 0.8–1.0 (Uitstekend). A Knock out on any criterion sets the final grade to 1.

**Attaching a rubric to an exercise:**

1. Open **Manage** → edit or create an exercise
2. In the *Structured rubric template* section, select a rubric from the dropdown and click **Load**
3. The JSON is filled in — save the exercise

**Grading with a rubric:**

In the **Review →** side panel, exercises that have a rubric template show the rubric grader instead of the plain grade input. For each criterion:
- Click a category button (KO / Onv / Vold / Uitst)
- Adjust the exact score within the selected range if needed
- Add an optional remark (toggle to rich text for Markdown formatting)
- Click **▼** to expand the criterion's full description

The live grade summary (verslag / code / final) updates as you score. The **Save rubric & grade** button is enabled once all criteria are scored.

**Deploying rubrics to the server:**

Because rubric files are gitignored they are not included in `make push-deploy`. Copy them separately:

```bash
make scp-rubric
```

This SCPs all `rubrics/*.json` to `DEPLOY_PATH/rubrics/` on the server (requires `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_PATH` in `.env`). The backend picks up the new files immediately — no restart needed, as the directory is bind-mounted into the container.

### As a student

1. Log in with GitHub
2. Enter an enrollment code on the dashboard to join a course
3. Click an exercise to view the description, rubric, and submit a file or URL
4. Your grades appear on the exercise page once the professor grades them
5. A notification badge in the navbar shows how many new or updated grades you haven't seen yet — it clears automatically when you visit the exercise page


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

All data lives in a Docker volume (`canvas_pluim_data`):
- SQLite database at `/data/db/pluim.db`
- Uploaded files at `/data/uploads/`

```bash
make backup                        # saves a timestamped .tar.gz to ./backups/
make restore FILE=backups/pluim-YYYYMMDD-HHMMSS.tar.gz
```
