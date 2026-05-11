import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pluim.config import settings
from pluim.database import init_db, migrate_db
from pluim.routers import admin, auth, courses, exercises, grades, rubrics, submissions


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.upload_dir, exist_ok=True)
    await init_db()
    await migrate_db()
    yield


app = FastAPI(title="Canvas", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(exercises.router)
app.include_router(submissions.router)
app.include_router(grades.router)
app.include_router(rubrics.router)
app.include_router(admin.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
