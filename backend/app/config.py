from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/ahchacha"
    claude_api_key: str = ""
    internal_api_key: str = "dev-internal-key"
    cors_origins: list[str] = ["http://localhost:3000", "https://ah-cha-cha.vercel.app", "https://ahchacha.com", "https://www.ahchacha.com"]
    test_mode: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
