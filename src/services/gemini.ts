import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

function addWavHeader(pcmBase64: string, sampleRate: number = 24000): string {
  const pcmData = atob(pcmBase64);
  const buffer = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buffer);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // file length
  view.setUint32(4, 36 + pcmData.length, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // data chunk length
  view.setUint32(40, pcmData.length, true);

  // write PCM data
  for (let i = 0; i < pcmData.length; i++) {
    view.setUint8(44 + i, pcmData.charCodeAt(i));
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export interface VoiceProfile {
  samples: { text: string, audioBase64: string }[];
  description: string;
  gender: 'Masculine' | 'Feminine' | 'Neutral';
  traits: {
    pitch: number;      // 0-100
    resonance: number;  // 0-100
    brightness: number; // 0-100
    roughness: number;  // 0-100
    pace: number;       // 0-100
  };
  matchedVoice: VoiceName;
}

export async function generateTTS(text: string, profile?: VoiceProfile): Promise<string | null> {
  try {
    const cleanText = text.trim();
    if (!cleanText) return null;

    // High-precision neural styling instructions
    const styleInstruction = profile 
      ? `[NEURAL VOICE CLONING PROTOCOL]
         Target Identity: ${profile.gender}
         Vocal Signature:
         - Pitch Level: ${profile.traits.pitch}/100
         - Resonance Depth: ${profile.traits.resonance}/100
         - Timbre Brightness: ${profile.traits.brightness}/100
         - Texture Roughness: ${profile.traits.roughness}/100
         - Natural Pace: ${profile.traits.pace}/100
         - Character Note: ${profile.description}
         
         INSTRUCTION: You are the user's digital twin. Speak the following text by perfectly replicating their unique vocal DNA. 
         If Masculine, maintain a solid chest resonance. If Feminine, maintain a clear head resonance.
         Do not sound like a generic AI; sound like the specific human described above.`
      : "Speak naturally.";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ 
        parts: [{ 
          text: `${styleInstruction}\n\nText to synthesize: ${cleanText}` 
        }] 
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: profile?.matchedVoice || 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return addWavHeader(base64Audio, 24000);
    }
    return null;
  } catch (error) {
    console.error("TTS Generation Error:", error);
    return null;
  }
}

export async function trainVoiceProfile(samples: { text: string, audioBase64: string }[]): Promise<VoiceProfile> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { text: `Analyze these 3 voice samples to extract the user's unique Neural Voice DNA.
            Return a JSON object with:
            - gender: "Masculine" | "Feminine" | "Neutral"
            - traits: {
                pitch: number (0-100, where 0 is very deep, 100 is very high),
                resonance: number (0-100, where 0 is thin, 100 is deep chest resonance),
                brightness: number (0-100, where 0 is dark/muffled, 100 is bright/clear),
                roughness: number (0-100, where 0 is smooth, 100 is raspy/textured),
                pace: number (0-100, where 0 is slow, 100 is fast)
              }
            - matchedVoice: Choose the best base from [Charon, Fenrir, Puck, Kore, Zephyr]. 
              * Masculine: Charon (deep) or Fenrir (rough).
              * Feminine: Kore (clear) or Zephyr (airy).
            - description: A 1-sentence technical summary of their vocal character.` },
            ...samples.flatMap(s => [
              { text: `Sample: "${s.text}"` },
              { inlineData: { mimeType: "audio/wav", data: s.audioBase64 } }
            ])
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const result = JSON.parse(response.text || "{}");
    return {
      samples: samples,
      gender: result.gender || 'Neutral',
      traits: result.traits || { pitch: 50, resonance: 50, brightness: 50, roughness: 10, pace: 50 },
      matchedVoice: result.matchedVoice || (result.gender === 'Masculine' ? 'Charon' : 'Kore'),
      description: result.description || 'Neural DNA profile active.'
    };
  } catch (error) {
    console.error("Voice Training Error:", error);
    throw error;
  }
}
