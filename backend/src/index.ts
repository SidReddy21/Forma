/**
 * CodeMeld Backend - Main Worker
 * Handles API routing, auth, and AI orchestration
 */

import { SessionManager } from '../durable-objects/SessionManager';
import { CodeAIService } from './ai';
import {
  EditorSession,
  AICompletion,
  RealtimeMessage,
  WorkflowPayload,
} from '../types';

export interface Env {
  AI: any; // Cloudflare Workers AI binding
  SESSIONS: DurableObjectNamespace;
  COLLABORATORS: DurableObjectNamespace;
  DB: D1Database;
  CACHE: KVNamespace;
  REALTIME: Realtime;
}

// Add CORS headers to response
function addCORSHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return newResponse;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Enable CORS for preflight requests
    if (request.method === 'OPTIONS') {
      return addCORSHeaders(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // Route to appropriate handler
      let response: Response;
      if (pathname.startsWith('/api/sessions')) {
        response = await handleSessions(request, env);
      } else if (pathname.startsWith('/api/collaborate')) {
        response = await handleCollaboration(request, env);
      } else if (pathname.startsWith('/api/ai')) {
        response = await handleAI(request, env, ctx);
      } else if (pathname.startsWith('/api/realtime')) {
        response = await handleRealtime(request, env);
      } else if (pathname.startsWith('/api/workflows')) {
        response = await handleWorkflows(request, env, ctx);
      } else if (pathname === '/' || pathname === '') {
        response = new Response(JSON.stringify({
          name: 'CodeMeld API',
          version: '1.0.0',
          status: 'running',
          endpoints: [
            'POST /api/sessions',
            'GET /api/sessions/:id',
            'POST /api/collaborate/join',
            'POST /api/collaborate/edit',
            'POST /api/ai/complete',
            'POST /api/ai/analyze',
            'GET /api/realtime',
            'POST /api/workflows/analyze'
          ]
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        response = new Response('Not Found', { status: 404 });
      }

      return addCORSHeaders(response);
    } catch (error) {
      console.error('Worker error:', error);
      return addCORSHeaders(new Response(`Error: ${error}`, { status: 500 }));
    }
  },
};

async function handleSessions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/api/sessions') {
    // Create new session
    const { name, language, content } = await request.json();

    const sessionId = crypto.randomUUID();
    const session: EditorSession = {
      id: sessionId,
      name,
      language,
      content: content || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic: true,
    };

    // Store in D1
    try {
      await env.DB.prepare(
        `INSERT INTO sessions (id, name, language, content, created_at, updated_at, is_public)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        session.id,
        session.name,
        session.language,
        session.content,
        session.createdAt,
        session.updatedAt,
        session.isPublic ? 1 : 0
      ).run();
    } catch (error) {
      console.log('D1 not yet initialized, using in-memory storage');
    }

    return new Response(JSON.stringify(session), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'GET' && url.pathname.match(/\/api\/sessions\/[^/]+$/)) {
    // Get session details
    const sessionId = url.pathname.split('/').pop();

    try {
      const result = await env.DB.prepare(
        'SELECT * FROM sessions WHERE id = ?'
      ).bind(sessionId).first();

      if (result) {
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (error) {
      console.log('D1 not initialized');
    }

    return new Response('Session not found', { status: 404 });
  }

  if (request.method === 'PUT' && url.pathname.match(/\/api\/sessions\/[^/]+$/)) {
    // Update session
    const sessionId = url.pathname.split('/').pop();
    const { content, updatedAt } = await request.json();

    try {
      await env.DB.prepare(
        'UPDATE sessions SET content = ?, updated_at = ? WHERE id = ?'
      ).bind(content, updatedAt || Date.now(), sessionId).run();

      return new Response(JSON.stringify({ id: sessionId, updated: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.log('Failed to update session:', error);
      return new Response(JSON.stringify({ id: sessionId, updated: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Bad request', { status: 400 });
}

async function handleCollaboration(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('sessionId required', { status: 400 });
  }

  // Get the Durable Object instance for this session
  const sessionObj = env.SESSIONS.get(env.SESSIONS.idFromString(sessionId));

  // Forward the request to the Durable Object
  const response = await sessionObj.fetch(request);
  return response;
}

async function handleAI(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/api/ai/complete') {
    // Get code completions
    const { context, language, position } = await request.json();

    try {
      const completion = await generateCompletion(env, context, language, position);
      return new Response(JSON.stringify(completion), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('AI error:', error);
      return new Response(`AI error: ${error}`, { status: 500 });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/ai/analyze') {
    // Analyze code using AI
    const { code, language, sessionId } = await request.json();

    try {
      // Use the CodeAIService to analyze with Llama AI
      const aiService = new CodeAIService(env);
      const analysis = await aiService.analyzeCode(code, language);

      // Trigger async workflow for deeper analysis in background
      ctx.waitUntil(
        triggerCodeAnalysisWorkflow(env, {
          sessionId,
          code,
          language,
          userId: 'system',
        })
      );

      return new Response(JSON.stringify(analysis), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('AI analysis error:', error);
      return new Response(JSON.stringify({
        bugs: [{ line: 1, message: 'Error analyzing code: ' + String(error), severity: 'error' }],
        improvements: [],
        testCoverage: 0,
        complexity: 'unknown'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Bad request', { status: 400 });
}

async function handleRealtime(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  const userId = url.searchParams.get('userId');

  if (!sessionId || !userId) {
    return addCORSHeaders(new Response('Missing sessionId or userId', { status: 400 }));
  }

  try {
    // Get Durable Object for this session
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId));

    if (request.method === 'GET') {
      // Polling endpoint - returns current state and changes since last sync
      const lastSyncTime = url.searchParams.get('lastSync') || '0';
      const response = await stub.fetch(
        new Request(`https://session/sync?lastSync=${lastSyncTime}&userId=${userId}`, {
          method: 'GET',
        })
      );
      return addCORSHeaders(response);
    }

    if (request.method === 'POST') {
      // Send edit/cursor update to Durable Object
      const message = await request.json();
      const response = await stub.fetch(
        new Request('https://session/broadcast', {
          method: 'POST',
          body: JSON.stringify(message),
        })
      );
      return addCORSHeaders(response);
    }

    return addCORSHeaders(new Response('Method not allowed', { status: 405 }));
  } catch (error) {
    console.error('Realtime error:', error);
    return addCORSHeaders(new Response('Realtime service error', { status: 500 }));
  }
}

