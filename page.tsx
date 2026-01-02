'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, Button, Input } from '@/components/ui-elements';
import { analyzeTranscript } from '@/lib/gemini';
import { videoProcessor } from '@/lib/ffmpeg';
import { Upload, Sparkles, AlertCircle } from 'lucide-react';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState('');
  const [transcript, setTranscript] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  
  // Create a reference to the worker
  const worker = useRef<Worker | null>(null);

  // Initialize the Whisper Worker on load
  useEffect(() => {
    if (!worker.current) {
      // We assume the worker file is at /worker/transcribe.ts relative to the project root
      // Next.js handles the import.meta.url magic
      worker.current = new Worker(new URL('../worker/transcribe.ts', import.meta.url), { type: 'module' });
      
      worker.current.addEventListener('message', (e) => {
        const { status, output, data } = e.data;
        if (status === 'progress') {
            setLogs(`Transcribing... ${Math.round(data?.progress || 0)}%`);
        }
        if (status === 'complete') {
          setTranscript(output.text);
          setStatus('analyzing');
          setLogs('Analyzing with Gemini...');
          processWithGemini(output.text);
        }
      });
    }
  }, []);

  const processWithGemini = async (text: string) => {
    try {
      const result = await analyzeTranscript(apiKey, text);
      setAnalysis(result);
      setStatus('clipping');
      setLogs('Generating Clips (this may take a moment)...');
      
      if (file && result.viral_clips) {
        const generatedClips = [];
        for (const clip of result.viral_clips) {
            // Cut the video in the browser
            const url = await videoProcessor.clipVideo(file, clip.start_time, clip.end_time);
            generatedClips.push({ ...clip, url });
        }
        setClips(generatedClips);
      }
      setStatus('complete');
    } catch (err) { 
        console.error(err); 
        setStatus('idle'); 
        setLogs('Error. Please check the Console (F12) for details.'); 
    }
  };

  const handleStart = () => {
    if (!file || !apiKey) return;
    setStatus('transcribing');
    
    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      // Decode audio for Whisper
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtx.decodeAudioData(e.target?.result as ArrayBuffer, (audioBuffer) => {
        worker.current?.postMessage({ audio: audioBuffer.getChannelData(0) });
      });
    };
    fileReader.readAsArrayBuffer(file);
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8 font-sans text-gray-900">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">OpenPulpit</h1>
            <p className="text-gray-500">Free AI Sermon Repurposing</p>
        </div>
        
        <Card className="space-y-4">
          <div>
            <label className="text-sm font-bold block mb-1">1. Gemini API Key</label>
            <Input 
                type="password" 
                placeholder="Paste Key (starts with AIza...)" 
                value={apiKey} 
                onChange={(e:any) => setApiKey(e.target.value)} 
            />
            <p className="text-xs text-gray-400 mt-1">
                Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline hover:text-blue-500">Google AI Studio</a>.
            </p>
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">2. Video File</label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center mt-1 hover:bg-gray-100 transition-colors">
              <input 
                type="file" 
                accept="video/*" 
                onChange={(e) => setFile(e.target.files?.[0] || null)} 
                className="hidden" 
                id="file" 
              />
              <label htmlFor="file" className="cursor-pointer block">
                <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <span className="text-sm text-gray-500">{file ? file.name : "Click to Select Video"}</span>
              </label>
            </div>
          </div>
          <Button 
            onClick={handleStart} 
            disabled={!file || !apiKey || status !== 'idle'} 
            loading={status !== 'idle' && status !== 'complete'} 
            className="w-full h-12"
          >
            {status === 'idle' ? 'Start Processing' : logs}
          </Button>
        </Card>

        {status === 'complete' && analysis && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 fade-in duration-500">
            <Card>
              <h2 className="font-bold flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4 text-yellow-500"/> Summary</h2>
              <p className="text-gray-700 leading-relaxed">{analysis.summary}</p>
            </Card>
            
            <h3 className="font-bold text-lg mt-4">Viral Clips</h3>
            <div className="grid gap-4">
              {clips.map((clip: any, i: number) => (
                <Card key={i} className="p-4">
                  <div className="aspect-video bg-black rounded mb-2 overflow-hidden">
                    <video src={clip.url} controls className="w-full h-full object-contain" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">{clip.reason}</span>
                    <a href={clip.url} download={`clip-${i}.mp4`} className="text-sm text-blue-600 hover:underline">Download MP4</a>
                  </div>
                </Card>
              ))}
            </div>

            <Card>
                <h3 className="font-bold mb-2">Social Captions</h3>
                <div className="space-y-2">
                    {analysis.social_posts?.map((post: string, i: number) => (
                        <div key={i} className="bg-gray-100 p-2 rounded text-sm italic text-gray-600">{post}</div>
                    ))}
                </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
