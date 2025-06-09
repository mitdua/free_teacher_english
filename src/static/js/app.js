/**
* Copyright 2025 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

/**
 * app.js: Código JS para a aplicação de exemplo adk-streaming.
 */

/**
 * Manipulação de WebSocket
 */

// Conectar o servidor com uma conexão WebSocket
const sessionId = Math.random().toString().substring(10);
const ws_url =
  "ws://" + window.location.host + "/ws/" + sessionId;
let websocket = null;
let is_audio = false;

// Obter elementos DOM
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
let currentMessageId = null;

// Manipuladores WebSocket
function connectWebsocket() {
  // Conectar websocket
  websocket = new WebSocket(ws_url + "?is_audio=" + is_audio);

  // Manipular abertura de conexão
  websocket.onopen = function () {
    // Mensagens de conexão aberta
    console.log("Conexão WebSocket aberta.");
    document.getElementById("messages").textContent = "Conexão aberta";

    // Habilitar o botão Enviar
    document.getElementById("sendButton").disabled = false;
    addSubmitHandler();
  };

  // Manipular mensagens recebidas
  websocket.onmessage = function (event) {
    const message = JSON.parse(event.data);
    const mimeType = message.mime_type;
    const data = message.data;

    console.log("[AGENTE PARA CLIENTE] ", message);

    // Verificar se o turno está completo
    // se turno completo, adicionar nova mensagem
    if (
      message.turn_complete &&
      message.turn_complete == true
    ) {
      currentMessageId = null;
      return;
    }

    // Verificar mensagem de interrupção
    if (
      message.interrupted &&
      message.interrupted === true
    ) {
      // Parar reprodução de áudio se estiver tocando
      if (audioPlayerNode) {
        audioPlayerNode.port.postMessage({ command: "endOfAudio" });
      }
      return;
    }

    // Se for áudio, reproduzir
    if (mimeType == "audio/pcm" && audioPlayerNode) {
      audioPlayerNode.port.postMessage(base64ToArray(data));
    }

    // Se for texto, imprimir
    if (mimeType == "text/plain") {
      // adicionar uma nova mensagem para um novo turno
      if (currentMessageId == null) {
        currentMessageId = Math.random().toString(36).substring(7);
        const messageElement = document.createElement("p");
        messageElement.id = currentMessageId;
        // Anexar o elemento de mensagem ao messagesDiv
        messagesDiv.appendChild(messageElement);
      }

      // Adicionar texto da mensagem ao elemento de mensagem existente
      const messageElement = document.getElementById(currentMessageId);
      messageElement.textContent += data;

      // Rolar para baixo até o final do messagesDiv
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // NOVO: Manipular transcrições de áudio
    if (mimeType === "audio/transcription") {
        displayTranscription(data, message.source || "agent");
        return;
    }
  };

  // Manipular fechamento de conexão
  websocket.onclose = function () {
    console.log("Conexão WebSocket fechada.");
    document.getElementById("sendButton").disabled = true;
    document.getElementById("messages").textContent = "Conexão fechada";
    setTimeout(function () {
      console.log("Reconectando...");
      connectWebsocket();
    }, 5000);
  };

  websocket.onerror = function (e) {
    console.log("Erro WebSocket: ", e);
  };
}
connectWebsocket();

// Adicionar manipulador de envio ao formulário
function addSubmitHandler() {
  messageForm.onsubmit = function (e) {
    e.preventDefault();
    const message = messageInput.value;
    if (message) {
      const p = document.createElement("p");
      p.textContent = "> " + message;
      messagesDiv.appendChild(p);
      messageInput.value = "";
      sendMessage({
        mime_type: "text/plain",
        data: message,
      });
      console.log("[CLIENTE PARA AGENTE] " + message);
    }
    return false;
  };
}

// Enviar uma mensagem para o servidor como string JSON
function sendMessage(message) {
  if (websocket && websocket.readyState == WebSocket.OPEN) {
    const messageJson = JSON.stringify(message);
    websocket.send(messageJson);
  }
}

// Decodificar dados Base64 para Array
function base64ToArray(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Manipulação de áudio
 */

let audioPlayerNode;
let audioPlayerContext;
let audioRecorderNode;
let audioRecorderContext;
let micStream;

// Buffer de áudio para intervalos de 0.2s
let audioBuffer = [];
let bufferTimer = null;

// Importar os worklets de áudio
import { startAudioPlayerWorklet } from "./audio-player.js";
import { startAudioRecorderWorklet } from "./audio-recorder.js";

// Iniciar áudio
function startAudio() {
  // Iniciar saída de áudio
  startAudioPlayerWorklet().then(([node, ctx]) => {
    audioPlayerNode = node;
    audioPlayerContext = ctx;
  });
  // Iniciar entrada de áudio
  startAudioRecorderWorklet(audioRecorderHandler).then(
    ([node, ctx, stream]) => {
      audioRecorderNode = node;
      audioRecorderContext = ctx;
      micStream = stream;
    }
  );
}

// Iniciar o áudio somente quando o usuário clicar no botão
// (devido ao requisito de gesto para a API Web Audio)
const startAudioButton = document.getElementById("startAudioButton");
startAudioButton.addEventListener("click", () => {
  startAudioButton.disabled = true;
  startAudio();
  is_audio = true;
  connectWebsocket(); // reconectar com o modo de áudio
});

// Manipulador do gravador de áudio
function audioRecorderHandler(pcmData) {
  // Adicionar dados de áudio ao buffer
  audioBuffer.push(new Uint8Array(pcmData));
  
  // Iniciar timer se não estiver executando
  if (!bufferTimer) {
    bufferTimer = setInterval(sendBufferedAudio, 200); // 0.2 segundos
  }
}

// Enviar dados de áudio em buffer a cada 0.2 segundos
function sendBufferedAudio() {
  if (audioBuffer.length === 0) {
    return;
  }
  
  // Calcular comprimento total
  let totalLength = 0;
  for (const chunk of audioBuffer) {
    totalLength += chunk.length;
  }
  
  // Combinar todos os chunks em um único buffer
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioBuffer) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Enviar os dados de áudio combinados
  sendMessage({
    mime_type: "audio/pcm",
    data: arrayBufferToBase64(combinedBuffer.buffer),
  });
  console.log("[CLIENTE PARA AGENTE] enviou %s bytes", combinedBuffer.byteLength);
  
  // Limpar o buffer
  audioBuffer = [];
}

// Parar gravação de áudio e limpeza
function stopAudioRecording() {
  if (bufferTimer) {
    clearInterval(bufferTimer);
    bufferTimer = null;
  }
  
  // Enviar qualquer áudio restante no buffer
  if (audioBuffer.length > 0) {
    sendBufferedAudio();
  }
}

// Codificar um array buffer com Base64
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Nova função para mostrar transcrições
function displayTranscription(transcriptionText, source) {
    const messagesDiv = document.getElementById('messages');
    
    // Remover a mensagem de placeholder se existir
    const placeholder = messagesDiv.querySelector('.text-center.text-white-50');
    if (placeholder) {
        placeholder.remove();
    }

    const transcriptionElement = document.createElement('div');
    transcriptionElement.className = `message-bubble ${source}-transcription`;
    
    // Estilo diferente para transcrições
    transcriptionElement.innerHTML = `
        <div class="transcription-header">
            <i class="bi bi-soundwave me-2"></i>
            <small>Transcrição ${source === 'agent' ? 'do agente' : 'do usuário'}</small>
        </div>
        <div class="transcription-text">${transcriptionText}</div>
    `;

    messagesDiv.appendChild(transcriptionElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
