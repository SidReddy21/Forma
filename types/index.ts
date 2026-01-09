/**
 * CodeMeld Shared Types
 */

export interface EditorSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  language: string;
  content: string;
  isPublic: boolean;
}

export interface Collaborator {
  id: string;
  username: string;
  color: string;
  cursor: {
    line: number;
    column: number;
  };
  isActive: boolean;
  lastSeen: number;
}

export interface CodeChange {
  id: string;
  userId: string;
  sessionId: string;
  type: 'insert' | 'delete' | 'replace';
  position: { line: number; column: number };
  content: string;
  timestamp: number;
}

export interface AICompletion {
  id: string;
  context: string;
  suggestions: {
    text: string;
    confidence: number;
    reasoning: string;
  }[];
  timestamp: number;
}

export interface CodeAnalysisReport {
  sessionId: string;
  timestamp: number;
  bugs: {
    line: number;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    suggestion: string;
  }[];
  improvements: {
    category: string;
    suggestions: string[];
  }[];
  testCoverage: number;
  complexity: 'low' | 'medium' | 'high';
}

export interface RealtimeMessage {
  type: 'cursor' | 'edit' | 'completion' | 'presence' | 'analysis';
  sessionId: string;
  userId: string;
  data: Record<string, any>;
  timestamp: number;
}

export interface DurableObjectState {
  sessionId: string;
  collaborators: Map<string, Collaborator>;
  changeHistory: CodeChange[];
  currentContent: string;
  locks: Map<string, number>; // userId -> timestamp
}

export interface WorkflowPayload {
  sessionId: string;
  code: string;
  language: string;
  userId: string;
}

export interface WorkflowResult {
  sessionId: string;
  analysis: CodeAnalysisReport;
  generatedTests: string;
  documentation: string;
}
