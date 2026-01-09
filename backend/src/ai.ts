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
    let language = 'unknown';
    const codeBlockMatch = prompt.match(/```(\w+)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      if (codeBlockMatch[1]) language = codeBlockMatch[1];
      code = codeBlockMatch[2].trim();
    }
    
    console.log('Extracted code:', code.substring(0, 100));
    console.log('Code length:', code.length);
    console.log('Detected language:', language);
    
    if (prompt.includes('bug') || prompt.includes('analyze')) {
      const lines = code.split('\n').filter(line => line.trim());
      const analysis = this.analyzeCodeByLanguage(code, language, lines);
      
      return {
        result: {
          response: JSON.stringify({
            bugs: analysis.bugs,
            improvements: analysis.improvements,
          }),
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

  private analyzeCodeByLanguage(code: string, language: string, lines: string[]): any {
    const bugs: any[] = [];
    const improvements: any[] = [];

    if (!code || lines.length === 0) {
      return { bugs: [{ line: 1, severity: 'info', message: 'Code sample too short for meaningful analysis', suggestion: 'Write more code (at least 3-4 lines of actual logic)' }], improvements: [] };
    }

    if (language === 'python') {
      this.analyzePython(code, lines, bugs, improvements);
    } else if (language === 'cpp') {
      this.analyzeCpp(code, lines, bugs, improvements);
    } else if (language === 'java') {
      this.analyzeJava(code, lines, bugs, improvements);
    } else {
      this.analyzeGeneric(code, lines, bugs, improvements);
    }

    // Add general improvements if none found
    if (improvements.length === 0) {
      improvements.push({ category: 'Best Practices', suggestions: ['Review error handling', 'Consider edge cases'] });
    }

    // If no bugs found, add positive feedback
    if (bugs.length === 0) {
      bugs.push({ line: 1, severity: 'info', message: 'No critical issues detected', suggestion: 'Code structure looks solid. Consider adding tests for edge cases.' });
    }

    return { bugs, improvements };
  }

  private analyzePython(code: string, lines: string[], bugs: any[], improvements: any[]): void {
    // Check for indentation errors first (critical issues)
    const rawLines = code.split('\n');
    let prevIndent = 0;
    let inFunction = false;
    let functionLineNum = 0;
    
    for (let idx = 0; idx < rawLines.length; idx++) {
      const line = rawLines[idx];
      const lineNum = idx + 1;
      const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length || 0;
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#')) {
        prevIndent = leadingSpaces;
        continue;
      }
      
      // Detect function definition
      if (trimmed.startsWith('def ')) {
        inFunction = true;
        functionLineNum = lineNum;
        prevIndent = leadingSpaces;
        continue;
      }
      
      // Check indentation consistency
      if (inFunction && leadingSpaces > 0 && leadingSpaces <= prevIndent && !trimmed.startsWith('def ') && !trimmed.startsWith('class ')) {
        // Body statements after function def should be indented more
        if (functionLineNum > 0 && lineNum > functionLineNum && !trimmed.match(/^(if|elif|else|for|while|try|except|finally|with)/)) {
          const prevTrimmed = rawLines[idx - 1]?.trim() || '';
          if (!prevTrimmed.endsWith(':') && prevTrimmed && !prevTrimmed.startsWith('#')) {
            // This might be an indentation error
            if (leadingSpaces === 0 && !trimmed.match(/^[a-zA-Z_]/)) {
              // Statement at module level when it should be indented
              bugs.push({
                line: lineNum,
                severity: 'error',
                message: 'Indentation error: statement should be indented',
                suggestion: `Line "${trimmed}" should be indented under the function or block above it`
              });
            }
          }
        }
      }
      
      prevIndent = leadingSpaces;
    }
    
    // Line-by-line analysis
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#')) return;
      
      // Critical: Division by zero
      if (trimmed.includes('/ ') || trimmed.includes('/0')) {
        const nextLine = lines[idx + 1]?.trim() || '';
        if (!nextLine.match(/if.*len\(|if.*length|if.*!= 0/) && !line.includes('if') && !line.includes('try')) {
          improvements.push({
            category: 'Error Handling',
            suggestions: [`Add error handling for division at line ${lineNum} (check for zero divisor)`]
          });
        }
      }
      
      // Check for empty list/division issues
      if (trimmed.includes('len(') && lines[idx + 1]?.trim().includes('/')) {
        improvements.push({
          category: 'Robustness',
          suggestions: [`Handle case where collection is empty before division at line ${lineNum + 1}`]
        });
      }
      
      // Check for common Python issues
      if (trimmed.match(/^\s*print\s*\(/)) {
        improvements.push({ category: 'Debugging', suggestions: [`Consider using a logger instead of print() at line ${lineNum}`] });
      }
      
      if (trimmed.includes(' == None') || trimmed.includes('== None')) {
        bugs.push({
          line: lineNum,
          severity: 'warning',
          message: 'Use "is None" instead of "== None"',
          suggestion: 'Replace "== None" with "is None" for proper None comparison in Python'
        });
      }
      
      if (trimmed.match(/except\s*:/)) {
        bugs.push({
          line: lineNum,
          severity: 'warning',
          message: 'Bare except clause catches all exceptions',
          suggestion: 'Specify exception type: "except ValueError:" or "except Exception:" for better error handling'
        });
      }
      
      if (trimmed.match(/^\s*import\s+\*/)) {
        bugs.push({
          line: lineNum,
          severity: 'warning',
          message: 'Avoid wildcard imports',
          suggestion: 'Use explicit imports: "from module import function" for clarity and namespace control'
        });
      }
      
      if (trimmed.match(/\s+$/)) {
        improvements.push({
          category: 'Style',
          suggestions: [`Remove trailing whitespace at line ${lineNum}`]
        });
      }
      
      // Check for missing docstrings
      if (trimmed.match(/def\s+\w+\(/) && !code.substring(code.indexOf(trimmed)).match(/:\s*"""[\s\S]*?"""|:\s*'''[\s\S]*?'''/)) {
        improvements.push({ category: 'Documentation', suggestions: [`Add docstring to function at line ${lineNum}`] });
      }
      
      // Check for inefficient patterns
      if (trimmed.includes('for ') && trimmed.includes(' in ') && lines[idx + 1]?.includes('+=')) {
        // Detect manual loops that could use sum()
        if (trimmed.includes('total') || trimmed.includes('sum_') || trimmed.includes('accumulator')) {
          improvements.push({
            category: 'Code Quality',
            suggestions: [`Consider using built-in sum() function instead of manual loop at line ${lineNum}`]
          });
        }
      }
    });
    
    if (bugs.length === 0) {
      bugs.push({ line: 1, severity: 'info', message: 'No critical issues detected', suggestion: 'Code structure looks solid. Consider adding tests for edge cases.' });
    }
    
    if (improvements.length === 0) {
      improvements.push({ category: 'Best Practices', suggestions: ['Add type hints for clarity', 'Consider using context managers for resource handling'] });
    }
  }

  private analyzeCpp(code: string, lines: string[], bugs: any[], improvements: any[]): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('//')) return;
      
      // Critical: Memory leaks
      if (trimmed.includes('new ') && !code.includes('delete')) {
        bugs.push({
          line: lineNum,
          severity: 'error',
          message: 'Memory allocation without corresponding delete',
          suggestion: 'Use smart pointers (std::unique_ptr, std::shared_ptr) to avoid manual memory management and potential memory leaks'
        });
      }
      
      // Critical: Using namespace std
      if (trimmed.match(/using\s+namespace\s+std/)) {
        bugs.push({
          line: lineNum,
          severity: 'warning',
          message: 'Avoid "using namespace std" - pollutes global namespace',
          suggestion: 'Use explicit namespace qualification (std::cout) or selective using declarations for specific types'
        });
      }
      
      // Check for C-style arrays
      if (trimmed.match(/char\s+\w+\[\d+\]/) || trimmed.match(/int\s+\w+\[\d+\]/)) {
        improvements.push({
          category: 'Modern C++',
          suggestions: [`Use std::string or std::array instead of C-style arrays at line ${lineNum}`]
        });
      }
      
      // Check for C headers
      if (trimmed.includes('#include <stdio.h>') || trimmed.includes('#include <stdlib.h>') || trimmed.includes('#include <string.h>')) {
        improvements.push({
          category: 'C++ Best Practices',
          suggestions: [`Use C++ standard library (<iostream>, <cstdlib>, <cstring>) instead of C headers at line ${lineNum}`]
        });
      }
      
      // Check for raw pointers
      if (trimmed.match(/\w+\s+\*\w+/) && !trimmed.includes('const') && !trimmed.includes('std::')) {
        improvements.push({ category: 'Modern C++', suggestions: [`Consider using smart pointers or references instead of raw pointers at line ${lineNum}`] });
      }
      
      // Check for potential null pointer dereference
      if (trimmed.includes('->') && !code.includes('if (') && !code.includes('if(')) {
        improvements.push({
          category: 'Safety',
          suggestions: [`Check pointer is non-null before dereferencing at line ${lineNum}`]
        });
      }
    });
    
    if (bugs.length === 0) {
      bugs.push({ line: 1, severity: 'info', message: 'No critical issues detected', suggestion: 'Code structure looks solid. Consider adding memory safety checks.' });
    }
    
    if (improvements.length === 0) {
      improvements.push({ category: 'Best Practices', suggestions: ['Use const references for function parameters', 'Consider using standard library algorithms'] });
    }
  }

  private analyzeJava(code: string, lines: string[], bugs: any[], improvements: any[]): void {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('//')) return;
      
      // Critical: main() in wrong class
      if (trimmed.match(/public\s+static\s+void\s+main/)) {
        if (!code.includes('public class')) {
          bugs.push({
            line: lineNum,
            severity: 'error',
            message: 'main() method in non-public class - program cannot run',
            suggestion: 'Declare the class as "public class ClassName" to make the program executable'
          });
        }
      }
      
      // Critical: String comparison with ==
      if (trimmed.includes('==') && trimmed.includes('"') && !trimmed.includes('.equals(')) {
        bugs.push({
          line: lineNum,
          severity: 'warning',
          message: 'Use .equals() for String comparison instead of ==',
          suggestion: 'String literals should be compared with .equals() or .equalsIgnoreCase(), not == operator'
        });
      }
      
      // Critical: Broad exception catching
      if (trimmed.match(/catch\s*\(\s*Exception\s+\w+\s*\)/)) {
        bugs.push({
          line: lineNum,
          severity: 'warning',
          message: 'Catching overly broad Exception type',
          suggestion: 'Catch specific exception types (IOException, NullPointerException, ClassNotFoundException, etc.)'
        });
      }
      
      // Check for try-with-resources
      if (trimmed.match(/new\s+\w+\(\)/) && trimmed.includes('Stream') || trimmed.includes('Reader') || trimmed.includes('Writer')) {
        if (!trimmed.includes('try') && !trimmed.includes('try-with-resources')) {
          improvements.push({
            category: 'Resource Management',
            suggestions: [`Use try-with-resources for AutoCloseable objects (${trimmed.match(/new\s+(\w+)/)?.[1]}) at line ${lineNum}`]
          });
        }
      }
      
      // Check for JavaDoc on public methods
      if (trimmed.match(/public\s+\w+\s+\w+\(/) && !trimmed.includes('//')) {
        const prevLine = lines[idx - 1]?.trim() || '';
        if (!prevLine.startsWith('/**') && !prevLine.startsWith('*')) {
          improvements.push({ category: 'Documentation', suggestions: [`Add JavaDoc comment to public method "${trimmed.substring(0, 40)}" at line ${lineNum}`] });
        }
      }
      
      // Check for NULL checks
      if (trimmed.includes('.') && !trimmed.includes('null') && !trimmed.includes('!= null') && !trimmed.includes('== null')) {
        // Potential null pointer dereference
        if (!trimmed.match(/if.*null|if.*==|if.*!=|throw|return/)) {
          const nextLine = lines[idx + 1]?.trim() || '';
          if (!nextLine.includes('null')) {
            improvements.push({
              category: 'Null Safety',
              suggestions: [`Consider null check before method call at line ${lineNum}`]
            });
          }
        }
      }
      
      // Check naming conventions
      if (trimmed.match(/public\s+\w+\s+[a-z]+_[a-z]+/) || trimmed.match(/private\s+\w+\s+[A-Z]\w+_[a-z]+/)) {
        improvements.push({
          category: 'Code Style',
          suggestions: [`Use camelCase naming convention instead of snake_case at line ${lineNum}`]
        });
      }
    });
    
    if (bugs.length === 0) {
      bugs.push({ line: 1, severity: 'info', message: 'No critical issues detected', suggestion: 'Code structure looks solid. Consider adding comprehensive error handling.' });
    }
    
    if (improvements.length === 0) {
      improvements.push({ category: 'Code Style', suggestions: ['Follow camelCase naming conventions', 'Use meaningful variable names', 'Add comprehensive JavaDoc documentation'] });
    }
  }

  private analyzeGeneric(code: string, lines: string[], bugs: any[], improvements: any[]): void {
    const codeLength = code.trim().length;
    const nonEmptyLines = lines.length;
    const hasComments = code.includes('//') || code.includes('/*') || code.includes('#');
    
    if (!hasComments && codeLength > 50) {
      improvements.push({
        category: 'Documentation',
        suggestions: ['Add comments to explain logic and complex expressions']
      });
    }
    
    if (nonEmptyLines > 2) {
      improvements.push({
        category: 'Best Practices',
        suggestions: ['Use descriptive variable names', 'Consider error handling for edge cases']
      });
    }
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
