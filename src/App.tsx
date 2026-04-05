/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Phone,
  Bell
} from 'lucide-react';
import { AppItem, ItemType, View, Attachment, Message, CommandHistory } from './types';
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
import { 
  Server, 
  Cpu, 
  Globe, 
  Zap, 
  Shield, 
  Layers, 
  Activity, 
  Search,
  Filter,
  MoreVertical,
  ChevronRight,
  ExternalLink,
  Clock,
  Calendar,
  AlertCircle,
  GripVertical
} from 'lucide-react';

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

const AttachmentRenderer = ({ attachments }: { attachments: Attachment[] }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mt-4">
      {attachments.map((att, i) => (
        <div key={i} className="relative group/att rounded-xl overflow-hidden border border-zinc-700 bg-zinc-800/50 flex items-center justify-center">
          {att.type === 'image' ? (
            <img src={att.url} alt={att.name} className="max-w-full max-h-48 object-contain" referrerPolicy="no-referrer" />
          ) : att.type === 'video' ? (
            <video src={att.url} controls className="max-w-full max-h-48" />
          ) : (
            <a href={att.url} download={att.name} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 hover:bg-zinc-700 transition-colors">
              <FileText size={20} className="text-zinc-400" />
              <span className="text-sm text-zinc-300 truncate max-w-[150px]">{att.name}</span>
            </a>
          )}
        </div>
      ))}
    </div>
  );
};

