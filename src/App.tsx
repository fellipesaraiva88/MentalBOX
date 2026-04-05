/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Inbox, 
  LayoutDashboard, 
  CheckCircle2, 
  Trash2, 
  ArrowRight, 
  Lightbulb, 
  BookOpen,
  Send,
  X,
  Check,
  Mic,
  Image as ImageIcon,
  FileText,
  Video,
  Sparkles,
  Loader2,
  Paperclip,
  Play,
  Pause,
  Volume2,
  Bot,
  LogIn,
  LogOut,
  User as UserIcon,
  MicOff,
  PhoneOff,
  Phone
} from 'lucide-react';
import { Thought, ThoughtStatus, View, Attachment, Message } from './types';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  deleteDoc,
  updateDoc,
  getDocFromServer
} from './firebase';
import { User } from 'firebase/auth';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Error handling helper
const handleFirestoreError = (error: any, operation: string, path: string) => {
  const errInfo = {
    error: error.message,
    operation,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email
    }
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [currentView, setCurrentView] = useState<View>('capture');
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isLiveActive, setIsLiveActive] = useState(false);
  
  const [isDuplicateDetected, setIsDuplicateDetected] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Sync user profile
        setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          role: 'user'
        }, { merge: true });
      }
    });
    return unsubscribe;
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!user || !isAuthReady) {
      setThoughts([]);
      return;
    }

    const q = query(collection(db, `users/${user.uid}/thoughts`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as Thought);
      setThoughts(data.sort((a, b) => b.createdAt - a.createdAt));
    }, (error) => {
      handleFirestoreError(error, 'list', `users/${user.uid}/thoughts`);
    });

    // Connection test
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.message.includes('the client is offline')) {
          console.error("Firebase connection error: check configuration.");
        }
      }
    };
    testConnection();

    return unsubscribe;
  }, [user, isAuthReady]);

  useEffect(() => {
    if (currentView === 'capture' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentView]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const logout = () => signOut(auth);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const promise = new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
      });
      reader.readAsDataURL(file);
      const url = await promise;
      
      let type: Attachment['type'] = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      newAttachments.push({
        type,
        url,
        name: file.name,
        mimeType: file.type
      });
    }
    setAttachments([...attachments, ...newAttachments]);
  };

  const processWithAI = async () => {
    if (!user) return login();
    if (!inputValue.trim() && attachments.length === 0) return;
    
    setIsProcessing(true);
    setIsDuplicateDetected(null);
    try {
      const parts: any[] = [];
      if (inputValue) parts.push({ text: inputValue });
      
      for (const att of attachments) {
        const base64Data = att.url.split(',')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: att.mimeType
          }
        });
      }

      // Use Lite for quick processing, Pro only for images
      const hasImages = attachments.some(a => a.type === 'image');
      const modelName = hasImages ? "gemini-3.1-pro-preview" : "gemini-3.1-flash-lite-preview";

      // Context for duplicate check
      const existingContext = thoughts.slice(0, 20).map(t => ({ id: t.id, content: t.content, summary: t.aiSummary }));

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts }],
        config: {
          systemInstruction: `Você é o Guardião da Memória do Mental Inbox. 
          Sua missão é evitar duplicidade e ajudar o usuário que tem memória curta.
          
          PASSO 1: Verifique se este novo pensamento já existe ou é muito similar a estes itens recentes: ${JSON.stringify(existingContext)}.
          Se for um duplicata clara, comece sua resposta com "DUPLICATA: [ID_DO_ITEM]".
          
          PASSO 2: Se não for duplicata, extraia a essência e gere um título curto (máximo 5 palavras) e um resumo em uma frase. 
          Formato: Título | Resumo. 
          Se houver mídia, descreva o que é importante.`,
        }
      });

      const aiText = response.text || "";
      
      if (aiText.startsWith("DUPLICATA:")) {
        const duplicateId = aiText.split(":")[1].trim().replace("[", "").replace("]", "");
        setIsDuplicateDetected(duplicateId);
        setIsProcessing(false);
        return;
      }

      const aiSummary = aiText;
      const id = crypto.randomUUID();
      const newThought: Thought = {
        id,
        uid: user.uid,
        content: inputValue || aiSummary || "Nova ideia multimodal",
        aiSummary: aiSummary,
        createdAt: Date.now(),
        status: 'raw',
        attachments: attachments.length > 0 ? attachments : undefined
      };

      await setDoc(doc(db, `users/${user.uid}/thoughts`, id), newThought);
      setInputValue('');
      setAttachments([]);
      setCurrentView('inbox');
    } catch (error: any) {
      handleFirestoreError(error, 'create', `users/${user?.uid}/thoughts`);
    } finally {
      setIsProcessing(false);
    }
  };

  const addThought = async () => {
    if (!user) return login();
    if (!inputValue.trim() && attachments.length === 0) return;
    
    const id = crypto.randomUUID();
    const newThought: Thought = {
      id,
      uid: user.uid,
      content: inputValue.trim() || (attachments.length > 0 ? `Anexo: ${attachments[0].name}` : "Pensamento vazio"),
      createdAt: Date.now(),
      status: 'raw',
      attachments: attachments.length > 0 ? attachments : undefined
    };

    try {
      await setDoc(doc(db, `users/${user.uid}/thoughts`, id), newThought);
      setInputValue('');
      setAttachments([]);
    } catch (error: any) {
      handleFirestoreError(error, 'create', `users/${user.uid}/thoughts`);
    }
  };

  const updateThoughtStatus = async (id: string, status: ThoughtStatus) => {
    if (!user) return;
    try {
      const updates: any = { status };
      if (status === 'action') updates.kanbanStatus = 'todo';
      await updateDoc(doc(db, `users/${user.uid}/thoughts`, id), updates);
    } catch (error: any) {
      handleFirestoreError(error, 'update', `users/${user.uid}/thoughts/${id}`);
    }
  };

  const updateKanbanStatus = async (id: string, kanbanStatus: 'todo' | 'doing' | 'done') => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/thoughts`, id), { kanbanStatus });
    } catch (error: any) {
      handleFirestoreError(error, 'update', `users/${user.uid}/thoughts/${id}`);
    }
  };

  const deleteThought = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/thoughts`, id));
    } catch (error: any) {
      handleFirestoreError(error, 'delete', `users/${user.uid}/thoughts/${id}`);
    }
  };

  // Live API Implementation
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const startLiveSession = async () => {
    if (!user) return login();
    setIsLiveActive(true);
    nextStartTimeRef.current = 0;
    activeSourcesRef.current = [];
    
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "Você é um assistente de voz para o Mental Inbox. Ajude o usuário a organizar pensamentos em tempo real. Seja breve e direto.",
        },
        callbacks: {
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Interruption
            if (msg.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              activeSourcesRef.current = [];
              nextStartTimeRef.current = 0;
              return;
            }

            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              const binary = atob(audioData);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const floatData = new Float32Array(bytes.buffer);
              
              const buffer = audioContextRef.current.createBuffer(1, floatData.length, 16000);
              buffer.getChannelData(0).set(floatData);
              
              const node = audioContextRef.current.createBufferSource();
              node.buffer = buffer;
              node.connect(audioContextRef.current.destination);
              
              const now = audioContextRef.current.currentTime;
              if (nextStartTimeRef.current < now) {
                nextStartTimeRef.current = now + 0.05; // Small buffer
              }
              
              node.start(nextStartTimeRef.current);
              activeSourcesRef.current.push(node);
              nextStartTimeRef.current += buffer.duration;

              node.onended = () => {
                activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== node);
              };
            }
          }
        }
      });

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        session.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      liveSessionRef.current = { session, stream, processor };
    } catch (error) {
      console.error("Live session error:", error);
      stopLiveSession();
    }
  };

  const stopLiveSession = () => {
    setIsLiveActive(false);
    if (liveSessionRef.current) {
      liveSessionRef.current.session.close();
      liveSessionRef.current.stream.getTracks().forEach((t: any) => t.stop());
      liveSessionRef.current.processor.disconnect();
      liveSessionRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const rawThoughts = thoughts.filter(t => t.status === 'raw');
  const kanbanThoughts = thoughts.filter(t => t.status === 'action');

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Header / Auth */}
      <header className="fixed top-0 left-0 right-0 z-40 px-6 py-4 flex justify-between items-center bg-[#0a0a0a]/50 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold">M</div>
          <span className="font-display font-bold text-xl tracking-tight">Mental Inbox</span>
        </div>
        {user ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full">
              <img src={user.photoURL || ''} className="w-6 h-6 rounded-full" />
              <span className="text-sm font-medium hidden sm:inline">{user.displayName}</span>
            </div>
            <button onClick={logout} className="p-2 text-zinc-500 hover:text-red-400 transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        ) : (
          <button onClick={login} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20">
            <LogIn size={18} />
            Entrar
          </button>
        )}
      </header>

      {/* Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 p-2 rounded-2xl flex items-center gap-2 shadow-2xl">
        <NavButton active={currentView === 'capture'} onClick={() => setCurrentView('capture')} icon={<Plus size={20} />} label="Capturar" />
        <NavButton active={currentView === 'inbox'} onClick={() => setCurrentView('inbox')} icon={<Inbox size={20} />} label="Inbox" badge={rawThoughts.length} />
        <NavButton active={currentView === 'kanban'} onClick={() => setCurrentView('kanban')} icon={<LayoutDashboard size={20} />} label="Kanban" />
        <div className="w-px h-8 bg-zinc-800 mx-1" />
        <NavButton active={currentView === 'assistant'} onClick={() => setCurrentView('assistant')} icon={<Bot size={20} />} label="AI Chat" />
        <NavButton active={currentView === 'live'} onClick={() => setCurrentView('live')} icon={<Mic size={20} />} label="Voz" />
      </nav>

      <main className="max-w-4xl mx-auto px-6 pt-24 pb-32">
        <AnimatePresence mode="wait">
          {currentView === 'capture' && (
            <motion.div key="capture" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
              <h1 className="text-3xl font-medium text-zinc-400 text-center">O que apareceu na sua cabeça?</h1>
              <div className="w-full relative group">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (attachments.length > 0) processWithAI();
                      else addThought();
                    }
                  }}
                  placeholder="Escreva, fale ou anexe algo..."
                  className="w-full bg-zinc-900/50 border-2 border-zinc-800 rounded-3xl p-8 text-2xl focus:outline-none focus:border-indigo-500/50 transition-all resize-none min-h-[250px] shadow-inner"
                />
                
                {attachments.length > 0 && (
                  <div className="absolute top-24 left-8 right-8 flex flex-wrap gap-2 pointer-events-none">
                    {attachments.map((att, i) => (
                      <div key={i} className="bg-indigo-600/20 border border-indigo-500/30 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs text-indigo-300 pointer-events-auto">
                        {att.type === 'image' && <ImageIcon size={14} />}
                        {att.type === 'video' && <Video size={14} />}
                        {att.type === 'audio' && <Mic size={14} />}
                        {att.type === 'file' && <FileText size={14} />}
                        <span className="max-w-[100px] truncate">{att.name}</span>
                        <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}><X size={14} className="hover:text-white" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="absolute bottom-6 left-6 flex items-center gap-3">
                  <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
                  <IconButton onClick={() => fileInputRef.current?.click()} icon={<Paperclip size={20} />} tooltip="Anexar arquivo" />
                  <IconButton onClick={() => setCurrentView('live')} icon={<Mic size={20} />} tooltip="Conversa por voz" />
                </div>

                <div className="absolute bottom-6 right-6 flex items-center gap-3">
                  {isDuplicateDetected && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col gap-2 max-w-[250px] shadow-xl backdrop-blur-md"
                    >
                      <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                        <CheckCircle2 size={16} />
                        Possível Duplicata!
                      </div>
                      <p className="text-xs text-amber-200/70">Você já registrou algo parecido recentemente.</p>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const duplicate = thoughts.find(t => t.id === isDuplicateDetected);
                            if (duplicate) {
                              setCurrentView('inbox');
                              // Highlight logic could go here
                            }
                          }}
                          className="text-[10px] bg-amber-500 text-black px-2 py-1 rounded-lg font-bold"
                        >
                          Ver Existente
                        </button>
                        <button 
                          onClick={() => {
                            setIsDuplicateDetected(null);
                            // Force save logic
                            const id = crypto.randomUUID();
                            const newThought: Thought = {
                              id,
                              uid: user!.uid,
                              content: inputValue || "Nova ideia (Forçada)",
                              createdAt: Date.now(),
                              status: 'raw',
                              attachments: attachments.length > 0 ? attachments : undefined
                            };
                            setDoc(doc(db, `users/${user!.uid}/thoughts`, id), newThought);
                            setInputValue('');
                            setAttachments([]);
                            setCurrentView('inbox');
                          }}
                          className="text-[10px] bg-white/10 text-white px-2 py-1 rounded-lg"
                        >
                          Salvar Assim Mesmo
                        </button>
                      </div>
                    </motion.div>
                  )}
                  <button
                    onClick={processWithAI}
                    disabled={isProcessing || (!inputValue.trim() && attachments.length === 0)}
                    className="p-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={24} /> : <Sparkles size={24} />}
                    <span className="font-bold hidden md:inline">Processar AI</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {currentView === 'inbox' && (
            <motion.div key="inbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold">Inbox Mental</h2>
                  <p className="text-zinc-500">Transforme o caos em clareza.</p>
                </div>
                <div className="bg-zinc-900 px-4 py-2 rounded-full border border-zinc-800 text-sm font-medium">{rawThoughts.length} pendentes</div>
              </header>
              <div className="grid gap-4">
                {rawThoughts.length === 0 ? (
                  <div className="text-center py-20 border-2 border-dashed border-zinc-800 rounded-3xl">
                    <Inbox className="mx-auto text-zinc-700 mb-4" size={48} />
                    <p className="text-zinc-500 text-lg">Sua mente está limpa.</p>
                  </div>
                ) : (
                  rawThoughts.map(thought => <ThoughtCard key={thought.id} thought={thought} onAction={(status) => updateThoughtStatus(thought.id, status)} onDelete={() => deleteThought(thought.id)} />)
                )}
              </div>
            </motion.div>
          )}

          {currentView === 'kanban' && (
            <motion.div key="kanban" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
              <header><h2 className="text-3xl font-bold">Execução Visual</h2><p className="text-zinc-500">Progresso visível = Dopamina real.</p></header>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KanbanColumn title="A Fazer" thoughts={kanbanThoughts.filter(t => t.kanbanStatus === 'todo')} onMove={(id, status) => updateKanbanStatus(id, status)} type="todo" />
                <KanbanColumn title="Fazendo" thoughts={kanbanThoughts.filter(t => t.kanbanStatus === 'doing')} onMove={(id, status) => updateKanbanStatus(id, status)} type="doing" />
                <KanbanColumn title="Feito" thoughts={kanbanThoughts.filter(t => t.kanbanStatus === 'done')} onMove={(id, status) => updateKanbanStatus(id, status)} type="done" />
              </div>
            </motion.div>
          )}

          {currentView === 'assistant' && (
            <motion.div key="assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col h-[70vh] gap-6">
              <header>
                <h2 className="text-3xl font-bold flex items-center gap-3"><Bot className="text-indigo-500" size={32} />Assistente de Clareza</h2>
                <p className="text-zinc-500">Converse com suas ideias para organizá-las.</p>
              </header>
              <div className="flex-grow bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 flex flex-col overflow-hidden">
                <div className="flex-grow overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
                  {chatHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-zinc-500">
                      <Sparkles size={48} className="animate-pulse" />
                      <p>Como posso ajudar você a organizar sua mente hoje?</p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <motion.div 
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={i} 
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-zinc-700'}`}>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                  {isProcessing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                      <div className="bg-zinc-800 p-4 rounded-2xl rounded-tl-none border border-zinc-700 flex gap-2 items-center">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </motion.div>
                  )}
                </div>
                <div className="relative group">
                  <input
                    type="text"
                    placeholder="Pergunte sobre suas ideias..."
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4 pr-12 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        const val = e.currentTarget.value;
                        e.currentTarget.value = '';
                        const newHistory: Message[] = [...chatHistory, { role: 'user', content: val }];
                        setChatHistory(newHistory);
                        setIsProcessing(true);
                        
                        try {
                          const chat = ai.chats.create({
                            model: "gemini-3.1-flash-lite-preview",
                            config: { systemInstruction: `Você é o assistente do Mental Inbox. Aqui estão os pensamentos do usuário: ${JSON.stringify(thoughts)}. Ajude-o a priorizar e organizar. Seja conciso e direto.` }
                          });
                          const response = await chat.sendMessage({ message: val });
                          setChatHistory([...newHistory, { role: 'model', content: response.text }]);
                        } finally {
                          setIsProcessing(false);
                        }
                      }
                    }}
                  />
                  <Send className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-500 transition-colors" size={20} />
                </div>
              </div>
            </motion.div>
          )}

          {currentView === 'live' && (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-[60vh] gap-8">
              <div className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 ${isLiveActive ? 'bg-indigo-600 shadow-[0_0_50px_rgba(79,70,229,0.5)] scale-110' : 'bg-zinc-900 border-2 border-zinc-800'}`}>
                {isLiveActive ? <Mic size={64} className="animate-pulse" /> : <MicOff size={64} className="text-zinc-700" />}
              </div>
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-2">{isLiveActive ? 'Ouvindo...' : 'Voz em Tempo Real'}</h2>
                <p className="text-zinc-500 max-w-md">Fale naturalmente com o Gemini para capturar e organizar ideias sem usar as mãos.</p>
              </div>
              <button
                onClick={isLiveActive ? stopLiveSession : startLiveSession}
                className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-xl transition-all shadow-xl ${isLiveActive ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'}`}
              >
                {isLiveActive ? <PhoneOff size={24} /> : <Phone size={24} />}
                {isLiveActive ? 'Encerrar Conversa' : 'Começar a Falar'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Error Boundary Placeholder */}
      <div id="error-boundary" />
    </div>
  );
}

