import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Mic, MicOff, Volume2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import './App.css';
import Avatar from './components/Avatar';

const API_URL = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [botResponse, setBotResponse] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const recordingStartTimeRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const mimeTypeRef = useRef('audio/webm');

  useEffect(() => {
    // Request microphone permission on mount
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => console.log('Microphone access granted'))
      .catch(() => toast.error('Microphone access denied'));
  }, []);

  const startRecording = async () => {
    try {
      // Request high-quality audio with better constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1,
        }
      });
      
      // Determine the best MIME type for the browser
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav'
      ];
      
      let selectedMimeType = 'audio/webm';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      
      mimeTypeRef.current = selectedMimeType;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const selectedType = mimeTypeRef.current;
        const blobType = selectedType.includes('webm') ? 'audio/webm' : 
                        selectedType.includes('ogg') ? 'audio/ogg' :
                        selectedType.includes('mp4') ? 'audio/mp4' : 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        
        // Validate that we actually recorded something
        if (audioBlob.size < 1000) {
          toast.error('Recording too short. Please speak longer.');
          setIsProcessing(false);
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100); // Collect data every 100ms for better reliability
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      toast.success('Recording started - speak clearly');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      const recordingDuration = recordingStartTimeRef.current 
        ? Date.now() - recordingStartTimeRef.current 
        : 0;
      
      // Ensure minimum recording duration of 500ms
      if (recordingDuration < 500) {
        toast.error('Recording too short. Please speak for at least half a second.');
        setTimeout(() => {
          if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            recordingStartTimeRef.current = null;
          }
        }, 500 - recordingDuration);
        return;
      }
      
      console.log(`Recording stopped. Duration: ${recordingDuration}ms`);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      recordingStartTimeRef.current = null;
    }
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);

    try {
      // Log audio blob info for debugging
      console.log('Audio blob info:', {
        size: audioBlob.size,
        type: audioBlob.type,
        duration: audioBlob.duration || 'unknown'
      });
      
      // Step 1: Transcribe audio
      const formData = new FormData();
      // Determine file extension based on blob type
      let filename = 'audio.webm';
      if (audioBlob.type.includes('ogg')) filename = 'audio.ogg';
      else if (audioBlob.type.includes('mp4')) filename = 'audio.m4a';
      else if (audioBlob.type.includes('wav')) filename = 'audio.wav';
      
      formData.append('file', audioBlob, filename);

      console.log('Sending audio for transcription:', { filename, size: audioBlob.size });
      
      const transcribeResponse = await axios.post(`${API_URL}/transcribe`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      console.log('Transcription response:', transcribeResponse.data);

      const userText = transcribeResponse.data.transcription;
      setTranscription(userText);

      if (!userText || userText.trim() === '') {
        toast.error('No speech detected');
        setIsProcessing(false);
        return;
      }

      // Step 2: Get chat response
      const chatResponse = await axios.post(`${API_URL}/chat`, { text: userText });
      const botText = chatResponse.data.response;
      setBotResponse(botText);

      // Step 3: Convert response to speech and play
      const ttsResponse = await axios.post(`${API_URL}/speak`, { text: botText }, {
        responseType: 'blob'
      });

      const audioUrl = URL.createObjectURL(ttsResponse.data);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
        setIsPlaying(true);
      }

    } catch (error) {
      console.error('Error processing audio:', error);
      toast.error(error.response?.data?.detail || 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  return (
    <div className="App">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-8">
          {/* Header */}
          <div className="text-center space-y-3">
            <h1 className="text-5xl font-bold text-slate-800">
              Voice Bot
            </h1>
            <p className="text-lg text-slate-600">
              Click the microphone to speak with your AI assistant
            </p>
          </div>

          {/* Main Card */
          }
          <div className="border-none shadow-2xl bg-white/70 backdrop-blur-md rounded-lg p-8 space-y-6">
            {/* Avatar */}
            <div className="flex justify-center">
              <Avatar isSpeaking={isPlaying} audioRef={audioRef} />
            </div>
            {/* Microphone Button */}
            <div className="flex justify-center">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`w-32 h-32 rounded-full transition-all duration-300 shadow-lg flex items-center justify-center ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 scale-110 animate-pulse'
                    : 'bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isProcessing ? (
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-12 h-12 text-white" />
                ) : (
                  <Mic className="w-12 h-12 text-white" />
                )}
              </button>
            </div>

            {/* Status Text */}
            <div className="text-center">
              {isRecording && (
                <p className="text-red-600 font-medium animate-pulse">
                  Recording... Click again to stop
                </p>
              )}
              {isProcessing && (
                <p className="text-blue-600 font-medium">
                  Processing your message...
                </p>
              )}
              {isPlaying && (
                <div className="flex items-center justify-center gap-2 text-indigo-600 font-medium">
                  <Volume2 className="w-5 h-5 animate-pulse" />
                  Playing response...
                </div>
              )}
            </div>

            {/* Transcription Display */}
            {transcription && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  You said:
                </h3>
                <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                  <p className="text-slate-800">{transcription}</p>
                </div>
              </div>
            )}

            {/* Bot Response Display */}
            {botResponse && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  Assistant:
                </h3>
                <div className="p-4 bg-indigo-50 rounded-lg border-l-4 border-indigo-500">
                  <p className="text-slate-800">{botResponse}</p>
                </div>
              </div>
            )}
          </div>

          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            onEnded={handleAudioEnded}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
