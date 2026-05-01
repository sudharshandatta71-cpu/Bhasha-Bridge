import { useState, useRef } from "react";
import { Mic, Square, Loader2, Play, CircleArrowRight, Globe2 } from "lucide-react";
import { transcribeAndTranslate, generateTTSSpeech, playPCMAudio } from "./services/ai";

const LANGUAGES = [
  "Hindi", "Bengali", "Telugu", "Marathi", "Tamil", "Urdu",
  "Gujarati", "Kannada", "Odia", "Punjabi", "Malayalam", "Assamese",
  "Maithili", "Santali", "Kashmiri", "Nepali", "Sindhi", "Dogri", "Konkani",
  "Manipuri", "Bodo", "Sanskrit", "English", "Spanish", "French", "German",
  "Chinese", "Japanese", "Arabic", "Russian"
];

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64Data = reader.result.split(',')[1];
        resolve(base64Data);
      } else {
        reject(new Error("Failed to read blob"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

interface TranslationResult {
  transcription: string;
  translation: string;
  audioBase64: string;
}

export default function App() {
  const [sourceLang, setSourceLang] = useState("Hindi");
  const [targetLang, setTargetLang] = useState("English");
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentPlaybackRef = useRef<{ stop: () => void } | null>(null);

  const startRecording = async () => {
    setErrorMsg("");
    setResult(null);
    if (currentPlaybackRef.current) {
        currentPlaybackRef.current.stop();
        currentPlaybackRef.current = null;
        setIsPlaying(false);
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
            setIsProcessing(true);
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            const base64Audio = await blobToBase64(blob);
            
            // 1. Transcribe & Translate
            const translatedData = await transcribeAndTranslate(base64Audio, mimeType, sourceLang, targetLang);
            
            // Show text result immediately before TTS is ready
            setResult({
                 transcription: translatedData.transcription,
                 translation: translatedData.translation,
                 audioBase64: ""
            });
            setIsProcessing(false); // Ends loading state, shows text immediately
            
            // 2. Generate TTS Speech
            const ttsAudioBase64 = await generateTTSSpeech(translatedData.translation);
            
            setResult(prev => prev ? { ...prev, audioBase64: ttsAudioBase64 } : null);
            
            // Play immediately when audio is ready
            handlePlay(ttsAudioBase64);
        } catch (err: any) {
             setErrorMsg(err.message || "Failed to process audio.");
             setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setErrorMsg("Microphone access denied or error occurred.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
      if (isRecording) {
          stopRecording();
      } else {
          startRecording();
      }
  };

  const handlePlay = async (audioBase64: string) => {
    if (isPlaying && currentPlaybackRef.current) {
         currentPlaybackRef.current.stop();
         currentPlaybackRef.current = null;
         setIsPlaying(false);
         return;
    }
  
    try {
        setIsPlaying(true);
        const playback = playPCMAudio(audioBase64);
        currentPlaybackRef.current = playback;
        await playback.onended;
        setIsPlaying(false);
        currentPlaybackRef.current = null;
    } catch (err) {
        console.error("Playback error:", err);
        setIsPlaying(false);
    }
  };

  // Swap languages
  const swapLanguages = () => {
      const temp = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(temp);
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc] flex flex-col items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-2xl text-center mb-8">
         <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-2xl shadow-sm mb-4">
             <Globe2 className="w-6 h-6 text-blue-600" />
         </div>
         <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">Bhasha Bridge</h1>
         <p className="text-gray-500 font-medium">Universal AI Voice Translator</p>
      </div>

      <div className="w-full max-w-2xl glass-card p-6 sm:p-10 flex flex-col gap-8">
        
        {/* Language Selectors */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative">
           <div className="flex flex-col w-full text-left">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2 mb-2">From</label>
              <select 
                className="w-full bg-[#f0f4f8] border-transparent rounded-2xl px-5 py-4 text-gray-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer appearance-none"
                value={sourceLang}
                onChange={e => setSourceLang(e.target.value)}
              >
                  {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
              </select>
           </div>
           
           <button 
               onClick={swapLanguages} 
               className="p-3 mt-4 sm:mt-6 bg-white border border-gray-100 shadow-sm rounded-full text-gray-400 hover:text-blue-600 transition-colors z-10 shrink-0"
           >
               <CircleArrowRight className="w-6 h-6 rotate-90 sm:rotate-0" />
           </button>

           <div className="flex flex-col w-full text-left">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2 mb-2">To</label>
              <select 
                className="w-full bg-[#eef2ff] border-transparent rounded-2xl px-5 py-4 text-blue-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer appearance-none"
                value={targetLang}
                onChange={e => setTargetLang(e.target.value)}
              >
                  {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
              </select>
           </div>
        </div>

        {/* Record Button */}
        <div className="flex flex-col items-center justify-center py-10">
             {isProcessing ? (
                 <div className="flex flex-col items-center gap-5 text-blue-600 py-4">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <span className="text-sm font-semibold tracking-wide">Translating to {targetLang}...</span>
                 </div>
             ) : (
                 <button
                    onClick={toggleRecording}
                    className={`relative flex items-center justify-center w-28 h-28 rounded-full transition-all duration-300 ${
                        isRecording 
                        ? "bg-red-500 text-white pulsing-record scale-105" 
                        : "bg-blue-600 hover:bg-blue-700 text-white shadow-[0_8px_30px_rgb(37,99,235,0.3)] hover:shadow-[0_12px_40px_rgb(37,99,235,0.4)] hover:-translate-y-1"
                    }`}
                 >
                    {isRecording ? <Square className="w-10 h-10 fill-current" /> : <Mic className="w-12 h-12" />}
                 </button>
             )}
             
             {!isProcessing && (
                <p className="mt-8 text-sm text-gray-400 font-bold tracking-widest uppercase">
                   {isRecording ? "Tap to finish" : "Tap to speak"}
                </p>
             )}
        </div>

        {errorMsg && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm text-center font-medium">
               {errorMsg}
            </div>
        )}

        {/* Results */}
        {result && !isProcessing && (
            <div className="mt-2 pt-6 border-t border-gray-100/60 flex flex-col gap-6">
                 <div className="flex items-start gap-4">
                     <div className="bg-gray-100/80 p-3.5 rounded-2xl shrink-0 mt-1">
                         <Mic className="w-5 h-5 text-gray-500" />
                     </div>
                     <div>
                         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{sourceLang}</p>
                         <p className="text-gray-700 text-lg leading-relaxed font-medium">{result.transcription}</p>
                     </div>
                 </div>

                 <div className="flex items-start gap-4 p-4 -ml-4 -mr-4 sm:ml-0 sm:mr-0 sm:rounded-2xl bg-[#f8faff]">
                     <button 
                         onClick={() => result.audioBase64 && handlePlay(result.audioBase64)}
                         disabled={!result.audioBase64}
                         className={`p-3.5 rounded-2xl shrink-0 transition-colors mt-1 ${
                              !result.audioBase64 ? 'bg-blue-100 text-blue-400 cursor-not-allowed opacity-70' :
                              isPlaying ? 'bg-blue-100 text-blue-600 shadow-inner' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                         }`}
                     >
                         {!result.audioBase64 ? (
                             <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                         ) : isPlaying ? (
                             <Square className="w-5 h-5 fill-current" />
                         ) : (
                             <Play className="w-5 h-5 fill-current ml-0.5" />
                         )}
                     </button>
                     <div className="pl-1">
                         <p className="text-[10px] font-bold text-blue-500/80 uppercase tracking-widest mb-1.5">{targetLang}</p>
                         <p className="text-gray-900 font-semibold text-xl leading-relaxed">{result.translation}</p>
                     </div>
                 </div>
            </div>
        )}

      </div>
      
      <p className="mt-12 text-xs font-semibold text-gray-400 tracking-wider">
        Powered by Google Gemini
      </p>
    </div>
  );
}
