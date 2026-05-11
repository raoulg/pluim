from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    github_client_id: str = ""
    github_client_secret: str = ""
    secret_key: str = "dev-secret-key-change-in-production"
    dev_mode: bool = False
    dev_admin_username: str = "localdev"
    dev_user_username: str = "testuser"
    frontend_url: str = "http://localhost:3000"
    database_url: str = "sqlite+aiosqlite:////data/db/canvas.db"
    upload_dir: str = "/data/uploads"
    max_upload_size_mb: int = 50
    admin_github_usernames: str = ""  # comma-separated list of initial admins
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 168  # 1 week

    @property
    def initial_admins(self) -> list[str]:
        return [u.strip() for u in self.admin_github_usernames.split(",") if u.strip()]


settings = Settings()
