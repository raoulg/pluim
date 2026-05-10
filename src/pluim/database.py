from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from pluim.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add columns introduced after initial schema creation (safe to re-run)
        for col, default in [
            ("upload_requirement", "'optional'"),
            ("url_requirement", "'optional'"),
        ]:
            try:
                await conn.exec_driver_sql(
                    f"ALTER TABLE exercises ADD COLUMN {col} VARCHAR(20) NOT NULL DEFAULT {default}"
                )
            except Exception:
                pass  # column already exists
        try:
            await conn.exec_driver_sql("ALTER TABLE grades ADD COLUMN viewed_at DATETIME")
        except Exception:
            pass  # column already exists


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
