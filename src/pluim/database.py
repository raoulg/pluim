from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from pluim.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create all tables. Assumes a clean (new) database."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def migrate_db() -> None:
    """Add columns introduced after the initial schema. Safe to re-run on any DB."""
    _migrations = [
        "ALTER TABLE exercises ADD COLUMN upload_requirement VARCHAR(20) NOT NULL DEFAULT 'optional'",
        "ALTER TABLE exercises ADD COLUMN url_requirement VARCHAR(20) NOT NULL DEFAULT 'optional'",
        "ALTER TABLE grades ADD COLUMN viewed_at DATETIME",
        "ALTER TABLE exercises ADD COLUMN rubric_template TEXT",
        "ALTER TABLE grades ADD COLUMN rubric_scores TEXT",
        "ALTER TABLE grades ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT 1",
    ]
    async with engine.begin() as conn:
        for sql in _migrations:
            try:
                await conn.exec_driver_sql(sql)
            except Exception:
                pass  # column already exists


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
