/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Download, 
  Settings, 
  Volume2, 
  Activity,
  User,
  Zap,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateTTS, trainVoiceProfile, VoiceName, VoiceProfile } from './services/gemini';
import { cn } from './lib/utils';

const VOICES: { id: VoiceName; label: string; desc: string }[] = [
  { id: 'Puck', label: 'Puck', desc: 'Youthful & Energetic' },
  { id: 'Charon', label: 'Charon', desc: 'Deep & Authoritative' },
  { id: 'Kore', label: 'Kore', desc: 'Calm & Clear' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Rough & Textured' },
  { id: 'Zephyr', label: 'Zephyr', desc: 'Airy & Gentle' },
];

const TRAINING_PHRASES = [
  "안녕하세요, 저는 지금 인공지능에게 제 목소리를 학습시키고 있습니다.",
  "오늘 날씨가 정말 좋네요. 산책하기 딱 좋은 날씨예요!",
  "복잡한 기술도 결국 사람을 향해야 한다고 생각합니다."
];

export default function App() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Kore');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  
  // Training State
  const [trainingStep, setTrainingStep] = useState(0); // 0: Not started, 1-3: Recording, 4: Analyzing, 5: Done
  const [samples, setSamples] = useState<{ text: string, audioBase64: string }[]>([]);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [isDbLoading, setIsDbLoading] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Load profile from DB on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch('/api/profile');
        if (res.ok) {
          const profile = await res.json();
          setVoiceProfile(profile);
          setTrainingStep(5);
          setSelectedVoice('Learned' as any);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setIsDbLoading(false);
      }
    };
    loadProfile();
  }, []);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    
    // Use the learned profile if 'Learned' is selected
    const profileToUse = (selectedVoice as string) === 'Learned' ? (voiceProfile || undefined) : undefined;

    const url = await generateTTS(text, profileToUse);
    setAudioUrl(url);
    setIsGenerating(false);
    if (url && audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          const newSamples = [...samples, { text: TRAINING_PHRASES[trainingStep - 1], audioBase64: base64data }];
          setSamples(newSamples);

          if (trainingStep < 3) {
            setTrainingStep(trainingStep + 1);
          } else {
            setTrainingStep(4); // Start Analysis
            try {
              const profile = await trainVoiceProfile(newSamples);
              setVoiceProfile(profile);
              setSelectedVoice('Learned' as any); // Explicitly select the learned voice
              setTrainingStep(5);

              // Save to DB
              await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profile)
              });
            } catch (err) {
              setMicError("Training failed. Please try again.");
              setTrainingStep(0);
            }
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError("Microphone permission denied. Please open in a new tab.");
      } else {
        setMicError("Could not access microphone.");
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  if (isDbLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#FF4444] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Panel: Voice Training Wizard */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#151619] rounded-2xl p-6 border border-white/5 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-[#FF4444]/10 flex items-center justify-center">
                <Mic className="w-5 h-5 text-[#FF4444]" />
              </div>
              <div>
                <h2 className="text-white font-mono text-sm tracking-wider uppercase">Voice Trainer</h2>
                <p className="text-[#8E9299] text-[10px] font-mono tracking-widest uppercase">Learning Protocol</p>
              </div>
            </div>

            <div className="relative aspect-square rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center overflow-hidden mb-6">
              <AnimatePresence mode="wait">
                {trainingStep === 0 && (
                  <motion.div key="start" className="flex flex-col items-center gap-4 z-10 p-6 text-center">
                    <button onClick={() => setTrainingStep(1)} className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all group">
                      <Play className="w-6 h-6 text-[#8E9299] group-hover:text-white" />
                    </button>
                    <p className="text-[#8E9299] font-mono text-[10px] uppercase tracking-widest">Start Voice Training</p>
                  </motion.div>
                )}

                {(trainingStep >= 1 && trainingStep <= 3) && (
                  <motion.div key="recording" className="flex flex-col items-center gap-4 z-10 p-6 text-center w-full">
                    <div className="mb-2">
                      <span className="text-[#FF4444] font-mono text-[10px] uppercase tracking-widest">Step {trainingStep} of 3</span>
                    </div>
                    <div className="bg-white/5 p-4 rounded-lg border border-white/10 mb-4 w-full">
                      <p className="text-white text-sm italic">"{TRAINING_PHRASES[trainingStep - 1]}"</p>
                    </div>
                    <button 
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      className={cn(
                        "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                        isRecording ? "bg-[#FF4444] glow-active" : "bg-white/10 hover:bg-white/20"
                      )}
                    >
                      {isRecording ? <Square className="w-6 h-6 text-white fill-current" /> : <Mic className="w-6 h-6 text-white" />}
                    </button>
                    <p className="text-[#8E9299] font-mono text-[10px] uppercase tracking-widest">Hold to Record</p>
                  </motion.div>
                )}

                {trainingStep === 4 && (
                  <motion.div key="analyzing" className="flex flex-col items-center gap-4 z-10 p-6 text-center">
                    <RefreshCw className="w-12 h-12 text-[#FF4444] animate-spin" />
                    <p className="text-[#8E9299] font-mono text-[10px] uppercase tracking-widest">Building Neural Profile...</p>
                  </motion.div>
                )}

                {trainingStep === 5 && voiceProfile && (
                  <motion.div key="done" className="flex flex-col items-center gap-4 z-10 p-6 w-full">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2">
                      <Activity className="w-8 h-8 text-emerald-500" />
                    </div>
                    
                    <div className="w-full space-y-4">
                      {/* Voice DNA Visualization */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[#8E9299] font-mono text-[9px] uppercase tracking-widest">Neural DNA</span>
                          <span className="text-emerald-500 font-mono text-[9px] uppercase">Cloned</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1 h-12 items-end">
                          {Object.entries(voiceProfile.traits).map(([key, value], i) => (
                            <div key={key} className="flex flex-col items-center gap-1">
                              <motion.div 
                                initial={{ height: 0 }}
                                animate={{ height: `${value}%` }}
                                className="w-full bg-emerald-500/40 rounded-t-sm border-t border-emerald-500/60"
                              />
                              <span className="text-[7px] text-[#8E9299] font-mono uppercase truncate w-full text-center">{key}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex justify-between items-center">
                          <span className="text-[#8E9299] font-mono text-[10px] uppercase">Gender</span>
                          <span className="text-white font-mono text-[10px]">{voiceProfile.gender}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[#8E9299] font-mono text-[10px] uppercase">Base Engine</span>
                          <span className="text-white font-mono text-[10px]">{voiceProfile.matchedVoice}</span>
                        </div>
                      </div>
                    </div>
                    
                    <button onClick={() => { setTrainingStep(0); setSamples([]); }} className="text-[#8E9299] hover:text-white font-mono text-[9px] uppercase tracking-widest mt-4">Retrain Neural DNA</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {micError && (
              <div className="p-3 bg-[#FF4444]/10 border border-[#FF4444]/20 rounded-lg mb-4">
                <p className="text-[#FF4444] text-[10px] font-mono uppercase text-center leading-tight">{micError}</p>
              </div>
            )}
          </div>

          <div className="bg-[#151619] rounded-2xl p-6 border border-white/5 shadow-2xl">
            <h3 className="text-white font-mono text-[10px] uppercase tracking-widest mb-4">Profile Summary</h3>
            {voiceProfile ? (
              <p className="text-[#8E9299] text-xs leading-relaxed italic">
                "{voiceProfile.description}"
              </p>
            ) : (
              <p className="text-[#8E9299] text-xs leading-relaxed opacity-50">
                Complete the 3-step training to generate your unique voice profile.
              </p>
            )}
          </div>
        </div>

        {/* Right Panel: TTS Generation */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-[#151619] rounded-2xl p-8 border border-white/5 shadow-2xl flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                  <Volume2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-white text-xl font-medium tracking-tight">Voice Synthesis</h1>
                  <div className="flex items-center gap-2">
                    <p className="text-[#8E9299] text-xs font-mono uppercase tracking-widest">
                      {voiceProfile ? "Neural Engine" : "Standard Engine"}
                    </p>
                    {selectedVoice === ('Learned' as any) && (
                      <span className="px-1.5 py-0.5 rounded bg-[#FF4444]/20 text-[#FF4444] text-[8px] font-mono uppercase tracking-widest border border-[#FF4444]/30 animate-pulse">
                        Custom Profile Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-6">
              <div className="relative group">
                <textarea 
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter text to synthesize using your learned voice profile..."
                  className="w-full h-48 bg-black/40 border border-white/5 rounded-xl p-6 text-white placeholder:text-[#8E9299]/50 focus:outline-none focus:border-[#FF4444]/50 transition-colors resize-none font-mono text-sm leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Learned Voice Option */}
                <button
                  onClick={() => voiceProfile && setSelectedVoice('Learned' as any)}
                  disabled={!voiceProfile}
                  className={cn(
                    "flex flex-col items-start p-4 rounded-xl border transition-all text-left relative overflow-hidden",
                    selectedVoice === ('Learned' as any)
                      ? "bg-[#FF4444]/10 border-[#FF4444] shadow-[0_0_20px_rgba(255,68,68,0.1)]" 
                      : !voiceProfile 
                        ? "bg-white/5 border-white/5 opacity-40 cursor-not-allowed"
                        : "bg-white/5 border-white/5 hover:border-white/20"
                  )}
                >
                  <Zap className={cn("w-4 h-4 mb-2", selectedVoice === ('Learned' as any) ? "text-[#FF4444]" : "text-[#8E9299]")} />
                  <span className={cn("text-xs font-mono uppercase tracking-widest mb-1", selectedVoice === ('Learned' as any) ? "text-white" : "text-[#8E9299]")}>
                    Learned
                  </span>
                  {!voiceProfile && <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />}
                </button>

                {VOICES.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={cn(
                      "flex flex-col items-start p-4 rounded-xl border transition-all text-left",
                      selectedVoice === voice.id 
                        ? "bg-[#FF4444]/10 border-[#FF4444] shadow-[0_0_20px_rgba(255,68,68,0.1)]" 
                        : "bg-white/5 border-white/5 hover:border-white/20"
                    )}
                  >
                    <User className={cn("w-4 h-4 mb-2", selectedVoice === voice.id ? "text-[#FF4444]" : "text-[#8E9299]")} />
                    <span className={cn("text-xs font-mono uppercase tracking-widest mb-1", selectedVoice === voice.id ? "text-white" : "text-[#8E9299]")}>
                      {voice.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-6 flex flex-col md:flex-row items-center gap-4">
                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !text.trim()}
                  className="w-full md:w-auto px-8 py-4 bg-white text-black rounded-xl font-mono text-xs uppercase tracking-[0.2em] hover:bg-[#FF4444] hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-3 group"
                >
                  {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 group-hover:fill-current" />}
                  {isGenerating ? "Synthesizing..." : "Generate Audio"}
                </button>

                {audioUrl && (
                  <div className="flex-1 w-full bg-black/40 rounded-xl p-3 flex items-center gap-4 border border-white/5">
                    <button onClick={togglePlayback} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                      {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
                    </button>
                    <div className="flex-1 h-8 flex items-center gap-1">
                      {[...Array(24)].map((_, i) => (
                        <motion.div 
                          key={i}
                          animate={isPlaying ? { height: [4, Math.random() * 24 + 4, 4] } : { height: 4 }}
                          transition={{ repeat: Infinity, duration: 0.5 + Math.random() * 0.5 }}
                          className="flex-1 bg-[#FF4444]/40 rounded-full"
                        />
                      ))}
                    </div>
                    <a href={audioUrl} download="learned-voice.wav" className="p-2 text-[#8E9299] hover:text-white transition-colors">
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} className="hidden" />
    </div>
  );
}
