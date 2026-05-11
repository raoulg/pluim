import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from pluim.config import settings
from pluim.deps import require_admin
from pluim.models import User

router = APIRouter(prefix="/api", tags=["rubrics"])


def _rubrics_dir() -> Path:
    return Path(settings.rubrics_dir)


@router.get("/rubrics")
async def list_rubrics(_: User = Depends(require_admin)) -> list[str]:
    d = _rubrics_dir()
    if not d.exists():
        return []
    return sorted(p.stem for p in d.glob("*.json") if p.is_file())


@router.get("/rubrics/{name}")
async def get_rubric(name: str, _: User = Depends(require_admin)) -> dict:
    path = _rubrics_dir() / f"{name}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Rubric not found")
    try:
        with path.open() as f:
            return json.load(f)  # type: ignore[no-any-return]
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load rubric: {exc}") from exc
