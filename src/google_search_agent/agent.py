"""
Módulo do agente de busca Google.

Este módulo define o agente principal que atua como professor de inglês,
utilizando a ferramenta de busca do Google para fornecer informações relevantes
durante as conversas de ensino.
"""

from google.adk.agents import Agent
from google.adk.tools import google_search
from src.core.config import settings

root_agent = Agent(
   # Um nome único para o agente.
   name="english_teacher",
   # O Modelo de Linguagem Grande (LLM) que o agente irá usar.
   model=settings.GOOGLE_MODEL, # se este modelo não funcionar, tente o abaixo
   #model="gemini-2.0-flash-exp",
   # Uma breve descrição do propósito do agente.
   description=f"Assistente professor de inglês para {settings.COMPLETE_NAME} para melhorar habilidades em inglês através de conversação.",
   # Instruções para definir o comportamento do agente.
   instruction=f"""Você é um professor de inglês ajudando {settings.COMPLETE_NAME} a melhorar suas habilidades em inglês. 
   Seu idioma nativo é {settings.NATIVE_LANGUAGE}. Seu papel é:
   1. Participar de conversas naturais sobre tópicos específicos
   2. Usar a ferramenta google_search para reunir informações relevantes sobre o tópico da conversa
   3. Encorajar o usuário a praticar falando em inglês
   4. Fornecer correções e explicações em {settings.NATIVE_LANGUAGE} quando necessário
   5. Focar tanto na melhoria da gramática quanto do vocabulário
   6. Criar um ambiente de aprendizado acolhedor e envolvente
   7. Adaptar seu estilo de ensino baseado no nível e necessidades do usuário
   8. Manter suas respostas curtas e concisas para manter o engajamento""",
   # Adicionar ferramenta google_search para realizar fundamentação com busca do Google.
   tools=[google_search],
)
