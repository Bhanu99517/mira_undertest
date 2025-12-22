
import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../constants';
import { PPTContent, QuizContent, LessonPlanContent, LLMOutput, ResearchContent, SpeechContent, VideoContent } from '../types';
import { cogniCraftService } from '../services';

// --- Type Guards & Helpers ---
const isPPTContent = (output: any): output is PPTContent => output && typeof output === 'object' && 'slides' in output;
const isQuizContent = (output: any): output is QuizContent => output && typeof output === 'object' && 'questions' in output;
const isLessonPlanContent = (output: any): output is LessonPlanContent => output && typeof output === 'object' && 'activities' in output;
const isResearchContent = (output: any): output is ResearchContent => output && typeof output === 'object' && 'answer' in output && 'sources' in output;
const isSpeechContent = (output: any): output is SpeechContent => output && typeof output === 'object' && 'audioDataUrl' in output;
const isVideoContent = (output: any): output is VideoContent => output && typeof output === 'object' && 'videoUrl' in output;

// --- Audio Decoding Utilities ---
const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
};

function bufferToWave(abuffer: AudioBuffer, len: number) {
  let numOfChan = abuffer.numberOfChannels,
      length = len * numOfChan * 2 + 44,
      buffer = new ArrayBuffer(length),
      view = new DataView(buffer),
      channels = [], i, sample, offset = 0, pos = 0;

  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for(i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

  while(pos < length) {
    for(i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([buffer], {type: "audio/wav"});
}

// --- Output Rendering Component ---
const OutputDisplay: React.FC<{ output: LLMOutput }> = ({ output }) => {
    const [showAnswers, setShowAnswers] = useState(false);
    
    const handleCopy = () => {
        const textToCopy = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
        navigator.clipboard.writeText(textToCopy).then(() => alert("Copied!"));
    };

    const renderContent = () => {
        if (typeof output === 'string') {
            return <div className="whitespace-pre-wrap leading-relaxed">{output}</div>;
        }
        if (isPPTContent(output)) {
             return <div className="space-y-4 w-full">
                <div className="flex items-center gap-2 text-primary-500 mb-2">
                    <Icons.reports className="w-5 h-5"/>
                    <span className="font-bold text-sm uppercase tracking-wider">Presentation Deck</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{output.title}</h3>
                <div className="grid gap-3">
                    {output.slides.map((slide, i) => (
                        <div key={i} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-white/50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 text-xs font-bold px-2 py-1 rounded">Slide {i+1}</span>
                                <h4 className="font-semibold text-slate-800 dark:text-slate-200">{slide.title}</h4>
                            </div>
                            <ul className="list-disc list-inside ml-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                                {slide.points.map((p, j) => <li key={j}>{p}</li>)}
                            </ul>
                            {slide.notes && <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs italic text-slate-500"><strong>Speaker Notes:</strong> {slide.notes}</div>}
                        </div>
                    ))}
                </div>
            </div>;
        }
        if (isQuizContent(output)) {
            return <div className="space-y-4 w-full">
                <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{output.title}</h3>
                    <button onClick={() => setShowAnswers(!showAnswers)} className="text-xs font-semibold px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">{showAnswers ? 'Hide Key' : 'Show Key'}</button>
                </div>
                <div className="space-y-3">
                    {output.questions.map((q, i) => (
                        <div key={i} className="p-3 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                            <p className="font-medium text-slate-800 dark:text-slate-200 mb-2">{i+1}. {q.question}</p>
                            {q.options && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                    {q.options.map((o, j)=><div key={j} className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400">{o}</div>)}
                                </div>
                            )}
                            <div className={`mt-2 text-sm font-semibold text-green-600 dark:text-green-400 transition-all duration-300 overflow-hidden ${showAnswers ? 'max-h-10 opacity-100' : 'max-h-0 opacity-0'}`}>
                                Answer: {q.answer}
                            </div>
                        </div>
                    ))}
                </div>
            </div>;
        }
        if (isLessonPlanContent(output)) {
            return <div className="space-y-3 w-full">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{output.title}</h3>
                <div className="flex gap-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    <span>Topic: {output.topic}</span>
                    <span>Duration: {output.duration}</span>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30">
                    <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm mb-1">Objectives</h4>
                    <ul className="list-disc list-inside text-sm text-blue-900 dark:text-blue-200">{output.objectives.map((o,i)=><li key={i}>{o}</li>)}</ul>
                </div>
                 <div className="space-y-2">
                    {output.activities.map((act, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            <div className="shrink-0 w-16 text-center pt-1">
                                <span className="block font-bold text-slate-700 dark:text-slate-300 text-sm">{act.duration}</span>
                            </div>
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white text-sm">{act.name}</p>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{act.description}</p>
                            </div>
                        </div>
                    ))}
                 </div>
                 <div className="text-sm p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/30 text-amber-900 dark:text-amber-200">
                    <strong>Assessment:</strong> {output.assessment}
                 </div>
            </div>;
        }
        if (isResearchContent(output)) {
            return <div className="space-y-3 w-full">
                <div className="whitespace-pre-wrap leading-relaxed">{output.answer}</div>
                {output.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sources</h4>
                        <div className="flex flex-wrap gap-2">
                            {output.sources.map((source, i) => (
                                <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-xs text-primary-600 dark:text-primary-400 transition-colors truncate max-w-xs border border-slate-200 dark:border-slate-700">
                                    <Icons.google className="w-3 h-3 shrink-0"/>
                                    <span className="truncate">{source.title || new URL(source.uri).hostname}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>;
        }
        if (isSpeechContent(output)) {
            return <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-3 rounded-full w-full max-w-md">
                <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white shrink-0">
                    <Icons.audio_spark className="w-5 h-5"/>
                </div>
                <audio controls src={output.audioDataUrl} className="w-full bg-transparent h-8" />
            </div>;
        }
        if (isVideoContent(output)) {
            return <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
                <video controls src={output.videoUrl} className="w-full max-h-96" />
            </div>;
        }
        return <p className="text-red-500 italic">Unsupported output format.</p>;
    };

    return (
        <div className="relative group w-full">
            {renderContent()}
            <button onClick={handleCopy} className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm text-slate-500 hover:text-primary-500 transition-all" title="Copy Content">
                <Icons.copy className="w-4 h-4"/>
            </button>
        </div>
    );
};

// --- Types for Chat ---
type ToolID = 'summary' | 'questions' | 'ppt' | 'story' | 'mindmap' | 'quiz' | 'lessonPlan' | 'explainConcept' | 'videoGen' | 'imageAnalyzer' | 'videoAnalyzer' | 'audioTranscription' | 'quickAnswer' | 'complexQuery' | 'tts' | 'research';

interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    content: any;
    isLoading?: boolean;
    timestamp: Date;
}

const tools: { id: ToolID, name: string, desc: string, icon: React.ElementType, inputType: 'notes' | 'topic' | 'concept' | 'prompt' | 'file-prompt' | 'audio' | 'text' }[] = [
    { id: 'quickAnswer', name: 'Quick Answer', desc: 'Fast responses for simple queries.', icon: Icons.bolt, inputType: 'prompt' },
    { id: 'research', name: 'Research Assistant', desc: 'Deep dive with web sources.', icon: Icons.google, inputType: 'prompt' },
    { id: 'complexQuery', name: 'Reasoning Engine', desc: 'Advanced problem solving.', icon: Icons.network_intelligence, inputType: 'prompt' },
    { id: 'summary', name: 'Summarizer', desc: 'Condense notes into bullet points.', icon: Icons.notebookLLM, inputType: 'notes' },
    { id: 'ppt', name: 'Slide Generator', desc: 'Create presentation outlines.', icon: Icons.reports, inputType: 'notes' },
    { id: 'quiz', name: 'Quiz Maker', desc: 'Generate assessments from topics.', icon: Icons.timetable, inputType: 'topic' },
    { id: 'lessonPlan', name: 'Lesson Planner', desc: 'Structured educational plans.', icon: Icons.lessonPlan, inputType: 'topic' },
    { id: 'explainConcept', name: 'Simplifier', desc: 'Explain complex ideas simply.', icon: Icons.explainConcept, inputType: 'concept' },
    { id: 'videoGen', name: 'Video Studio', desc: 'Generate videos from text.', icon: Icons.video_spark, inputType: 'prompt' },
    { id: 'imageAnalyzer', name: 'Vision Analyst', desc: 'Analyze and describe images.', icon: Icons.document_scanner, inputType: 'file-prompt' },
    { id: 'tts', name: 'Voice Synth', desc: 'Convert text to speech.', icon: Icons.audio_spark, inputType: 'text' },
    { id: 'audioTranscription', name: 'Transcriber', desc: 'Audio to text conversion.', icon: Icons.speech_to_text, inputType: 'audio' },
];

const NotebookLLMPage: React.FC = () => {
    const [currentToolId, setCurrentToolId] = useState<ToolID | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const currentTool = tools.find(t => t.id === currentToolId);

    // Auto-scroll to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory, currentToolId]);

    const handleToolSelect = (id: ToolID) => {
        setCurrentToolId(id);
        setChatHistory([]); // Clear chat when switching tools for now
        setInputText('');
        setFile(null);
        // On mobile, close sidebar after selection
        if (window.innerWidth < 768) setIsSidebarOpen(false);
    };

    const fileToGenerativePart = (file: File): Promise<{data: string, mimeType: string}> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64Data = (reader.result as string).split(',')[1];
                resolve({ data: base64Data, mimeType: file.type });
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
        });
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            const audioChunks: Blob[] = [];
            mediaRecorderRef.current.ondataavailable = event => audioChunks.push(event.data);
            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                setFile(new File([audioBlob], "recording.webm", {type: "audio/webm"}));
                stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            alert("Microphone access needed.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleSubmit = async () => {
        if ((!inputText.trim() && !file) || !currentTool) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: inputText || (file ? `Uploaded: ${file.name}` : ''),
            timestamp: new Date()
        };
        
        const loadingMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            content: null,
            isLoading: true,
            timestamp: new Date()
        };

        setChatHistory(prev => [...prev, userMsg, loadingMsg]);
        setInputText('');
        
        // Keep file ref for processing, then clear from UI state
        const processingFile = file;
        setFile(null);

        try {
            let result: LLMOutput;
            const text = userMsg.content as string;

            switch(currentTool.id) {
                case 'summary': result = await cogniCraftService.summarizeNotes(text); break;
                case 'questions': result = await cogniCraftService.generateQuestions(text); break;
                case 'ppt': result = await cogniCraftService.generatePPT(text); break;
                case 'story': result = await cogniCraftService.createStory(text); break;
                case 'mindmap': result = await cogniCraftService.createMindMap(text); break;
                case 'quiz': result = await cogniCraftService.generateQuiz(text); break;
                case 'lessonPlan': result = await cogniCraftService.generateLessonPlan(text); break;
                case 'explainConcept': result = await cogniCraftService.explainConcept(text); break;
                case 'quickAnswer': result = await cogniCraftService.quickAnswer(text); break;
                case 'complexQuery': result = await cogniCraftService.complexQuery(text); break;
                case 'research': result = await cogniCraftService.research(text); break;
                case 'tts': {
                    const audioBase64 = await cogniCraftService.generateSpeech(text);
                    // Safer AudioContext
                    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                    const audioContext = new AudioContext({ sampleRate: 24000 });
                    const audioBuffer = await decodeAudioData(decode(audioBase64), audioContext, 24000, 1);
                    const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
                    result = { audioDataUrl: URL.createObjectURL(wavBlob) };
                    break;
                }
                case 'imageAnalyzer':
                    if (!processingFile) throw new Error("Image required.");
                    const imgPart = await fileToGenerativePart(processingFile);
                    result = await cogniCraftService.analyzeImage(text || "Describe this image.", imgPart);
                    break;
                case 'audioTranscription':
                    if (!processingFile) throw new Error("Audio required.");
                    const audPart = await fileToGenerativePart(processingFile);
                    result = await cogniCraftService.transcribeAudio(audPart);
                    break;
                case 'videoGen':
                    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
                    if(!hasKey) await (window as any).aistudio?.openSelectKey();
                    const videoLink = await cogniCraftService.generateVideo(text, aspectRatio);
                    const response = await fetch(`${videoLink}&key=${process.env.API_KEY}`);
                    const videoBlob = await response.blob();
                    result = { videoUrl: URL.createObjectURL(videoBlob) };
                    break;
                default: throw new Error("Tool not implemented");
            }

            setChatHistory(prev => prev.map(msg => 
                msg.id === loadingMsg.id ? { ...msg, content: result, isLoading: false } : msg
            ));

        } catch (error: any) {
            setChatHistory(prev => prev.map(msg => 
                msg.id === loadingMsg.id ? { ...msg, content: `Error: ${error.message || "Something went wrong."}`, isLoading: false } : msg
            ));
        }
    };

    return (
        <div className="flex h-[calc(100vh-5rem)] overflow-hidden bg-slate-50 dark:bg-slate-900">
            {/* --- Sidebar --- */}
            <aside className={`${isSidebarOpen ? 'w-72' : 'w-0 md:w-20'} transition-all duration-300 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col z-10 absolute md:relative h-full shadow-xl md:shadow-none`}>
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className={`flex items-center gap-2 overflow-hidden transition-opacity ${isSidebarOpen ? 'opacity-100' : 'opacity-0 md:hidden'}`}>
                        <Icons.cogniCraft className="w-6 h-6 text-primary-500" />
                        <span className="font-bold text-slate-800 dark:text-white whitespace-nowrap">AI Agents</span>
                    </div>
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                        {isSidebarOpen ? <Icons.arrowLeftIcon className="w-5 h-5 transform rotate-180 md:rotate-0" /> : <Icons.menu className="w-5 h-5"/>}
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    <button 
                        onClick={() => handleToolSelect(null as any)} 
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${!currentToolId ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400'}`}
                    >
                        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                            <Icons.logoIcon className="w-5 h-5" />
                        </div>
                        {isSidebarOpen && <span className="font-medium text-sm">New Chat</span>}
                    </button>
                    
                    <div className={`my-4 border-t border-slate-200 dark:border-slate-700 ${!isSidebarOpen && 'hidden'}`}></div>
                    
                    {tools.map(tool => (
                        <button
                            key={tool.id}
                            onClick={() => handleToolSelect(tool.id)}
                            title={tool.name}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group relative ${currentToolId === tool.id ? 'bg-white dark:bg-slate-700 shadow-md border border-slate-100 dark:border-slate-600' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
                        >
                            <div className={`p-2 rounded-lg shrink-0 transition-colors ${currentToolId === tool.id ? 'bg-primary-100 dark:bg-primary-500 text-primary-600 dark:text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-primary-500 group-hover:bg-primary-50 dark:group-hover:bg-slate-600'}`}>
                                <tool.icon className="w-5 h-5" />
                            </div>
                            {isSidebarOpen ? (
                                <div className="text-left overflow-hidden">
                                    <p className={`text-sm font-semibold truncate ${currentToolId === tool.id ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{tool.name}</p>
                                    <p className="text-xs text-slate-400 truncate">{tool.desc}</p>
                                </div>
                            ) : (
                                // Tooltip for collapsed state
                                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-20">
                                    {tool.name}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </aside>

            {/* --- Main Chat Area --- */}
            <main className="flex-1 flex flex-col relative w-full max-w-5xl mx-auto shadow-2xl bg-white dark:bg-slate-900">
                {/* Header */}
                <header className="h-16 border-b border-slate-100 dark:border-slate-800 flex items-center px-6 justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-3">
                        {!isSidebarOpen && (
                            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mr-2 text-slate-500"><Icons.menu className="w-6 h-6"/></button>
                        )}
                        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400">
                            {currentTool ? <currentTool.icon className="w-6 h-6" /> : <Icons.cogniCraft className="w-6 h-6" />}
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-800 dark:text-white text-lg leading-tight">{currentTool ? currentTool.name : "CogniCraft Assistant"}</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{currentTool ? currentTool.desc : "Select an agent to start"}</p>
                        </div>
                    </div>
                </header>

                {/* Chat History */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth">
                    {!currentToolId ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-0 animate-fade-in-up" style={{animationDelay: '100ms', animationFillMode: 'forwards'}}>
                            <div className="w-20 h-20 bg-gradient-to-tr from-primary-400 to-accent-500 rounded-3xl flex items-center justify-center shadow-2xl mb-6 transform rotate-3 hover:rotate-6 transition-transform duration-500">
                                <Icons.cogniCraft className="w-12 h-12 text-white" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 dark:text-white mb-3">How can I help today?</h1>
                            <p className="text-slate-500 max-w-md mx-auto text-lg mb-10">Choose a specialized AI agent from the sidebar to draft content, analyze data, or get answers.</p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
                                {tools.slice(0, 4).map(t => (
                                    <button key={t.id} onClick={() => handleToolSelect(t.id)} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-primary-400 dark:hover:border-primary-500 bg-white dark:bg-slate-800/50 hover:shadow-lg transition-all text-left group">
                                        <div className="flex items-center gap-3 mb-2">
                                            <t.icon className="w-5 h-5 text-slate-400 group-hover:text-primary-500 transition-colors"/>
                                            <span className="font-semibold text-slate-700 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400">{t.name}</span>
                                        </div>
                                        <p className="text-xs text-slate-500">{t.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        chatHistory.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <currentTool.icon className="w-16 h-16 mb-4 opacity-20" />
                                <p>Start the conversation with <strong>{currentTool.name}</strong>.</p>
                            </div>
                        ) : (
                            chatHistory.map(msg => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                                    <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 shadow-sm ${
                                        msg.role === 'user' 
                                            ? 'bg-primary-600 text-white rounded-tr-sm' 
                                            : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                                    }`}>
                                        {msg.isLoading ? (
                                            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                                <Icons.sparkles className="w-5 h-5 animate-pulse text-primary-500"/>
                                                <span className="text-sm font-medium">Thinking...</span>
                                            </div>
                                        ) : (
                                            <OutputDisplay output={msg.content} />
                                        )}
                                        <div className={`text-[10px] mt-2 opacity-60 text-right ${msg.role === 'user' ? 'text-primary-100' : 'text-slate-400'}`}>
                                            {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )
                    )}
                </div>

                {/* Input Area */}
                {currentToolId && (
                    <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                        <div className="max-w-4xl mx-auto relative">
                            {/* Contextual Controls */}
                            {currentTool?.id === 'videoGen' && (
                                <div className="absolute -top-12 left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1.5 flex items-center gap-2 animate-fade-in-up">
                                    <span className="text-xs font-bold text-slate-500 px-2">Aspect Ratio</span>
                                    <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="text-xs bg-slate-100 dark:bg-slate-700 rounded p-1 border-none focus:ring-0">
                                        <option value="16:9">16:9 Landscape</option>
                                        <option value="9:16">9:16 Portrait</option>
                                    </select>
                                </div>
                            )}

                            {/* File Preview */}
                            {file && (
                                <div className="absolute bottom-full left-0 mb-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 flex items-center gap-3 animate-scale-in shadow-lg">
                                    <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-primary-500">
                                        {file.type.startsWith('image') ? <Icons.document_scanner className="w-5 h-5"/> : <Icons.upload className="w-5 h-5"/>}
                                    </div>
                                    <div className="max-w-[150px]">
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{file.name}</p>
                                        <p className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                    <button onClick={() => setFile(null)} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500">
                                        <Icons.close className="w-4 h-4"/>
                                    </button>
                                </div>
                            )}

                            <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800/50 p-2 rounded-3xl border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500 transition-all shadow-inner">
                                {/* Attachment Button */}
                                {['file-prompt', 'audio'].includes(currentTool?.inputType || '') && (
                                    <>
                                        <input 
                                            type="file" 
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept={currentTool?.inputType === 'audio' ? 'audio/*' : 'image/*,video/*'}
                                            onChange={e => { if(e.target.files?.[0]) setFile(e.target.files[0]) }}
                                        />
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`p-3 rounded-full shrink-0 transition-colors ${file ? 'bg-primary-100 text-primary-600' : 'text-slate-400 hover:text-primary-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                            title="Attach File"
                                        >
                                            <Icons.upload className="w-5 h-5" />
                                        </button>
                                    </>
                                )}
                                
                                {currentTool?.inputType === 'audio' && (
                                    <button 
                                        onClick={isRecording ? stopRecording : startRecording} 
                                        className={`p-3 rounded-full shrink-0 transition-colors ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                        title="Record Audio"
                                    >
                                        <Icons.audio_spark className="w-5 h-5" />
                                    </button>
                                )}

                                <textarea
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                                    placeholder={
                                        currentTool?.inputType === 'notes' ? "Paste your notes here..." : 
                                        currentTool?.inputType === 'audio' ? "Upload audio to transcribe..." :
                                        "Type your message..."
                                    }
                                    rows={1}
                                    className="flex-1 max-h-32 py-3 px-2 bg-transparent border-none focus:ring-0 resize-none text-slate-800 dark:text-white placeholder:text-slate-400 text-sm custom-scrollbar"
                                    style={{ minHeight: '44px' }}
                                />
                                
                                <button 
                                    onClick={handleSubmit}
                                    disabled={!inputText.trim() && !file}
                                    className="p-3 rounded-full bg-primary-600 text-white shadow-md hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none transition-all transform hover:scale-105 active:scale-95 shrink-0"
                                >
                                    <Icons.send className="w-5 h-5 translate-x-0.5" />
                                </button>
                            </div>
                            <p className="text-center text-[10px] text-slate-400 mt-2">
                                CogniCraft AI can make mistakes. Check important info.
                            </p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default NotebookLLMPage;
