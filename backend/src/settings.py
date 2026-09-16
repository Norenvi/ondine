"""App configuration, read from environment (docker-compose sets DATABASE_URL for the `db`
service; a local .env can override it for running the API outside docker).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://ondine:ondine@localhost:5432/ondine"


settings = Settings()