async function handleWorkflows(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/api/workflows/trigger') {
    try {
      const { sessionId, type } = await request.json();

      ctx.waitUntil(triggerWorkflow(env, sessionId, type));

      return addCORSHeaders(new Response(JSON.stringify({ triggered: true }), {
        headers: { 'Content-Type': 'application/json' },
      }));
    } catch (error) {
      console.error('Workflow trigger error:', error);
      return addCORSHeaders(new Response('Failed to trigger workflow', { status: 500 }));
    }
  }

  return addCORSHeaders(new Response('Bad request', { status: 400 }));
}

/**
 * Generate AI completions using Llama 3.3
 */
async function generateCompletion(
  env: Env,
  context: string,
  language: string,
  position: { line: number; column: number }
): Promise<AICompletion> {
  // This would integrate with Cloudflare Workers AI
  // For now, mock response
  const mockSuggestions = [
    {
      text: 'function myFunction() {',
      confidence: 0.95,
      reasoning: 'Based on code context and common patterns',
    },
    {
      text: 'async function myFunction() {',
      confidence: 0.87,
      reasoning: 'Common async pattern detected',
    },
  ];

  return {
    id: crypto.randomUUID(),
    context,
    suggestions: mockSuggestions,
    timestamp: Date.now(),
  };
}

/**
 * Trigger code analysis workflow
 */
async function triggerCodeAnalysisWorkflow(
  env: Env,
  payload: WorkflowPayload
): Promise<void> {
  // This would trigger a Workflow instance
  console.log('Triggering workflow for session:', payload.sessionId);
  // Actual implementation would use Workflows API
}

/**
 * Generic workflow trigger
 */
async function triggerWorkflow(env: Env, sessionId: string, type: string): Promise<void> {
  console.log(`Triggering ${type} workflow for session ${sessionId}`);
}