const FocusView = ({ items, onComplete, onCapture, onChat, onPriorityUpdate, isProcessing, inputValue, setInputValue, attachments, onFileUpload }: { 
  items: AppItem[], 
  onComplete: (id: string) => void,
  onCapture: (text: string) => void,
  onChat: (item: AppItem) => void,
  onPriorityUpdate: (id: string, priority: 'low' | 'medium' | 'high') => void,
  isProcessing: boolean,
  inputValue: string,
  setInputValue: (val: string) => void,
  attachments: Attachment[],
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}) => {
  const activeDirection = items.find(i => i.status === 'direcao_ativa');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-12">
      {activeDirection ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-2xl bg-zinc-900/80 border-2 border-indigo-500/30 rounded-3xl p-8 shadow-2xl shadow-indigo-500/10 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-500/20 text-indigo-400 p-2 rounded-xl">
              <CheckCircle2 size={24} />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-400 flex-1">Direção Atual</h2>
            <div className="flex items-center gap-1 bg-zinc-900/80 rounded-lg p-1 border border-zinc-800">
              <button onClick={() => onPriorityUpdate(activeDirection.id, 'low')} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${activeDirection.priority === 'low' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:bg-zinc-800'}`}>Low</button>
              <button onClick={() => onPriorityUpdate(activeDirection.id, 'medium')} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${(activeDirection.priority === 'medium' || !activeDirection.priority) ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-500 hover:bg-zinc-800'}`}>Med</button>
              <button onClick={() => onPriorityUpdate(activeDirection.id, 'high')} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${activeDirection.priority === 'high' ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-500 hover:bg-zinc-800'}`}>High</button>
            </div>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-display font-black mb-4 leading-tight">{activeDirection.title}</h1>
          {activeDirection.content && (
            <p className="text-zinc-400 text-lg mb-8 leading-relaxed">{activeDirection.content}</p>
          )}
          {activeDirection.attachments && (
            <div className="mb-8">
              <AttachmentRenderer attachments={activeDirection.attachments} />
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <button 
              onClick={() => onComplete(activeDirection.id)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
            >
              <Check size={20} />
              Concluir
            </button>
            <button 
              onClick={() => onChat(activeDirection)}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Bot size={20} />
              Discutir
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="text-center space-y-4">
          <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-800 shadow-inner">
            <CheckCircle2 className="text-zinc-700" size={40} />
          </div>
          <h2 className="text-3xl font-display font-black text-zinc-300">Mente Limpa</h2>
          <p className="text-zinc-500 text-lg">Nenhuma direção ativa no momento.</p>
        </div>
      )}

      <div className="w-full max-w-2xl relative group mt-8">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (inputValue.trim() || attachments.length > 0) onCapture(inputValue);
            }
          }}
          placeholder="O que está na sua cabeça agora?"
          className="w-full bg-zinc-900/50 border-2 border-zinc-800 rounded-3xl p-6 pb-16 text-xl focus:outline-none focus:border-indigo-500/50 transition-all resize-none min-h-[120px] shadow-inner"
        />
        
        {attachments.length > 0 && (
          <div className="absolute bottom-16 left-4 right-4 mb-2">
            <AttachmentRenderer attachments={attachments} />
          </div>
        )}

        <div className="absolute bottom-4 left-4 flex gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={onFileUpload} 
            className="hidden" 
            multiple 
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-zinc-500 hover:text-indigo-400 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors"
            title="Anexar arquivo"
          >
            <Paperclip size={20} />
          </button>
        </div>

        <button
          onClick={() => onCapture(inputValue)}
          disabled={isProcessing || (!inputValue.trim() && attachments.length === 0)}
          className="absolute bottom-4 right-4 p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-xl transition-all shadow-lg active:scale-95"
        >
          {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
        </button>
      </div>
    </div>
  );
};

const BacklogView = ({ items, onAction, onDelete, onPriorityUpdate }: { 
  items: AppItem[], 
  onAction: (id: string, status: string) => void,
  onDelete: (id: string) => void,
  onPriorityUpdate: (id: string, priority: 'low' | 'medium' | 'high') => void
}) => {
  const backlogItems = items.filter(i => i.status !== 'direcao_ativa' && i.status !== 'concluido' && i.status !== 'arquivado');

  const getPriorityColor = (p?: string) => {
    switch(p) {
      case 'high': return 'text-rose-400 bg-rose-400/10';
      case 'medium': return 'text-amber-400 bg-amber-400/10';
      case 'low': return 'text-emerald-400 bg-emerald-400/10';
      default: return 'text-zinc-400 bg-zinc-800';
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-4xl font-display font-black tracking-tight">Backlog Invisível</h2>
        <p className="text-zinc-500 mt-1">Suas ideias capturadas, aguardando o momento certo.</p>
      </header>

      <div className="grid gap-4">
        {backlogItems.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/30 rounded-3xl border border-zinc-800 border-dashed">
            <Layers className="text-zinc-700 mx-auto mb-4" size={32} />
            <p className="text-zinc-500">O backlog está vazio.</p>
          </div>
        ) : (
          backlogItems.map(item => (
            <div key={item.id} className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl flex items-start justify-between group hover:border-zinc-700 transition-colors">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 bg-zinc-800 px-2 py-1 rounded-md">{item.type}</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md">{item.status}</span>
                  
                  <div className="flex items-center gap-1 ml-auto bg-zinc-900/80 rounded-lg p-1 border border-zinc-800">
                    <button onClick={() => onPriorityUpdate(item.id, 'low')} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${item.priority === 'low' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:bg-zinc-800'}`}>Low</button>
                    <button onClick={() => onPriorityUpdate(item.id, 'medium')} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${(item.priority === 'medium' || !item.priority) ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-500 hover:bg-zinc-800'}`}>Med</button>
                    <button onClick={() => onPriorityUpdate(item.id, 'high')} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${item.priority === 'high' ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-500 hover:bg-zinc-800'}`}>High</button>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-zinc-200">{item.title}</h3>
                {item.content && <p className="text-zinc-400 text-sm mt-1 line-clamp-2">{item.content}</p>}
                {item.attachments && <AttachmentRenderer attachments={item.attachments} />}
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onAction(item.id, 'direcao_ativa')} className="p-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl transition-colors" title="Tornar Direção Ativa">
                  <ArrowRight size={18} />
                </button>
                <button onClick={() => onDelete(item.id)} className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-colors" title="Excluir">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [items, setItems] = useState<AppItem[]>([]);
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [currentView, setCurrentView] = useState<View>('focus');
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedItem, setSelectedItem] = useState<AppItem | null>(null);
  
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
      setItems([]);
      setCommandHistory([]);
      return;
    }

    const qItems = query(collection(db, `users/${user.uid}/items`));
    const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as AppItem);
      setItems(data.sort((a, b) => b.createdAt - a.createdAt));
    }, (error) => {
      handleFirestoreError(error, 'list', `users/${user.uid}/items`);
    });

    const qCommands = query(collection(db, `users/${user.uid}/commands`));
    const unsubscribeCommands = onSnapshot(qCommands, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as CommandHistory);
      setCommandHistory(data.sort((a, b) => b.timestamp - a.timestamp));
    }, (error) => {
      handleFirestoreError(error, 'list', `users/${user.uid}/commands`);
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

    return () => {
      unsubscribeItems();
      unsubscribeCommands();
    };
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
      const f = file as File;
      const reader = new FileReader();
      const promise = new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
      });
      reader.readAsDataURL(f);
      const url = await promise;
      
      let type: Attachment['type'] = 'file';
      if (f.type.startsWith('image/')) type = 'image';
      else if (f.type.startsWith('video/')) type = 'video';
      else if (f.type.startsWith('audio/')) type = 'audio';

      newAttachments.push({
        type,
        url,
        name: f.name,
        mimeType: f.type
      });
    }
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const processCommand = async () => {
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

      const hasImages = attachments.some(a => a.type === 'image');
      const modelName = hasImages ? "gemini-3.1-pro-preview" : "gemini-3.1-flash-lite-preview";

      const existingContext = items.slice(0, 20).map(t => ({ id: t.id, type: t.type, title: t.title, status: t.status }));

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts }],
        config: {
          responseMimeType: "application/json",
          systemInstruction: `Você é o motor de decisão do Mental Inbox.
          Seu objetivo é reduzir a carga cognitiva do usuário, ajudando-o a focar em uma única direção clara por vez.
          
          Interprete o input do usuário e decida a ação.
          
          Ações possíveis: CREATE, UPDATE, DELETE, QUERY.
          Tipos de entidade: ideia, tarefa, insight, melhoria, projeto.
          Status possíveis: capturado, em_analise, direcao_ativa, incubado, concluido, arquivado.
          
          Contexto atual (últimos itens): ${JSON.stringify(existingContext)}
          
          REGRAS CRÍTICAS:
          1. Só pode haver UM item com status 'direcao_ativa' por vez.
          2. Se o usuário estiver apenas capturando algo novo, o status deve ser 'capturado'.
          3. Se o usuário estiver pedindo para focar nisso agora, e já houver uma 'direcao_ativa', mude a atual para 'incubado' e a nova para 'direcao_ativa'.
          
          Formato do JSON de saída:
          {
            "action": "CREATE",
            "entityType": "ideia",
            "data": {
              "title": "Título curto e direto",
              "content": "Descrição detalhada",
              "status": "capturado",
              "context": "geral"
            },
            "targetId": "id-do-item-se-update-ou-delete",
            "responseMessage": "Mensagem curta confirmando o que foi feito."
          }`,
        }
      });

      const aiResponse = JSON.parse(response.text || "{}");
      
      if (aiResponse.action === 'CREATE') {
        const id = crypto.randomUUID();
        const newItem: AppItem = {
          id,
          uid: user.uid,
          type: aiResponse.entityType || 'ideia',
          title: aiResponse.data?.title || inputValue.substring(0, 50),
          content: aiResponse.data?.content || inputValue,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: aiResponse.data?.status || 'capturado',
          ...aiResponse.data,
        };

        if (attachments.length > 0) {
          newItem.attachments = attachments;
        }

        // If making this the active direction, we should ideally demote the current one,
        // but for simplicity in this MVP, we'll just let the UI handle showing the latest active one.
        await setDoc(doc(db, `users/${user.uid}/items`, id), newItem);
      } else if (aiResponse.action === 'UPDATE' && aiResponse.targetId) {
        await updateDoc(doc(db, `users/${user.uid}/items`, aiResponse.targetId), {
          ...aiResponse.data,
          updatedAt: Date.now()
        });
      } else if (aiResponse.action === 'DELETE' && aiResponse.targetId) {
        await deleteDoc(doc(db, `users/${user.uid}/items`, aiResponse.targetId));
      }

      // Save command history
      const commandId = crypto.randomUUID();
      await setDoc(doc(db, `users/${user.uid}/commands`, commandId), {
        id: commandId,
        uid: user.uid,
        command: inputValue,
        response: aiResponse.responseMessage || "Comando executado.",
        timestamp: Date.now(),
        undoData: JSON.stringify(aiResponse)
      });

      setInputValue('');
      setAttachments([]);
    } catch (error: any) {
      handleFirestoreError(error, 'create', `users/${user?.uid}/items`);
    } finally {
      setIsProcessing(false);
    }
  };

  const addItem = async () => {
    if (!user) return login();
    if (!inputValue.trim() && attachments.length === 0) return;
    
    const id = crypto.randomUUID();
    const newItem: AppItem = {
      id,
      uid: user.uid,
      type: 'ideia',
      title: inputValue.trim().substring(0, 50) || (attachments.length > 0 ? `Anexo: ${attachments[0].name}` : "Nova ideia"),
      content: inputValue.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'capturado',
      context: 'geral'
    };

    if (attachments.length > 0) {
      newItem.attachments = attachments;
    }

    try {
      await setDoc(doc(db, `users/${user.uid}/items`, id), newItem);
      setInputValue('');
      setAttachments([]);
    } catch (error: any) {
      handleFirestoreError(error, 'create', `users/${user.uid}/items`);
    }
  };

  const updateItemStatus = async (id: string, status: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/items`, id), { status, updatedAt: Date.now() });
    } catch (error: any) {
      handleFirestoreError(error, 'update', `users/${user.uid}/items/${id}`);
    }
  };

  const updateItemPriority = async (id: string, priority: 'low' | 'medium' | 'high') => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/items`, id), { priority, updatedAt: Date.now() });
    } catch (error: any) {
      handleFirestoreError(error, 'update', `users/${user.uid}/items/${id}`);
    }
  };

  const deleteItem = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/items`, id));
    } catch (error: any) {
      handleFirestoreError(error, 'delete', `users/${user.uid}/items/${id}`);
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

  const rawItems = items.filter(t => t.status === 'open');
  const kanbanItems = items.filter(t => t.status === 'todo' || t.status === 'doing' || t.status === 'done');

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
        <NavButton active={currentView === 'focus'} onClick={() => setCurrentView('focus')} icon={<CheckCircle2 size={20} />} label="Foco" />
        <NavButton active={currentView === 'backlog'} onClick={() => setCurrentView('backlog')} icon={<Layers size={20} />} label="Backlog" badge={items.length} />
        <div className="w-px h-8 bg-zinc-800 mx-1" />
        <NavButton active={currentView === 'assistant'} onClick={() => setCurrentView('assistant')} icon={<Bot size={20} />} label="AI Chat" />
        <NavButton active={currentView === 'live'} onClick={() => setCurrentView('live')} icon={<Mic size={20} />} label="Voz" />
      </nav>

      <main className="max-w-4xl mx-auto px-6 pt-24 pb-32">
        <AnimatePresence mode="wait">
          {currentView === 'focus' && (
            <FocusView 
              items={items} 
              onComplete={(id) => updateItemStatus(id, 'concluido')}
              onCapture={(text) => {
                setInputValue(text);
                processCommand();
              }}
              onChat={(item) => {
                setSelectedItem(item);
                setCurrentView('assistant');
              }}
              onPriorityUpdate={updateItemPriority}
              isProcessing={isProcessing}
              inputValue={inputValue}
              setInputValue={setInputValue}
              attachments={attachments}
              onFileUpload={handleFileUpload}
            />
          )}

          {currentView === 'backlog' && (
            <BacklogView 
              items={items} 
              onAction={(id, status) => updateItemStatus(id, status)}
              onDelete={deleteItem}
              onPriorityUpdate={updateItemPriority}
            />
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
                            config: { systemInstruction: `Você é o Assistente de Clareza do Mental Inbox. Seu objetivo é ajudar o usuário a focar em uma única direção. Aqui estão os itens do usuário no backlog: ${JSON.stringify(items)}. Ajude-o a priorizar, organizar e definir o próximo passo. Seja extremamente conciso, direto e prático.` }
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
    <button 
      onClick={onClick} 
      title={tooltip} 
      className="p-3.5 text-zinc-500 hover:text-indigo-400 bg-zinc-900/50 hover:bg-indigo-500/10 border border-zinc-800 hover:border-indigo-500/30 rounded-2xl transition-all shadow-sm active:scale-95"
    >
      {icon}
    </button>
  );
}

function NavButton({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, badge?: number }) {
  return (
    <button 
      onClick={onClick} 
      className={`relative flex items-center gap-2.5 px-5 py-2.5 rounded-2xl transition-all duration-300 ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 scale-105' : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'}`}
    >
      <span className={`${active ? 'scale-110' : ''} transition-transform`}>{icon}</span>
      <span className="font-bold text-sm tracking-tight">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] flex items-center justify-center text-[10px] font-black rounded-full border-2 ${active ? 'bg-white text-indigo-600 border-indigo-600' : 'bg-indigo-600 text-white border-[#0a0a0a]'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
