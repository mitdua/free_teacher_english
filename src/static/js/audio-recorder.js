/**
 * Worklet do Gravador de Áudio
 */

let micStream;

export async function startAudioRecorderWorklet(audioRecorderHandler) {
  // Criar um AudioContext
  const audioRecorderContext = new AudioContext({ sampleRate: 16000 });
  console.log("Taxa de amostragem do AudioContext:", audioRecorderContext.sampleRate);

  // Carregar o módulo AudioWorklet
  const workletURL = new URL("./pcm-recorder-processor.js", import.meta.url);
  await audioRecorderContext.audioWorklet.addModule(workletURL);

  // Solicitar acesso ao microfone
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1 },
  });
  const source = audioRecorderContext.createMediaStreamSource(micStream);

  // Criar um AudioWorkletNode que usa o PCMProcessor
  const audioRecorderNode = new AudioWorkletNode(
    audioRecorderContext,
    "pcm-recorder-processor"
  );

  // Conectar a fonte do microfone ao worklet.
  source.connect(audioRecorderNode);
  audioRecorderNode.port.onmessage = (event) => {
    // Converter para PCM 16-bit
    const pcmData = convertFloat32ToPCM(event.data);

    // Enviar os dados PCM para o manipulador.
    audioRecorderHandler(pcmData);
  };
  return [audioRecorderNode, audioRecorderContext, micStream];
}

/**
 * Parar o microfone.
 */
export function stopMicrophone(micStream) {
  micStream.getTracks().forEach((track) => track.stop());
  console.log("stopMicrophone(): Microfone parado.");
}

// Converter amostras Float32 para PCM 16-bit.
function convertFloat32ToPCM(inputData) {
  // Criar um Int16Array do mesmo comprimento.
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    // Multiplicar por 0x7fff (32767) para escalar o valor float para a faixa PCM 16-bit.
    pcm16[i] = inputData[i] * 0x7fff;
  }
  // Retornar o ArrayBuffer subjacente.
  return pcm16.buffer;
}
