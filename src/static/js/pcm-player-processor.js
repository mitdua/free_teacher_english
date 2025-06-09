/**
 * Um processador de worklet de áudio que armazena os dados de áudio PCM enviados da thread principal
 * em um buffer e os reproduz.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Inicializar buffer
    this.bufferSize = 24000 * 180;  // 24kHz x 180 segundos
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;

    // Manipular mensagens recebidas da thread principal
    this.port.onmessage = (event) => {
      // Redefinir o buffer quando a mensagem 'endOfAudio' for recebida
      if (event.data.command === 'endOfAudio') {
        this.readIndex = this.writeIndex; // Limpar o buffer
        console.log("endOfAudio recebido, limpando o buffer.");
        return;
      }

      // Decodificar os dados base64 para array int16.
      const int16Samples = new Int16Array(event.data);

      // Adicionar os dados de áudio ao buffer
      this._enqueue(int16Samples);
    };
  }

  // Empurrar dados Int16 recebidos para nosso buffer circular.
  _enqueue(int16Samples) {
    for (let i = 0; i < int16Samples.length; i++) {
      // Converter inteiro de 16 bits para float em [-1, 1]
      const floatVal = int16Samples[i] / 32768;

      // Armazenar no buffer circular apenas para canal esquerdo (mono)
      this.buffer[this.writeIndex] = floatVal;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      // Manipulação de overflow (sobrescrever amostras mais antigas)
      if (this.writeIndex === this.readIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  // O sistema chama `process()` ~128 amostras por vez (dependendo do navegador).
  // Preenchemos os buffers de saída do nosso buffer circular.
  process(inputs, outputs, parameters) {

    // Escrever um frame na saída
    const output = outputs[0];
    const framesPerBlock = output[0].length;
    for (let frame = 0; frame < framesPerBlock; frame++) {

      // Escrever a(s) amostra(s) no buffer de saída
      output[0][frame] = this.buffer[this.readIndex]; // canal esquerdo
      if (output.length > 1) {
        output[1][frame] = this.buffer[this.readIndex]; // canal direito
      }

      // Mover o índice de leitura para frente, a menos que haja underflow
      if (this.readIndex != this.writeIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }

    // Retornar true diz ao sistema para manter o processador vivo
    return true;
  }
}

registerProcessor('pcm-player-processor', PCMPlayerProcessor);

