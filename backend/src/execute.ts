// Shared execution helpers using Piston API

export interface ExecutionMeta {
  language: string;
  resolvedLanguage: string;
  version: string;
  exitCode: number | null;
  signal: string | null;
  timestamp: number;
  sessionId: string | null;
}

export interface ExecutionResult {
  output: string | null;
  error: string | null;
  meta: ExecutionMeta;
}

// Cache Piston language versions across requests in the same isolate
const PISTON_VERSION_CACHE: Record<string, string> = {};

export async function resolvePistonVersion(lang: string): Promise<string> {
  if (PISTON_VERSION_CACHE[lang]) return PISTON_VERSION_CACHE[lang];

  const runtimesRes = await fetch('https://emkc.org/api/v2/piston/runtimes', { method: 'GET' });
  if (!runtimesRes.ok) throw new Error('Failed to query runtime versions');
  const runtimes: Array<{ language: string; version: string }> = await runtimesRes.json();

  const runtime = runtimes.find((r) => r.language.toLowerCase() === lang.toLowerCase());
  if (!runtime) {
    const aliases: Record<string, string[]> = {
      cpp: ['c++', 'gcc', 'g++', 'cc', 'clang++', 'clang'],
      python: ['py', 'python3'],
      java: [],
    };
    const alt = aliases[lang as keyof typeof aliases] || [];
    const altRuntime = runtimes.find((r) => alt.includes(r.language.toLowerCase()));
    if (!altRuntime) throw new Error(`No runtime found for language: ${lang}`);
    PISTON_VERSION_CACHE[lang] = altRuntime.version;
    return altRuntime.version;
  }
  PISTON_VERSION_CACHE[lang] = runtime.version;
  return runtime.version;
}

export function mapLanguageForPiston(language: string): { pistonLang: string; filename: string } {
  switch (language) {
    case 'cpp':
      return { pistonLang: 'cpp', filename: 'main.cpp' };
    case 'python':
      return { pistonLang: 'python', filename: 'main.py' };
    case 'java':
      return { pistonLang: 'java', filename: 'Main.java' };
    default:
      return { pistonLang: language, filename: 'main.txt' };
  }
}

export async function executeWithPiston(
  code: string,
  language: string,
  sessionId?: string,
  stdin?: string
): Promise<ExecutionResult> {
  const { pistonLang, filename } = mapLanguageForPiston(language);
  const version = await resolvePistonVersion(pistonLang);

  const payload = {
    language: pistonLang,
    version,
    files: [
      {
        name: filename,
        content: code,
      },
    ],
    stdin: typeof stdin === 'string' ? stdin : undefined,
    args: [],
    compile_timeout: 10000,
    run_timeout: 10000,
    compile_memory_limit: -1,
    run_memory_limit: -1,
  };

  const execRes = await fetch('https://emkc.org/api/v2/piston/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!execRes.ok) {
    const text = await execRes.text();
    throw new Error(`Execution API error (${execRes.status}): ${text}`);
  }

  const execJson: any = await execRes.json();
  const compile = execJson.compile || {};
  const run = execJson.run || {};

  const compileStdout = compile.stdout || '';
  const compileStderr = compile.stderr || '';
  const runStdout = run.stdout || '';
  const runStderr = run.stderr || '';

  const output = [compileStdout, runStdout].filter(Boolean).join('');
  const error = [compileStderr, runStderr].filter(Boolean).join('');

  const meta: ExecutionMeta = {
    language,
    resolvedLanguage: pistonLang,
    version,
    exitCode: typeof run.code === 'number' ? run.code : typeof compile.code === 'number' ? compile.code : null,
    signal: run.signal || null,
    timestamp: Date.now(),
    sessionId: sessionId || null,
  };

  return { output: output || null, error: error || null, meta };
}
