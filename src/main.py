import os
import json
import asyncio
import base64
import warnings

from pathlib import Path
from dotenv import load_dotenv

from google.genai.types import (
    Part,
    Content,
    Blob,
    AudioTranscriptionConfig,
)

from google.adk.runners import InMemoryRunner
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


from src.google_search_agent.agent import root_agent

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

#
# Streaming ADK
#

# Carregar chave da API Gemini
load_dotenv()

APP_NAME = "Exemplo de Streaming ADK"


async def start_agent_session(user_id, is_audio=False):
    """
    Inicia uma sessão do agente.
    
    Args:
        user_id (str): ID único do usuário
        is_audio (bool): Define se a sessão deve usar modo de áudio
        
    Returns:
        tuple: Tupla contendo live_events e live_request_queue
    """

    # Criar um Runner
    runner = InMemoryRunner(
        app_name=APP_NAME,
        agent=root_agent,
    )

    # Criar uma Sessão
    session = await runner.session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,  # Substituir pelo ID real do usuário
    )

    # Definir modalidade de resposta
    modality = "AUDIO" if is_audio else "TEXT"
    
    # Configurar transcrição se estiver em modo de áudio
    transcription_config = None
    if is_audio:
        transcription_config = AudioTranscriptionConfig()
    
    run_config = RunConfig(
        response_modalities=[modality],
        output_audio_transcription=transcription_config,
        input_audio_transcription=transcription_config,
    )

    # Criar uma LiveRequestQueue para esta sessão
    live_request_queue = LiveRequestQueue()

    # Iniciar sessão do agente
    live_events = runner.run_live(
        session=session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )
    return live_events, live_request_queue


async def agent_to_client_messaging(websocket, live_events):
    """
    Comunicação do agente para o cliente.
    
    Args:
        websocket: Conexão websocket com o cliente
        live_events: Stream de eventos do agente
    """
    while True:
        async for event in live_events:

            # Se o turno estiver completo ou interrompido, enviar
            if event.turn_complete or event.interrupted:
                message = {
                    "turn_complete": event.turn_complete,
                    "interrupted": event.interrupted,
                }
                await websocket.send_text(json.dumps(message))
                print(f"[AGENTE PARA CLIENTE]: {message}")
                continue

            # Ler o Conteúdo e sua primeira Parte
            part: Part = (
                event.content and event.content.parts and event.content.parts[0]
            )
            if not part:
                continue

            # Verificar transcrição de áudio (NOVO)
            if hasattr(event, 'output_audio_transcription') and event.output_audio_transcription:
                transcription_message = {
                    "mime_type": "audio/transcription",
                    "data": event.output_audio_transcription,
                    "source": "agent"
                }
                await websocket.send_text(json.dumps(transcription_message))
                print(f"[TRANSCRIÇÃO DO AGENTE]: {event.output_audio_transcription}")

            # Se for áudio, enviar dados de áudio codificados em Base64
            is_audio = part.inline_data and part.inline_data.mime_type.startswith("audio/pcm")
            if is_audio:
                audio_data = part.inline_data and part.inline_data.data
                if audio_data:
                    message = {
                        "mime_type": "audio/pcm",
                        "data": base64.b64encode(audio_data).decode("ascii")
                    }
                    await websocket.send_text(json.dumps(message))
                    print(f"[AGENTE PARA CLIENTE]: audio/pcm: {len(audio_data)} bytes.")
                    continue

            # Se for texto e um texto parcial, enviar
            if part.text and event.partial:
                message = {
                    "mime_type": "text/plain",
                    "data": part.text
                }
                await websocket.send_text(json.dumps(message))
                print(f"[AGENTE PARA CLIENTE]: text/plain: {message}")


async def client_to_agent_messaging(websocket, live_request_queue):
    """
    Comunicação do cliente para o agente.
    
    Args:
        websocket: Conexão websocket com o cliente
        live_request_queue: Fila de requisições ao vivo para o agente
    """
    while True:
        # Decodificar mensagem JSON
        message_json = await websocket.receive_text()
        message = json.loads(message_json)
        mime_type = message["mime_type"]
        data = message["data"]

        # Enviar a mensagem para o agente
        if mime_type == "text/plain":
            # Enviar uma mensagem de texto
            content = Content(role="user", parts=[Part.from_text(text=data)])
            live_request_queue.send_content(content=content)
            print(f"[CLIENTE PARA AGENTE]: {data}")
        elif mime_type == "audio/pcm":
            # Enviar dados de áudio
            decoded_data = base64.b64decode(data)
            live_request_queue.send_realtime(Blob(data=decoded_data, mime_type=mime_type))
        else:
            raise ValueError(f"Tipo MIME não suportado: {mime_type}")


#
# Aplicação web FastAPI
#

app = FastAPI()

STATIC_DIR = Path("src/static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    """
    Serve o arquivo index.html.
    
    Returns:
        FileResponse: Resposta com o arquivo HTML principal
    """
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int, is_audio: str):
    """
    Endpoint websocket do cliente.
    
    Args:
        websocket (WebSocket): Conexão websocket
        user_id (int): ID do usuário
        is_audio (str): String indicando se deve usar modo de áudio ("true"/"false")
    """

    # Aguardar conexão do cliente
    await websocket.accept()
    print(f"Cliente #{user_id} conectado, modo de áudio: {is_audio}")

    # Iniciar sessão do agente
    user_id_str = str(user_id)
    live_events, live_request_queue = await start_agent_session(user_id_str, is_audio == "true")

    # Iniciar tarefas
    agent_to_client_task = asyncio.create_task(
        agent_to_client_messaging(websocket, live_events)
    )
    client_to_agent_task = asyncio.create_task(
        client_to_agent_messaging(websocket, live_request_queue)
    )

    # Aguardar até que o websocket seja desconectado ou ocorra um erro
    tasks = [agent_to_client_task, client_to_agent_task]
    await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)

    # Fechar LiveRequestQueue
    live_request_queue.close()

    # Desconectado
    print(f"Cliente #{user_id} desconectado")