function IconButton({ onClick, icon, tooltip }: { onClick: () => void, icon: React.ReactNode, tooltip: string }) {
  return (
    <button onClick={onClick} title={tooltip} className="p-3 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-2xl transition-all">{icon}</button>
  );
}

function NavButton({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, badge?: number }) {
  return (
    <button onClick={onClick} className={`relative flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}>
      {icon}
      <span className="font-medium text-sm">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full ${active ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}>{badge}</span>
      )}
    </button>
  );
}

function ThoughtCard({ thought, onAction, onDelete }: { thought: Thought, onAction: (status: ThoughtStatus) => void, onDelete: () => void }) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl group">
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-2 flex-grow">
          <p className="text-xl leading-relaxed">{thought.content}</p>
          {thought.aiSummary && (
            <div className="flex items-start gap-2 text-indigo-400 text-sm bg-indigo-500/5 p-3 rounded-2xl border border-indigo-500/10">
              <Sparkles size={14} className="mt-1 flex-shrink-0" />
              <p>{thought.aiSummary}</p>
            </div>
          )}
        </div>
      </div>
      {thought.attachments && thought.attachments.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {thought.attachments.map((att, i) => (
            <div key={i} className="relative group/att">
              {att.type === 'image' ? (
                <img src={att.url} className="w-24 h-24 object-cover rounded-2xl border border-zinc-800" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-24 h-24 bg-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-2 text-zinc-500">
                  {att.type === 'video' && <Video size={24} />}
                  {att.type === 'audio' && <Mic size={24} />}
                  {att.type === 'file' && <FileText size={24} />}
                  <span className="text-[10px] px-2 text-center truncate w-full">{att.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => onAction('action')} icon={<CheckCircle2 size={16} />} label="Ação" color="indigo" />
        <ActionButton onClick={() => onAction('future')} icon={<Lightbulb size={16} />} label="Ideia Futura" color="amber" />
        <ActionButton onClick={() => onAction('reference')} icon={<BookOpen size={16} />} label="Referência" color="emerald" />
        <div className="flex-grow" />
        <button onClick={onDelete} className="p-2 text-zinc-600 hover:text-red-400 transition-colors"><Trash2 size={18} /></button>
      </div>
    </motion.div>
  );
}

function ActionButton({ onClick, icon, label, color }: { onClick: () => void, icon: React.ReactNode, label: string, color: 'indigo' | 'amber' | 'emerald' }) {
  const colors = {
    indigo: 'hover:bg-indigo-500/10 hover:text-indigo-400 border-indigo-500/20',
    amber: 'hover:bg-amber-500/10 hover:text-amber-400 border-amber-500/20',
    emerald: 'hover:bg-emerald-500/10 hover:text-emerald-400 border-emerald-500/20'
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${colors[color]}`}>{icon}{label}</button>
  );
}

