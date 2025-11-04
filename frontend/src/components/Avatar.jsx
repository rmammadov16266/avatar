import { useEffect, useRef, useState } from 'react';

// Animated avatar whose mouth reacts to audio volume while speaking
export default function Avatar({ isSpeaking, audioRef }) {
  const animationFrameRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const [mouthOpen, setMouthOpen] = useState(0); // 0..1

  useEffect(() => {
    const audioEl = audioRef?.current;
    if (!audioEl) return;

    // Lazily create an analyser connected to the audio element
    if (!audioContextRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const source = ctx.createMediaElementSource(audioEl);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        sourceNodeRef.current = source;
      } catch (_) {
        // WebAudio may fail (e.g., autoplay policies). We'll fall back to CSS pulse.
      }
    }

    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      // Compute RMS to estimate loudness
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128; // -1..1
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length); // 0..~1
      // Smooth and clamp
      const open = Math.min(1, Math.max(0, rms * 3));
      setMouthOpen(prev => prev * 0.7 + open * 0.3);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    if (isSpeaking) {
      // Resume audio context in case it's suspended by browser policy
      audioContextRef.current?.resume?.();
      animationFrameRef.current = requestAnimationFrame(tick);
    } else {
      setMouthOpen(0);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isSpeaking, audioRef]);

  // Map mouthOpen 0..1 to curvature/padding values
  const curve = 5 + mouthOpen * 8; // bigger => wider open curve
  const stroke = '#1e293b'; // slate-800

  return (
    <div className="relative">
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center transition-transform duration-300">
        <div className="relative">
          {/* Ears/Hair triangles */}
          <div className="absolute -top-8 -left-6 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-b-[30px] border-b-amber-600" />
          <div className="absolute -top-8 -right-6 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-b-[30px] border-b-amber-600" />

          {/* Face */}
          <div className="text-6xl">
            {/* Eyes */}
            <div className="flex gap-4 justify-center mb-2">
              <div className="w-3 h-3 bg-slate-800 rounded-full" />
              <div className="w-3 h-3 bg-slate-800 rounded-full" />
            </div>
            {/* Nose */}
            <div className="flex justify-center mb-1">
              <div className="w-2 h-2 bg-pink-600 rounded-full" />
            </div>
            {/* Mouth (SVG curve driven by mouthOpen) */}
            <div className="flex justify-center">
              <svg width="40" height="20" viewBox="0 0 40 20" fill="none">
                <path d={`M5 5 Q20 ${10 + curve} 35 5`} stroke={stroke} strokeWidth="2" fill="none" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Fallback subtle pulse when speaking if analyser unavailable */}
      <div className={`absolute inset-0 rounded-full ${isSpeaking ? 'animate-pulse' : ''}`} style={{ pointerEvents: 'none' }} />
    </div>
  );
}


