/**
 * Worklet do Player de Áudio
 */

export async function startAudioPlayerWorklet() {
    // 1. Criar um AudioContext
    const audioContext = new AudioContext({
        sampleRate: 24000
    });
    
    
    // 2. Carregar seu código de processador customizado
    const workletURL = new URL('./pcm-player-processor.js', import.meta.url);
    await audioContext.audioWorklet.addModule(workletURL);
    
    // 3. Criar um AudioWorkletNode   
    const audioPlayerNode = new AudioWorkletNode(audioContext, 'pcm-player-processor');

    // 4. Conectar ao destino
    audioPlayerNode.connect(audioContext.destination);

    // O audioPlayerNode.port é como enviamos mensagens (dados de áudio) para o processador
    return [audioPlayerNode, audioContext];
}