function KanbanColumn({ title, thoughts, onMove, type }: { title: string, thoughts: Thought[], onMove: (id: string, status: 'todo' | 'doing' | 'done') => void, type: 'todo' | 'doing' | 'done' }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-semibold text-zinc-400 uppercase tracking-wider text-xs">{title}</h3>
        <span className="bg-zinc-900 text-zinc-500 text-[10px] px-2 py-0.5 rounded-full border border-zinc-800">{thoughts.length}</span>
      </div>
      <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl p-3 min-h-[400px] flex flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {thoughts.map(thought => (
            <motion.div key={thought.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-sm group">
              <p className="text-sm mb-4 line-clamp-3">{thought.content}</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {type !== 'todo' && <button onClick={() => onMove(thought.id, type === 'doing' ? 'todo' : 'doing')} className="p-1.5 text-zinc-600 hover:text-zinc-400 rounded-lg bg-zinc-800/50"><X size={14} /></button>}
                </div>
                <div className="flex gap-1">
                  {type !== 'done' && (
                    <button onClick={() => onMove(thought.id, type === 'todo' ? 'doing' : 'done')} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 rounded-xl text-[10px] font-bold transition-all">
                      {type === 'todo' ? 'Começar' : 'Concluir'}<Check size={12} />
                    </button>
                  )}
                  {type === 'done' && <div className="text-emerald-500 p-1.5"><CheckCircle2 size={16} /></div>}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
