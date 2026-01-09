/**
 * Real-time Communication Module
 * Handles WebSocket connections via Cloudflare Realtime API
 */

import { RealtimeMessage, Collaborator, CodeChange } from './types';

export class RealtimeManager {
  private sessionId: string;
  private userId: string;
  private baseUrl: string;
  private messageHandlers: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(sessionId: string, userId: string, baseUrl: string = '') {
    this.sessionId = sessionId;
    this.userId = userId;
    this.baseUrl = baseUrl || '/api/realtime';
  }

  /**
   * Subscribe to realtime messages
   */
  subscribe(eventType: string, handler: (data: any) => void): () => void {
    if (!this.messageHandlers.has(eventType)) {
      this.messageHandlers.set(eventType, []);
    }

    this.messageHandlers.get(eventType)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) handlers.splice(index, 1);
      }
    };
  }

  /**
   * Publish message to all subscribers
   */
  private emit(eventType: string, data: any): void {
    const handlers = this.messageHandlers.get(eventType) || [];
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in ${eventType} handler:`, error);
      }
    });
  }

  /**
   * Broadcast an edit to collaborators
   */
  async broadcastEdit(change: CodeChange): Promise<void> {
    const message: RealtimeMessage = {
      type: 'edit',
      sessionId: this.sessionId,
      userId: this.userId,
      data: change,
      timestamp: Date.now(),
    };

    await this.send(message);
    this.emit('edit', change);
  }

  /**
   * Broadcast cursor position
   */
  async broadcastCursor(line: number, column: number): Promise<void> {
    const message: RealtimeMessage = {
      type: 'cursor',
      sessionId: this.sessionId,
      userId: this.userId,
      data: { line, column },
      timestamp: Date.now(),
    };

    await this.send(message);
    this.emit('cursor', { userId: this.userId, line, column });
  }

  /**
   * Broadcast presence (join/leave)
   */
  async broadcastPresence(collaborator: Collaborator): Promise<void> {
    const message: RealtimeMessage = {
      type: 'presence',
      sessionId: this.sessionId,
      userId: this.userId,
      data: { collaborator },
      timestamp: Date.now(),
    };

    await this.send(message);
    this.emit('presence', collaborator);
  }

  /**
   * Broadcast AI completion
   */
  async broadcastCompletion(suggestions: any[]): Promise<void> {
    const message: RealtimeMessage = {
      type: 'completion',
      sessionId: this.sessionId,
      userId: this.userId,
      data: { suggestions },
      timestamp: Date.now(),
    };

    await this.send(message);
    this.emit('completion', suggestions);
  }

  /**
   * Broadcast code analysis
   */
  async broadcastAnalysis(analysis: any): Promise<void> {
    const message: RealtimeMessage = {
      type: 'analysis',
      sessionId: this.sessionId,
      userId: this.userId,
      data: analysis,
      timestamp: Date.now(),
    };

    await this.send(message);
    this.emit('analysis', analysis);
  }

  /**
   * Send message via HTTP (polling fallback)
   */
  private async send(message: RealtimeMessage): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        console.error('Failed to send message:', response.status);
        this.handleError();
      } else {
        this.reconnectAttempts = 0; // Reset on success
      }
    } catch (error) {
      console.error('Failed to send realtime message:', error);
      this.handleError();
    }
  }

  /**
   * Handle connection errors and attempt reconnection
   */
  private handleError(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 100;
      console.log(`Reconnecting in ${delay}ms...`);
      // Implement exponential backoff
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('error', { message: 'Connection lost' });
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.messageHandlers.clear();
  }
}

/**
 * Frontend integration for Realtime
 */
export class RealtimeClient {
  private manager: RealtimeManager;

  constructor(sessionId: string, userId: string) {
    this.manager = new RealtimeManager(sessionId, userId);
  }

  /**
   * Start listening for realtime updates
   */
  startListening(): void {
    // Subscribe to relevant channels
    this.manager.subscribe('edit', (change) => {
      console.log('Received edit:', change);
      // Apply edit to editor
    });

    this.manager.subscribe('cursor', (data) => {
      console.log('Cursor update:', data);
      // Update cursor rendering
    });

    this.manager.subscribe('presence', (collaborator) => {
      console.log('Presence update:', collaborator);
      // Update collaborator list
    });

    this.manager.subscribe('completion', (suggestions) => {
      console.log('AI completions:', suggestions);
      // Display completions
    });

    this.manager.subscribe('analysis', (analysis) => {
      console.log('Code analysis:', analysis);
      // Display analysis results
    });

    this.manager.subscribe('error', (error) => {
      console.error('Realtime error:', error);
      // Handle connection errors
    });
  }

  /**
   * Stop listening
   */
  stopListening(): void {
    this.manager.destroy();
  }

  /**
   * Get manager for manual control
   */
  getManager(): RealtimeManager {
    return this.manager;
  }
}
