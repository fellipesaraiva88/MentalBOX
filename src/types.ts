export type ItemType = 'ideia' | 'tarefa' | 'insight' | 'melhoria' | 'projeto';
export type ItemStatus = 'capturado' | 'em_analise' | 'direcao_ativa' | 'incubado' | 'concluido' | 'arquivado';
export type ItemContext = 'produto' | 'conteudo' | 'operacao' | 'pessoal' | 'geral';

export interface Attachment {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  name: string;
  mimeType: string;
}

export interface AppItem {
  id: string;
  uid: string;
  type: ItemType;
  title: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  status: ItemStatus;
  context?: ItemContext;
  projectId?: string;
  tags?: string[];
  attachments?: Attachment[];
  priority?: 'low' | 'medium' | 'high';
}

export interface CommandHistory {
  id: string;
  uid: string;
  command: string;
  response: string;
  timestamp: number;
  undoData?: any;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
}

export type View = 'focus' | 'backlog' | 'projects' | 'assistant' | 'live';
