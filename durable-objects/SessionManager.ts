/**
 * SessionManager Durable Object
 * Manages collaborative editing sessions with conflict-free synchronization
 */

import { DurableObjectState, Collaborator, CodeChange, RealtimeMessage } from '../types';

export class SessionManager {
  private state: DurableObjectState;
  private env: any;
  private storage: DurableObjectStorage;
  private pendingUpdates: any[] = [];

  constructor(state: DurableObjectStorage, env: any) {
    this.storage = state;
    this.env = env;
    this.state = {
      sessionId: state.id.toString(),
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
        }
      }

      if (request.method === 'GET') {
        if (path === '/state') {
          return this.getSessionState();
        } else if (path === '/history') {
          return this.getChangeHistory(request);
        } else if (path === '/sync') {
          return this.handleSync(request);
        }
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('SessionManager error:', error);
      return new Response(`Error: ${error}`, { status: 500 });
    }
  }

  private async handleJoin(request: Request): Promise<Response> {
    const { userId, username, color } = await request.json();

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
    const change: CodeChange = await request.json();

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
    const { userId, line, column } = await request.json();

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
    const { userId } = await request.json();

    this.state.collaborators.delete(userId);
    this.state.locks.delete(userId);
    await this.persistState();

    await this.broadcastPresence('user_left', { userId });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    // Handle incoming update/edit message
    const message = await request.json();
    
    // Add to pending updates queue for polling clients
    this.pendingUpdates.push({
      ...message,
      timestamp: Date.now(),
    });

    // Keep only last 100 updates
    if (this.pendingUpdates.length > 100) {
      this.pendingUpdates.shift();
    }

    // Persist if it's an edit
    if (message.type === 'edit') {
      this.state.changeHistory.push(message);
      this.state.currentContent = message.newContent || this.state.currentContent;
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
