export type ThoughtStatus = 'raw' | 'action' | 'future' | 'reference' | 'discarded';

export interface Attachment {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  name?: string;
  mimeType: string;
}

export interface Thought {
  id: string;
  uid: string;
  content: string;
  createdAt: number;
  status: ThoughtStatus;
  kanbanStatus?: 'todo' | 'doing' | 'done';
  attachments?: Attachment[];
  aiSummary?: string;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
}

export type View = 'capture' | 'inbox' | 'kanban' | 'assistant' | 'live';
