
import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../constants';
import { PPTContent, QuizContent, LessonPlanContent, LLMOutput, ResearchContent, SpeechContent, VideoContent } from '../types';
import { cogniCraftService } from '../services';
import { useAppContext } from '../App';

// --- Type Guards ---
const isPPTContent = (output: any): output is PPTContent => output && typeof output === 'object' && 'slides' in output;
const isQuizContent = (output: any): output is QuizContent => output && typeof output === 'object' && 'questions' in output;
const isLessonPlanContent = (output: any): output is LessonPlanContent => output && typeof output === 'object' && 'activities' in output;
const isResearchContent = (output: any): output is ResearchContent => output && typeof output === 'object' && 'answer' in output && 'sources' in output;
const isSpeechContent = (output: any): output is SpeechContent => output && typeof output === 'object' && 'audioDataUrl' in output;
const isVideoContent = (output: any): output is VideoContent => output && typeof output === 'object' && 'videoUrl' in output;

// --- Audio Helpers ---
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

// --- Output Display ---
const OutputDisplay: React.FC<{ output: LLMOutput }> = ({ output }) => {
    const [showAnswers, setShowAnswers] = useState(false);
    
    const handleCopy = () => {
        const textToCopy = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
        navigator.clipboard.writeText(textToCopy).then(() => alert("Copied!"));
    };

    const renderContent = () => {
        if (typeof output === 'string') {
            return <div className="whitespace-pre-wrap leading-relaxed text-slate-200">{output}</div>;
        }
        if (isPPTContent(output)) {
             return <div className="space-y-4 w-full">
                <div className="flex items-center gap-2 text-blue-400 mb-2">
                    <Icons.reports className="w-5 h-5"/>
                    <span className="font-bold text-sm uppercase tracking-wider">Presentation Deck</span>
                </div>
                <h3 className="text-xl font-bold text-white">{output.title}</h3>
                <div className="grid gap-3">
                    {output.slides.map((slide, i) => (
                        <div key={i} className="p-4 border border-slate-700 rounded-xl bg-[#1E1F20]">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="bg-blue-900/30 text-blue-300 text-xs font-bold px-2 py-1 rounded">Slide {i+1}</span>
                                <h4 className="font-semibold text-slate-200">{slide.title}</h4>
                            </div>
                            <ul className="list-disc list-inside ml-2 space-y-1 text-sm text-slate-400">
                                {slide.points.map((p, j) => <li key={j}>{p}</li>)}
                            </ul>
                            {slide.notes && <div className="mt-3 pt-2 border-t border-slate-700 text-xs italic text-slate-500"><strong>Speaker Notes:</strong> {slide.notes}</div>}
                        </div>
                    ))}
                </div>
            </div>;
        }
        if (isQuizContent(output)) {
            return <div className="space-y-4 w-full">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <h3 className="text-lg font-bold text-white">{output.title}</h3>
                    <button onClick={() => setShowAnswers(!showAnswers)} className="text-xs font-semibold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">{showAnswers ? 'Hide Key' : 'Show Key'}</button>
                </div>
                <div className="space-y-3">
                    {output.questions.map((q, i) => (
                        <div key={i} className="p-3 rounded-lg bg-[#1E1F20] border border-slate-700">
                            <p className="font-medium text-slate-200 mb-2">{i+1}. {q.question}</p>
                            {q.options && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                    {q.options.map((o, j)=><div key={j} className="px-2 py-1 rounded bg-slate-800 text-slate-400">{o}</div>)}
                                </div>
                            )}
                            <div className={`mt-2 text-sm font-semibold text-green-400 transition-all duration-300 overflow-hidden ${showAnswers ? 'max-h-10 opacity-100' : 'max-h-0 opacity-0'}`}>
                                Answer: {q.answer}
                            </div>
                        </div>
                    ))}
                </div>
            </div>;
        }
        if (isLessonPlanContent(output)) {
            return <div className="space-y-3 w-full">
                <h3 className="text-xl font-bold text-white">{output.title}</h3>
                <div className="flex gap-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    <span>Topic: {output.topic}</span>
                    <span>Duration: {output.duration}</span>
                </div>
                <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-800/30">
                    <h4 className="font-bold text-blue-300 text-sm mb-1">Objectives</h4>
                    <ul className="list-disc list-inside text-sm text-blue-200">{output.objectives.map((o,i)=><li key={i}>{o}</li>)}</ul>
                </div>
                 <div className="space-y-2">
                    {output.activities.map((act, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-[#1E1F20] rounded-lg border border-slate-700">
                            <div className="shrink-0 w-16 text-center pt-1">
                                <span className="block font-bold text-slate-300 text-sm">{act.duration}</span>
                            </div>
                            <div>
                                <p className="font-bold text-white text-sm">{act.name}</p>
                                <p className="text-sm text-slate-400">{act.description}</p>
                            </div>
                        </div>
                    ))}
                 </div>
                 <div className="text-sm p-3 bg-amber-900/20 rounded-lg border border-amber-800/30 text-amber-200">
                    <strong>Assessment:</strong> {output.assessment}
                 </div>
            </div>;
        }
        if (isResearchContent(output)) {
            return <div className="space-y-3 w-full">
                <div className="whitespace-pre-wrap leading-relaxed text-slate-200">{output.answer}</div>
                {output.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-700">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sources</h4>
                        <div className="flex flex-wrap gap-2">
                            {output.sources.map((source, i) => (
                                <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-full text-xs text-blue-400 transition-colors truncate max-w-xs border border-slate-700">
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
            return <div className="flex items-center gap-3 bg-slate-800 p-3 rounded-full w-full max-w-md border border-slate-700">
                <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white shrink-0 animate-pulse">
                    <Icons.audio_spark className="w-5 h-5"/>
                </div>
                <audio controls src={output.audioDataUrl} className="w-full bg-transparent h-8 invert-[0.9]" />
            </div>;
        }
        if (isVideoContent(output)) {
            return <div className="rounded-xl overflow-hidden border border-slate-700 bg-black">
                <video controls src={output.videoUrl} className="w-full max-h-96" />
            </div>;
        }
        return <p className="text-red-400 italic">Unsupported output format.</p>;
    };

    return (
        <div className="relative group w-full">
            {renderContent()}
            <button onClick={handleCopy} className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-[#2a2b2d] border border-slate-600 rounded-lg shadow-sm text-slate-400 hover:text-white transition-all" title="Copy Content">
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
    { id: 'quickAnswer', name: 'Quick Answer', desc: 'Fast responses.', icon: Icons.bolt, inputType: 'prompt' },
    { id: 'research', name: 'Research', desc: 'Web search.', icon: Icons.google, inputType: 'prompt' },
    { id: 'complexQuery', name: 'Reasoning', desc: 'Deep thinking.', icon: Icons.network_intelligence, inputType: 'prompt' },
    { id: 'summary', name: 'Summarizer', desc: 'Condense text.', icon: Icons.notebookLLM, inputType: 'notes' },
    { id: 'ppt', name: 'Slide Gen', desc: 'Create decks.', icon: Icons.reports, inputType: 'notes' },
    { id: 'quiz', name: 'Quiz Maker', desc: 'Assessments.', icon: Icons.timetable, inputType: 'topic' },
    { id: 'lessonPlan', name: 'Lesson Plan', desc: 'Teaching aid.', icon: Icons.lessonPlan, inputType: 'topic' },
    { id: 'videoGen', name: 'Create Video', desc: 'Text to video.', icon: Icons.video_spark, inputType: 'prompt' },
    { id: 'imageAnalyzer', name: 'Analyzer', desc: 'See & describe.', icon: Icons.document_scanner, inputType: 'file-prompt' },
];

const NotebookLLMPage: React.FC = () => {
    const { user } = useAppContext();
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
        if ((!inputText.trim() && !file) || !currentToolId) return;

        // If no tool selected, default to quick answer if typing, or just return
        const activeToolId = currentToolId;

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
        
        const processingFile = file;
        setFile(null);

        try {
            let result: LLMOutput;
            const text = userMsg.content as string;

            switch(activeToolId) {
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
        <div className="flex h-[calc(100vh-5rem)] overflow-hidden bg-[#131314] text-[#E3E3E3] font-sans">
            {/* --- Sidebar --- */}
            <aside className={`${isSidebarOpen ? 'w-64' : 'w-0 md:w-16'} transition-all duration-300 bg-[#1E1F20] border-r border-[#333] flex flex-col z-20 absolute md:relative h-full`}>
                <div className="p-4 flex items-center justify-between">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-full hover:bg-[#333] text-[#E3E3E3]">
                        <Icons.menu className="w-5 h-5"/>
                    </button>
                    {isSidebarOpen && (
                        <button 
                            onClick={() => { setCurrentToolId(null); setChatHistory([]); }}
                            className="bg-[#282A2C] hover:bg-[#333] text-[#E3E3E3] text-sm px-3 py-1.5 rounded-full transition-colors flex items-center gap-2"
                        >
                            <Icons.plusIcon className="w-4 h-4"/> New Chat
                        </button>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {isSidebarOpen && <p className="px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Recent</p>}
                    {tools.map(tool => (
                        <button
                            key={tool.id}
                            onClick={() => handleToolSelect(tool.id)}
                            title={tool.name}
                            className={`w-full flex items-center gap-3 p-3 rounded-full transition-all group relative ${currentToolId === tool.id ? 'bg-[#004A77] text-[#D3E3FD]' : 'hover:bg-[#282A2C] text-[#C4C7C5]'}`}
                        >
                            <tool.icon className="w-5 h-5 shrink-0" />
                            {isSidebarOpen && (
                                <span className="text-sm font-medium truncate">{tool.name}</span>
                            )}
                        </button>
                    ))}
                </div>
                
                {isSidebarOpen && (
                    <div className="p-4 border-t border-[#333] text-xs text-gray-500">
                        <p>Hyderabad, Telangana</p>
                        <p>From your IP address</p>
                    </div>
                )}
            </aside>

            {/* --- Main Chat Area --- */}
            <main className="flex-1 flex flex-col relative w-full h-full">
                {/* Header Mobile */}
                <div className="md:hidden h-14 flex items-center px-4 bg-[#131314] sticky top-0 z-10">
                     <button onClick={() => setIsSidebarOpen(true)} className="mr-4 text-[#E3E3E3]"><Icons.menu className="w-6 h-6"/></button>
                     <span className="font-bold text-lg">Gemini</span>
                </div>

                {/* Chat History */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 scroll-smooth pb-32">
                    {!currentToolId && chatHistory.length === 0 ? (
                        <div className="h-full flex flex-col justify-center max-w-3xl mx-auto opacity-0 animate-fade-in-up" style={{animationDelay: '100ms', animationFillMode: 'forwards'}}>
                            <div className="mb-12">
                                <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#4285F4] via-[#9B72CB] to-[#D96570] mb-2 w-fit">
                                    Hello, {user?.name.split(' ')[0] || 'Student'}
                                </h1>
                                <h2 className="text-5xl font-bold text-[#444746] mb-8">CogniCraft AI is here.</h2>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <button onClick={() => handleToolSelect('videoGen')} className="bg-[#1E1F20] hover:bg-[#2A2B2D] p-4 rounded-2xl text-left transition-colors group h-48 flex flex-col justify-between relative overflow-hidden">
                                    <span className="text-[#E3E3E3] font-medium text-lg relative z-10">Create a video</span>
                                    <div className="absolute bottom-2 right-2 p-2 bg-black/30 rounded-full group-hover:scale-110 transition-transform">
                                        <Icons.video_spark className="w-6 h-6 text-white"/>
                                    </div>
                                </button>
                                <button onClick={() => handleToolSelect('summary')} className="bg-[#1E1F20] hover:bg-[#2A2B2D] p-4 rounded-2xl text-left transition-colors group h-48 flex flex-col justify-between relative overflow-hidden">
                                    <span className="text-[#E3E3E3] font-medium text-lg relative z-10">Summarize notes</span>
                                    <div className="absolute bottom-2 right-2 p-2 bg-black/30 rounded-full group-hover:scale-110 transition-transform">
                                        <Icons.notebookLLM className="w-6 h-6 text-white"/>
                                    </div>
                                </button>
                                <button onClick={() => handleToolSelect('research')} className="bg-[#1E1F20] hover:bg-[#2A2B2D] p-4 rounded-2xl text-left transition-colors group h-48 flex flex-col justify-between relative overflow-hidden">
                                    <span className="text-[#E3E3E3] font-medium text-lg relative z-10">Deep Research</span>
                                    <div className="absolute bottom-2 right-2 p-2 bg-black/30 rounded-full group-hover:scale-110 transition-transform">
                                        <Icons.google className="w-6 h-6 text-white"/>
                                    </div>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-8">
                            {chatHistory.map(msg => (
                                <div key={msg.id} className={`flex gap-4 animate-fade-in-up`}>
                                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 ${msg.role === 'user' ? 'bg-gray-600 order-2' : 'bg-gradient-to-tr from-blue-500 to-purple-500 order-1'}`}>
                                        {msg.role === 'user' ? <span className="text-xs text-white font-bold">U</span> : <Icons.sparkles className="w-4 h-4 text-white"/>}
                                    </div>
                                    <div className={`flex-1 ${msg.role === 'user' ? 'order-1 text-right' : 'order-2 text-left'}`}>
                                        <div className={`inline-block text-left ${msg.role === 'user' ? 'bg-[#282A2C] rounded-3xl py-3 px-5' : 'w-full'}`}>
                                            {msg.isLoading ? (
                                                <div className="flex items-center gap-2 text-gray-400">
                                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-75"></div>
                                                    <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce delay-150"></div>
                                                </div>
                                            ) : (
                                                <OutputDisplay output={msg.content} />
                                            )}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-1 px-2">
                                            {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="absolute bottom-0 w-full bg-gradient-to-t from-[#131314] via-[#131314] to-transparent pb-6 pt-10 px-4">
                    <div className="max-w-3xl mx-auto">
                        <div className="bg-[#1E1F20] rounded-[2rem] border border-[#333] flex items-center p-2 relative shadow-2xl transition-all focus-within:border-gray-500 focus-within:bg-[#282A2C]">
                            {/* Attachment Button */}
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="p-3 rounded-full text-[#C4C7C5] hover:bg-[#333] hover:text-white transition-colors"
                            >
                                <Icons.plusIcon className="w-5 h-5" />
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                className="hidden"
                                accept={currentTool?.inputType === 'audio' ? 'audio/*' : 'image/*,video/*'}
                                onChange={e => { if(e.target.files?.[0]) setFile(e.target.files[0]) }}
                            />

                            <input
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                                placeholder={
                                    currentTool ? `Ask ${currentTool.name}...` : "Ask CogniCraft AI..."
                                }
                                className="flex-1 bg-transparent border-none focus:ring-0 text-[#E3E3E3] placeholder:text-[#8E918F] text-base px-2"
                            />
                            
                            {/* File Badge */}
                            {file && (
                                <div className="absolute -top-12 left-4 bg-[#282A2C] text-xs text-white px-3 py-1.5 rounded-full flex items-center gap-2 border border-[#444]">
                                    <span>{file.name}</span>
                                    <button onClick={() => setFile(null)}><Icons.close className="w-3 h-3"/></button>
                                </div>
                            )}

                            {currentTool?.inputType === 'audio' ? (
                                <button 
                                    onClick={isRecording ? stopRecording : startRecording} 
                                    className={`p-3 rounded-full transition-colors ${isRecording ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-[#C4C7C5] hover:text-white hover:bg-[#333]'}`}
                                >
                                    <Icons.audio_spark className="w-5 h-5" />
                                </button>
                            ) : (
                                <button 
                                    onClick={handleSubmit}
                                    disabled={!inputText.trim() && !file}
                                    className={`p-3 rounded-full transition-all ${inputText.trim() || file ? 'bg-white text-black hover:bg-[#E3E3E3]' : 'bg-transparent text-[#444746] cursor-not-allowed'}`}
                                >
                                    <Icons.send className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                        <p className="text-center text-[10px] text-[#8E918F] mt-3">
                            CogniCraft can make mistakes, so double-check it.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default NotebookLLMPage;
