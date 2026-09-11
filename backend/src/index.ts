export { SessionManager } from './SessionManager';

export interface Env {
  SESSIONS: DurableObjectNamespace;
  DB: D1Database;
  ASSETS: Fetcher;
  AI?: import('./AgentModel').AIBinding;
  AGENT_MODEL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ name: 'Forma', ok: true });
    const match = url.pathname.match(/^\/ws\/([a-zA-Z0-9_-]{1,80})$/);
    if (match) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        return new Response('WebSocket required', { status: 426 });
      const origin = request.headers.get('Origin');
      if (origin && new URL(origin).host !== url.host)
        return new Response('Origin not allowed', { status: 403 });
      return env.SESSIONS.get(env.SESSIONS.idFromName(match[1])).fetch(request);
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/'))
      return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
