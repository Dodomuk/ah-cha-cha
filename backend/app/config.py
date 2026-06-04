from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/ahchacha"
    claude_api_key: str = ""
    internal_api_key: str = "dev-internal-key"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "*"]
    test_mode: bool = True
    alpha_vantage_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
