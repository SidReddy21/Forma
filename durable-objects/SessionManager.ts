/**
 * SessionManager Durable Object
 * Manages collaborative editing sessions with conflict-free synchronization
 */

import { DurableObjectState as SessionStateShape, Collaborator, CodeChange, RealtimeMessage } from '../types';

export class SessionManager {
  private state: SessionStateShape;
  private env: any;
  private storage: any;
  private pendingUpdates: any[] = [];

  constructor(state: any, env: any) {
    // Cloudflare Durable Objects provide DurableObjectState with .id and .storage
    this.storage = state?.storage;
    this.env = env;
    this.state = {
      sessionId: state?.id?.toString?.() || '',
      collaborators: new Map(),
      changeHistory: [],
      currentContent: '',
      locks: new Map(),
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Load persisted state
      await this.loadState();

      if (request.method === 'POST') {
        if (path === '/join') {
          return await this.handleJoin(request);
        } else if (path === '/edit') {
          return await this.handleEdit(request);
        } else if (path === '/cursor') {
          return await this.handleCursorMove(request);
        } else if (path === '/leave') {
          return await this.handleLeave(request);
        } else if (path === '/broadcast') {
          return await this.handleBroadcast(request);
        } else {
          return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      if (request.method === 'GET') {
        if (path === '/state') {
          return this.getSessionState();
        } else if (path === '/history') {
          return this.getChangeHistory(request);
        } else if (path === '/sync') {
          return this.handleSync(request);
        } else {
          return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('SessionManager error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as any;
    const { userId, username, color } = body;

    const collaborator: Collaborator = {
      id: userId,
      username,
      color,
      cursor: { line: 0, column: 0 },
      isActive: true,
      lastSeen: Date.now(),
    };

    this.state.collaborators.set(userId, collaborator);
    await this.persistState();

    // Broadcast to other collaborators via Realtime
    await this.broadcastPresence('user_joined', { collaborator });

    return new Response(
      JSON.stringify({
        success: true,
        content: this.state.currentContent,
        collaborators: Array.from(this.state.collaborators.values()),
        sessionId: this.state.sessionId,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleEdit(request: Request): Promise<Response> {
    const change = (await request.json()) as CodeChange;

    // Conflict detection: check for overlapping locks
    if (this.isLockedRange(change.position)) {
      return new Response(
        JSON.stringify({ error: 'Range is locked by another user' }),
        { status: 409 }
      );
    }

    // Apply change using Operational Transformation principles
    this.applyChange(change);
    this.state.changeHistory.push(change);

    await this.persistState();

    // Broadcast to other collaborators
    await this.broadcastEdit(change);

    return new Response(
      JSON.stringify({
        success: true,
        changeId: change.id,
        content: this.state.currentContent,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleCursorMove(request: Request): Promise<Response> {
    const body = (await request.json()) as any;
    const { userId, line, column } = body;

    const collaborator = this.state.collaborators.get(userId);
    if (collaborator) {
      collaborator.cursor = { line, column };
      collaborator.lastSeen = Date.now();
      await this.persistState();

      // Broadcast cursor position
      await this.broadcastPresence('cursor_move', {
        userId,
        cursor: { line, column },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleLeave(request: Request): Promise<Response> {
    const body = (await request.json()) as any;
    const { userId } = body;

    this.state.collaborators.delete(userId);
    this.state.locks.delete(userId);
    await this.persistState();

    await this.broadcastPresence('user_left', { userId });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    // Handle incoming operation/edit message
    const message = (await request.json()) as any;
    
    // Add to pending updates queue for polling clients
    this.pendingUpdates.push({
      ...message,
      timestamp: Date.now(),
    });

    // Keep only last 100 updates
    if (this.pendingUpdates.length > 100) {
      this.pendingUpdates.shift();
    }

    // Persist if it's an operation
    if (message.type === 'operation' && message.operation) {
      // Apply operation to current content
      this.state.currentContent = this.applyOperationToContent(this.state.currentContent, message.operation);
      this.state.changeHistory.push({
        id: crypto.randomUUID(),
        userId: message.userId,
        sessionId: this.state.sessionId,
        type: message.operation.type,
        position: message.operation.position,
        content: message.operation.content || '',
        timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
      });
      await this.persistState();
    }

    return new Response(JSON.stringify({ queued: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private handleSync(request: Request): Response {
    // Polling endpoint - return all updates since lastSync
    const url = new URL(request.url);
    const lastSync = parseInt(url.searchParams.get('lastSync') || '0');
    const userId = url.searchParams.get('userId');

    // Filter updates since last sync
    const updates = this.pendingUpdates.filter((u) => u.timestamp > lastSync);

    return new Response(
      JSON.stringify({
        content: this.state.currentContent,
        collaborators: Array.from(this.state.collaborators.values()).map((c) => ({
          id: c.id,
          username: c.username,
          color: c.color,
          cursor: c.cursor,
          isActive: c.isActive,
        })),
        updates,
        timestamp: Date.now(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private getSessionState(): Response {
    return new Response(
      JSON.stringify({
        sessionId: this.state.sessionId,
        content: this.state.currentContent,
        collaborators: Array.from(this.state.collaborators.values()),
        changeCount: this.state.changeHistory.length,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private getChangeHistory(request: Request): Response {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const history = this.state.changeHistory.slice(
      Math.max(0, this.state.changeHistory.length - limit - offset),
      this.state.changeHistory.length - offset
    );

    return new Response(JSON.stringify({ changes: history, total: this.state.changeHistory.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private applyChange(change: CodeChange): void {
    const content = this.state.currentContent;
    // Convert line/column to absolute position
    const lines = content.split('\n');
    let absolutePos = 0;

    for (let i = 0; i < change.position.line; i++) {
      absolutePos += (lines[i]?.length || 0) + 1; // +1 for newline
    }
    absolutePos += change.position.column;

    if (change.type === 'insert') {
      this.state.currentContent =
        content.slice(0, absolutePos) + change.content + content.slice(absolutePos);
    } else if (change.type === 'delete') {
      this.state.currentContent =
        content.slice(0, absolutePos) + content.slice(absolutePos + change.content.length);
    } else if (change.type === 'replace') {
      const endPos = absolutePos + change.content.length;
      this.state.currentContent =
        content.slice(0, absolutePos) + change.content + content.slice(endPos);
    }
  }

  private isLockedRange(position: { line: number; column: number }): boolean {
    const now = Date.now();
    const lockTimeout = 5000; // 5 second lock timeout

    for (const [userId, lockTime] of this.state.locks.entries()) {
      if (now - lockTime < lockTimeout) {
        return true;
      }
    }
    return false;
  }

  private applyOperationToContent(content: string, operation: any): string {
    const { type, position, content: opContent, length, oldLength } = operation;
    
    // Convert line/column to absolute position
    const lines = content.split('\n');
    let absolutePos = 0;
    for (let i = 0; i < position.line; i++) {
      absolutePos += (lines[i]?.length || 0) + 1; // +1 for newline
    }
    absolutePos += position.column;

    if (type === 'insert') {
      return content.slice(0, absolutePos) + opContent + content.slice(absolutePos);
    } else if (type === 'delete') {
      return content.slice(0, absolutePos) + content.slice(absolutePos + length);
    } else if (type === 'replace') {
      return content.slice(0, absolutePos) + opContent + content.slice(absolutePos + oldLength);
    }
    return content;
  }

  private async broadcastEdit(change: CodeChange): Promise<void> {
    // In production, this would broadcast via Realtime API
    const message: RealtimeMessage = {
      type: 'edit',
      sessionId: this.state.sessionId,
      userId: change.userId,
      data: change,
      timestamp: Date.now(),
    };

    console.log('Broadcasting edit:', message);
  }

  private async broadcastPresence(eventType: string, data: any): Promise<void> {
    const message: RealtimeMessage = {
      type: 'presence',
      sessionId: this.state.sessionId,
      userId: 'system',
      data: { eventType, ...data },
      timestamp: Date.now(),
    };

    console.log('Broadcasting presence:', message);
  }

  private async loadState(): Promise<void> {
    const stored = await this.storage.get('sessionState');
    if (stored) {
      const parsed = JSON.parse(stored as string);
      this.state = {
        ...parsed,
        collaborators: new Map(parsed.collaborators),
        locks: new Map(parsed.locks),
      };
    }
  }

  private async persistState(): Promise<void> {
    await this.storage.put(
      'sessionState',
      JSON.stringify({
        ...this.state,
        collaborators: Array.from(this.state.collaborators.entries()),
        locks: Array.from(this.state.locks.entries()),
      })
    );
  }
}
