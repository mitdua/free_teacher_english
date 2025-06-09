import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Carregar variáveis de ambiente do arquivo .env
load_dotenv()

class Settings(BaseSettings):
    """Configuração global da aplicação"""
    
    COMPLETE_NAME: str = os.getenv("COMPLETE_NAME", "Mitter")
    NATIVE_LANGUAGE: str = os.getenv("NATIVE_LANGUAGE", "Portuguese")
    GOOGLE_GENAI_USE_VERTEXAI: bool = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", False)
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    GOOGLE_MODEL: str = os.getenv("GOOGLE_MODEL", "gemini-2.0-flash-live-001")
    
    class Config:
        """Configuração para validação das configurações."""
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


# Instância global de configuração
settings = Settings()
