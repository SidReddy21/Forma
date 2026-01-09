/**
 * Integration Test Suite
 * Tests core functionality of CodeMeld
 */

import { describe, it, expect } from '@jest/globals';

describe('CodeMeld Integration Tests', () => {
  describe('Session Management', () => {
    it('should create a new session', async () => {
      const response = await fetch('http://localhost:8787/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Session',
          language: 'typescript',
          content: '',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.name).toBe('Test Session');
    });

    it('should retrieve session', async () => {
      // First create
      const createRes = await fetch('http://localhost:8787/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Retrieve Test',
          language: 'typescript',
          content: 'console.log("test");',
        }),
      });

      const created = await createRes.json();
      const sessionId = created.id;

      // Then retrieve
      const getRes = await fetch(`http://localhost:8787/api/sessions/${sessionId}`);
      expect(getRes.status).toBe(200);
      const retrieved = await getRes.json();
      expect(retrieved.id).toBe(sessionId);
    });
  });

  describe('AI Completions', () => {
    it('should generate code completions', async () => {
      const response = await fetch('http://localhost:8787/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'const arr = [1, 2, 3];',
          language: 'typescript',
          position: { line: 1, column: 20 },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.suggestions).toBeDefined();
      expect(Array.isArray(data.suggestions)).toBe(true);
      expect(data.suggestions.length).toBeGreaterThan(0);
    });

    it('should analyze code', async () => {
      const response = await fetch('http://localhost:8787/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'let x;\nif (x == null) { console.log(x); }',
          language: 'typescript',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.queued).toBe(true);
    });
  });

  describe('Durable Objects', () => {
    it('should manage session state', async () => {
      const sessionId = 'test-session-' + Date.now();

      // Join session
      const joinRes = await fetch(
        `http://localhost:8787/api/collaborate?sessionId=${sessionId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'user-1',
            username: 'Test User',
            color: '#ff0000',
          }),
        }
      );

      expect(joinRes.status).toBe(200);
      const joined = await joinRes.json();
      expect(joined.success).toBe(true);
      expect(joined.collaborators).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid requests', async () => {
      const response = await fetch('http://localhost:8787/api/invalid', {
        method: 'POST',
      });

      expect(response.status).toBe(404);
    });

    it('should validate input', async () => {
      const response = await fetch('http://localhost:8787/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});

describe('Performance Tests', () => {
  it('should handle concurrent requests', async () => {
    const promises = Array(10)
      .fill(null)
      .map(() =>
        fetch('http://localhost:8787/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Concurrent Test',
            language: 'typescript',
            content: '',
          }),
        })
      );

    const results = await Promise.all(promises);
    results.forEach((res) => {
      expect(res.status).toBe(200);
    });
  });

  it('should complete AI analysis within timeout', async () => {
    const start = Date.now();

    const response = await fetch('http://localhost:8787/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'function example() { return 42; }',
        language: 'typescript',
      }),
    });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000); // 5 second timeout
    expect(response.status).toBe(200);
  });
});
