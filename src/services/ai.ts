import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // Uses api key from Vite's proxy/env map

export async function transcribeAndTranslate(
  base64Audio: string,
  mimeType: string,
  sourceLang: string,
  targetLang: string
) {
  // Strip codec specs from mimeType if present e.g. audio/webm;codecs="opus" -> audio/webm
  const cleanMimeType = mimeType.split(';')[0] || 'audio/webm';

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        {
          text: `Transcribe and translate the audio. Source: ${sourceLang}. Target: ${targetLang}. Return JSON.`,
        },
        {
          inlineData: { mimeType: cleanMimeType, data: base64Audio },
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcription: { type: Type.STRING },
          translation: { type: Type.STRING },
        },
        required: ["transcription", "translation"],
      },
    },
  });

  if (!response.text) {
    throw new Error("Failed to get transcription/translation from API.");
  }

  const result = JSON.parse(response.text);
  return result as { transcription: string; translation: string };
}

export async function generateTTSSpeech(text: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("Failed to generate TTS audio.");
  }
  return base64Audio;
}

export function playPCMAudio(base64Audio: string, sampleRate = 24000): { stop: () => void; onended: Promise<void> } {
  try {
    const binaryString = atob(base64Audio);
    const buffer = new ArrayBuffer(binaryString.length);
    const view = new DataView(buffer);
    for (let i = 0; i < binaryString.length; i++) {
        view.setUint8(i, binaryString.charCodeAt(i));
    }
    
    const length = buffer.byteLength / 2;
    const float32Array = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const int16 = view.getInt16(i * 2, true); // true = littleEndian
        float32Array[i] = int16 / 32768.0;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    let isStopped = false;
    const onended = new Promise<void>((resolve) => {
        source.onended = () => {
            if (!isStopped) {
                audioContext.close();
            }
            resolve();
        };
    });

    source.start();

    return {
        stop: () => {
            isStopped = true;
            source.stop();
            audioContext.close();
        },
        onended
    };
  } catch (error) {
    console.error("PCM Audio playback error:", error);
    throw error;
  }
}
