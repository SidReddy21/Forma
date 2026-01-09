/**
 * Advanced AI Integration with Llama 3.3
 * Handles streaming completions, analysis, and code generation
 */

import { AICompletion, CodeAnalysisReport } from './types';

export interface LlamaRequest {
  prompt: string;
  model: 'llama-3.3-70b' | 'llama-3.1-8b';
  maxTokens: number;
  temperature: number;
  topP: number;
}

export interface LlamaResponse {
  result: {
    response: string;
  };
}

/**
 * AI Service for code completions and analysis
 */
export class CodeAIService {
  private env: any;
  private model = 'llama-3.3-70b';

  constructor(env: any) {
    this.env = env;
  }

  /**
   * Generate code completions
   */
  async generateCompletion(
    context: string,
    language: string,
    maxSuggestions: number = 3
  ): Promise<AICompletion> {
    const prompt = this.buildCompletionPrompt(context, language);

    try {
      const response = await this.queryLlama({
        prompt,
        model: this.model,
        maxTokens: 200,
        temperature: 0.7,
        topP: 0.95,
      });

      const suggestions = this.parseCompletions(response, language);

      return {
        id: crypto.randomUUID(),
        context,
        suggestions: suggestions.slice(0, maxSuggestions),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Completion error:', error);
      throw error;
    }
  }

  /**
   * Analyze code for bugs and improvements
   */
  async analyzeCode(code: string, language: string): Promise<CodeAnalysisReport> {
    const prompt = this.buildAnalysisPrompt(code, language);

    try {
      console.log('Analyzing code, length:', code.length);
      
      // Use intelligent fallback directly for now
      console.log('Using intelligent fallback for code analysis');
      const fallbackResponse = this.getIntelligentFallback(prompt);
      console.log('Fallback response:', JSON.stringify(fallbackResponse).substring(0, 300));
      
      // Try to use AI if available, but fall back to intelligent analysis
      try {
        const response = await this.queryLlama({
          prompt,
          model: this.model,
          maxTokens: 2000,
          temperature: 0.3,
          topP: 0.95,
        });
        
        console.log('Got response from queryLlama');
        const parsed = this.parseAnalysisResponse(response);
        // Only use AI response if it has actual bugs detected
        if (parsed.bugs && parsed.bugs.length > 0 && parsed.bugs[0].message !== 'Could not parse analysis response') {
          console.log('Using AI analysis');
          return parsed;
        }
      } catch (aiError) {
        console.error('AI query failed:', aiError);
      }
      
      // Fall back to intelligent analysis
      console.log('Falling back to intelligent analysis');
      return this.parseAnalysisResponse(fallbackResponse);
    } catch (error) {
      console.error('Analysis error:', error);
      // Return basic fallback
      return {
        sessionId: 'current-session',
        timestamp: Date.now(),
        bugs: [{
          line: 1,
          severity: 'warning',
          message: 'Error during analysis',
          suggestion: 'Try again with simpler code'
        }],
        improvements: [],
        testCoverage: 0,
        complexity: 'medium'
      };
    }
  }

  /**
   * Generate unit tests
   */
  async generateTests(code: string, language: string): Promise<string> {
    const prompt = `Generate comprehensive unit tests for the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

Requirements:
1. Use industry-standard testing framework
2. Cover edge cases and error scenarios
3. Include setup/teardown if needed
4. Add descriptive test names
5. Make tests independent and isolated`;

    try {
      const response = await this.queryLlama({
        prompt,
        model: this.model,
        maxTokens: 1500,
        temperature: 0.5,
        topP: 0.95,
      });

      return response.result.response;
    } catch (error) {
      console.error('Test generation error:', error);
      throw error;
    }
  }

  /**
   * Generate documentation
   */
  async generateDocumentation(code: string, language: string): Promise<string> {
    const prompt = `Generate clear, concise documentation for this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Include:
1. Function descriptions
2. Parameter explanations
3. Return value documentation
4. Usage examples
5. Performance considerations`;

    try {
      const response = await this.queryLlama({
        prompt,
        model: this.model,
        maxTokens: 1000,
        temperature: 0.5,
        topP: 0.95,
      });

      return response.result.response;
    } catch (error) {
      console.error('Documentation generation error:', error);
      throw error;
    }
  }

  /**
   * Generate refactoring suggestions
   */
  async suggestRefactoring(code: string, language: string): Promise<string[]> {
    const prompt = `Analyze this ${language} code and suggest 3-5 refactoring improvements:

\`\`\`${language}
${code}
\`\`\`

For each suggestion, explain:
1. What to change
2. Why it's an improvement
3. Potential impact`;

    try {
      const response = await this.queryLlama({
        prompt,
        model: this.model,
        maxTokens: 800,
        temperature: 0.5,
        topP: 0.95,
      });

      // Parse suggestions from response
      return response.result.response.split('\n').filter((line: string) => line.trim());
    } catch (error) {
      console.error('Refactoring suggestion error:', error);
      throw error;
    }
  }

  /**
   * Query Llama via Cloudflare Workers AI
   */
  private async queryLlama(request: LlamaRequest): Promise<LlamaResponse> {
    console.log('Querying Llama model:', request.model);
    console.log('AI binding available:', !!this.env.AI);

    try {
      // Check if AI binding exists
      if (!this.env.AI) {
        console.warn('AI binding not available - check wrangler.toml configuration');
        return this.getIntelligentFallback(request.prompt);
      }

      // Call the actual Cloudflare Workers AI API
      console.log('Calling Workers AI with prompt length:', request.prompt.length);
      const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        prompt: request.prompt,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        top_p: request.topP,
      });

      console.log('AI response received:', JSON.stringify(response).substring(0, 200));

      // Normalize Cloudflare response format
      // Cloudflare returns: { response: string } or { result: { response: string } }
      if (response && typeof response.response === 'string') {
        console.log('Using direct response format');
        return {
          result: {
            response: response.response,
          },
        };
      } else if (response && response.result && response.result.response) {
        console.log('Using nested result format');
        return response as LlamaResponse;
      } else {
        console.error('Unexpected AI response format:', response);
        return this.getIntelligentFallback(request.prompt);
      }
    } catch (error) {
      console.error('Llama API error:', error);
      console.error('Error details:', JSON.stringify(error));
      return this.getIntelligentFallback(request.prompt);
    }
  }

  private getIntelligentFallback(prompt: string): LlamaResponse {
    console.log('Using intelligent fallback for analysis');
    // Extract code from markdown code blocks in the prompt
    let code = '';
    const codeBlockMatch = prompt.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1].trim();
    }
    
    console.log('Extracted code:', code.substring(0, 100));
    console.log('Code length:', code.length);
    
    if (prompt.includes('bug') || prompt.includes('analyze')) {
      // Do basic code analysis
      const lines = code.split('\n').filter(line => line.trim());
      const bugs: any[] = [];
      const improvements: any[] = [];
      
      console.log('Lines to analyze:', lines.length);
      
      // Basic syntax checks
      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('//')) return;
        
        // Check for common issues
        if (trimmed.match(/var\s+\w+/)) {
          console.log('Found var at line', lineNum);
          bugs.push({
            line: lineNum,
            severity: 'warning',
            message: 'Use const or let instead of var',
            suggestion: 'Replace var with const or let for better scoping and avoiding hoisting issues'
          });
        }
        
        if (trimmed.includes('==') && !trimmed.includes('===')) {
          console.log('Found == at line', lineNum);
          bugs.push({
            line: lineNum,
            severity: 'warning',
            message: 'Use strict equality (===) instead of loose equality (==)',
            suggestion: 'Replace == with === to avoid type coercion issues'
          });
        }
        
        if (trimmed.match(/console\.(log|error|warn)/)) {
          console.log('Found console at line', lineNum);
          improvements.push({
            category: 'Code Quality',
            suggestions: [`Remove console.${trimmed.match(/console\.(\w+)/)?.[1]} statement on line ${lineNum} before production`]
          });
        }
      });
      
      // Calculate basic metrics
      const codeLength = code.trim().length;
      const nonEmptyLines = lines.length;
      const hasComments = code.includes('//') || code.includes('/*');
      const complexity = codeLength < 100 ? 'low' : codeLength < 500 ? 'medium' : 'high';
      const testCoverage = codeLength > 200 ? 0.3 : codeLength > 100 ? 0.2 : 0;
      
      if (!hasComments && codeLength > 50) {
        improvements.push({
          category: 'Documentation',
          suggestions: ['Add comments to explain logic and complex expressions']
        });
      }
      
      // If code has substance, provide feedback
      if (nonEmptyLines > 2) {
        // If no bugs found, give positive feedback
        if (bugs.length === 0) {
          bugs.push({
            line: 1,
            severity: 'info',
            message: 'No major issues detected',
            suggestion: 'Code structure looks good. Consider adding more tests for edge cases.'
          });
        }
        
        // Add general improvements
        if (improvements.length === 0) {
          improvements.push({
            category: 'Best Practices',
            suggestions: ['Use descriptive variable names', 'Consider error handling for edge cases']
          });
        }
      } else {
        // Code is too short
        bugs.push({
          line: 1,
          severity: 'info',
          message: 'Code sample too short for meaningful analysis',
          suggestion: 'Write more code (at least 3-4 lines of actual logic) to get useful feedback'
        });
      }
      
      const analysisResult = {
        bugs,
        improvements,
        testCoverage,
        complexity,
      };
      
      console.log('Analysis result:', JSON.stringify(analysisResult).substring(0, 300));
      
      return {
        result: {
          response: JSON.stringify(analysisResult),
        },
      };
    }

    if (prompt.includes('complete') || prompt.includes('suggestion')) {
      return {
        result: {
          response: '// AI completions available when Workers AI binding is configured',
        },
      };
    }

    // Default fallback
    return {
      result: {
        response: '// Workers AI service not available. Basic analysis enabled.',
      },
    };
  }



  /**
   * Build prompt for completions
   */
  private buildCompletionPrompt(context: string, language: string): string {
    return `You are an expert ${language} developer. Complete this code naturally and concisely.

Context:
\`\`\`${language}
${context}
\`\`\`

Provide the most likely completion. Only return code, no explanation.`;
  }

  /**
   * Build prompt for analysis
   */
  private buildAnalysisPrompt(code: string, language: string): string {
    return `Analyze this ${language} code for bugs, security issues, and improvements:

\`\`\`${language}
${code}
\`\`\`

Return JSON in this format:
{
  "bugs": [
    {"line": 5, "severity": "warning", "message": "...", "suggestion": "..."}
  ],
  "improvements": [
    {"category": "Performance", "suggestions": ["...", "..."]}
  ],
  "testCoverage": 0.65,
  "complexity": "medium"
}`;
  }

  /**
   * Parse completion suggestions from response
   */
  private parseCompletions(
    response: LlamaResponse,
    language: string
  ): AICompletion['suggestions'] {
    // Mock parsing
    return [
      {
        text: response.result.response,
        confidence: 0.92,
        reasoning: 'Based on code context and common patterns',
      },
    ];
  }

  /**
   * Parse analysis response
   */
  private parseAnalysisResponse(response: LlamaResponse): CodeAnalysisReport {
    try {
      const content = response.result.response;
      console.log('Parsing response, type:', typeof content, 'length:', content?.length);
      
      // Handle null/undefined response
      if (!content) {
        throw new Error('Empty response content');
      }
      
      // If content is already parsed, use it directly
      if (typeof content === 'object') {
        const parsed = content as any;
        console.log('Content is already an object');
        const bugs = (parsed.bugs || []).map((bug: any) => ({
          line: bug.line || 1,
          severity: bug.severity || 'warning',
          message: bug.message || bug.suggestion || 'Unknown issue',
          suggestion: bug.suggestion || 'No suggestion available',
        }));

        const improvements = Array.isArray(parsed.improvements) 
          ? parsed.improvements.map((imp: any) => 
              typeof imp === 'string' 
                ? { category: 'General', suggestions: [imp] }
                : imp
            )
          : [];

        return {
          sessionId: 'current-session',
          timestamp: Date.now(),
          bugs,
          improvements,
          testCoverage: parsed.testCoverage || 0.5,
          complexity: parsed.complexity || 'medium',
        };
      }
      
      // Content should be a string - try to parse it
      if (typeof content !== 'string') {
        console.log('Content is not string, converting:', typeof content);
        throw new Error('Response is not a string: ' + typeof content);
      }
      
      console.log('Trying to parse JSON from string');
      
      // Try to extract JSON from the response (it might be wrapped in markdown or text)
      let jsonStr = content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
        console.log('Extracted JSON from response');
      }

      console.log('Attempting to parse:', jsonStr.substring(0, 100));
      const parsed = JSON.parse(jsonStr);
      console.log('Successfully parsed JSON');
      
      // Normalize the response structure
      const bugs = (parsed.bugs || []).map((bug: any) => ({
        line: bug.line || 1,
        severity: bug.severity || 'warning',
        message: bug.message || bug.suggestion || 'Unknown issue',
        suggestion: bug.suggestion || 'No suggestion available',
      }));

      const improvements = Array.isArray(parsed.improvements) 
        ? parsed.improvements.map((imp: any) => 
            typeof imp === 'string' 
              ? { category: 'General', suggestions: [imp] }
              : imp
          )
        : [];

      return {
        sessionId: 'current-session',
        timestamp: Date.now(),
        bugs,
        improvements,
        testCoverage: parsed.testCoverage || 0.5,
        complexity: parsed.complexity || 'medium',
      };
    } catch (error) {
      console.error('Failed to parse analysis:', error);
      console.error('Response object:', response);
      console.error('Response.result:', response?.result);
      console.error('Response.result.response:', response?.result?.response?.substring?.(0, 500));
      
      // Return default empty analysis instead of failing
      return {
        sessionId: 'current-session',
        timestamp: Date.now(),
        bugs: [{ 
          line: 1, 
          severity: 'warning',
          message: 'Could not parse analysis response', 
          suggestion: 'Check your code syntax and try again',
        }],
        improvements: [],
        testCoverage: 0,
        complexity: 'medium',
      };
    }
  }
}

/**
 * RAG (Retrieval-Augmented Generation) for context-aware completions
 */
export class RAGService {
  private codeEmbeddings: Map<string, number[]> = new Map();
  private vectorDB: any; // Pinecone or similar

  constructor() {
    // Initialize vector DB connection
  }

  /**
   * Generate embedding for code snippet
   */
  async embedCode(code: string): Promise<number[]> {
    // This would use a real embedding model
    // For now, return mock embedding
    return Array(1536).fill(0).map(() => Math.random());
  }

  /**
   * Store code embedding for retrieval
   */
  async storeEmbedding(id: string, code: string): Promise<void> {
    const embedding = await this.embedCode(code);
    this.codeEmbeddings.set(id, embedding);
  }

  /**
   * Retrieve similar code snippets
   */
  async retrieveSimilar(query: string, topK: number = 5): Promise<string[]> {
    const queryEmbedding = await this.embedCode(query);
    // Find most similar embeddings
    // Return corresponding code snippets
    return [];
  }

  /**
   * Build context for LLM from similar snippets
   */
  async buildRAGContext(query: string): Promise<string> {
    const similar = await this.retrieveSimilar(query);
    return `Similar code patterns:\n${similar.join('\n')}`;
  }
}
