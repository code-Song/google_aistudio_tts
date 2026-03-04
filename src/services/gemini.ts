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
    pitch: string;
    resonance: string;
    nasality: string;
    texture: string;
  };
  matchedVoice: VoiceName;
}

export async function generateTTS(text: string, profile?: VoiceProfile): Promise<string | null> {
  try {
    const cleanText = text.trim();
    if (!cleanText) return null;

    // Use the profile to "style" the delivery instructions with high precision
    const styleInstruction = profile 
      ? `[NEURAL VOICE CLONING ACTIVE]
         Target Voice Signature:
         - Gender: ${profile.gender}
         - Pitch Level: ${profile.traits.pitch}
         - Resonance: ${profile.traits.resonance}
         - Nasality: ${profile.traits.nasality}
         - Texture: ${profile.traits.texture}
         - Character: ${profile.description}
         
         INSTRUCTION: You must strictly mimic the user's voice signature above. 
         If gender is Masculine, use a deep, resonant male tone. 
         If gender is Feminine, use a clear, melodic female tone.
         Do not deviate from the user's vocal identity.`
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
            // Use the matched base voice that best fits the user's gender
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
            { text: `Analyze these 3 voice samples to create a high-fidelity neural voice profile.
            Return a JSON object with:
            - gender: "Masculine" | "Feminine" | "Neutral"
            - traits: {
                pitch: "Deep" | "Medium" | "High",
                resonance: "Chest" | "Head" | "Mixed",
                nasality: "Low" | "Medium" | "High",
                texture: "Smooth" | "Raspy" | "Breathy"
              }
            - matchedVoice: Choose the best base from [Charon, Fenrir, Puck, Kore, Zephyr]. 
              * CRITICAL: If Masculine, MUST choose Charon or Fenrir.
              * CRITICAL: If Feminine, MUST choose Kore or Zephyr.
            - description: A technical summary of the user's unique vocal identity.` },
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
      traits: result.traits || { pitch: 'Medium', resonance: 'Mixed', nasality: 'Low', texture: 'Smooth' },
      matchedVoice: result.matchedVoice || (result.gender === 'Masculine' ? 'Charon' : 'Kore'),
      description: result.description || 'Neural profile active.'
    };
  } catch (error) {
    console.error("Voice Training Error:", error);
    throw error;
  }
}
