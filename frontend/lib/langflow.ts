import { 
  AgentConfig, 
  LogEntry, 
  AlphaSignal,
  AgentState,
  AgentTag,
  AgentRunResponse 
} from './types';

// Configuration
const LANGFLOW_URL = process.env.NEXT_PUBLIC_LANGFLOW_URL || 'http://localhost:7860';
// Flow ID for reference - used by the backend API route
// const LANGFLOW_FLOW_ID = '3ef34a81-2302-4b89-80d1-35b6ce0e8ea5';

export interface LangFlowClientConfig {
  onLog?: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  onAlphaSignal?: (signal: AlphaSignal) => void;
  onStateChange?: (state: AgentState) => void;
  onError?: (error: string) => void;
}

export class LangFlowClient {
  private config: LangFlowClientConfig;
  private abortController: AbortController | null = null;

  constructor(config: LangFlowClientConfig = {}) {
    this.config = config;
  }

  async runAgent(
    query: string, 
    agentConfig: AgentConfig,
    marketContext?: {
      title: string;
      slug: string;
      odds: number;
      volume: number;
    } | null
  ): Promise<AgentRunResponse> {
    // Create abort controller for this request
    this.abortController = new AbortController();
    
    this.config.onStateChange?.('running');
    this.config.onLog?.({ tag: 'SYSTEM', message: `Starting analysis for: "${query}"` });
    this.config.onLog?.({ tag: 'SYSTEM', message: `Config: ${agentConfig.logic} logic, ${agentConfig.risk} risk` });
    
    try {
      // Call our API proxy (which calls LangFlow)
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          config: agentConfig,
          marketContext,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }

      const result: AgentRunResponse = await response.json();

      // Emit logs
      if (result.logs) {
        const parsedLogs = this.parseLogs(result.logs);
        for (const log of parsedLogs) {
          this.config.onLog?.(log);
        }
      }

      // Emit signal
      if (result.signal) {
        this.config.onAlphaSignal?.(result.signal);
      }

      this.config.onLog?.({ tag: 'SYSTEM', message: 'Analysis complete.' });
      this.config.onStateChange?.('completed');

      return result;

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.config.onLog?.({ tag: 'SYSTEM', message: 'Analysis aborted by user' });
        this.config.onStateChange?.('idle');
      } else {
        const message = (error as Error).message || 'Unknown error';
        this.config.onLog?.({ tag: 'SYSTEM', message: `Error: ${message}` });
        this.config.onError?.(message);
        this.config.onStateChange?.('error');
      }
      
      return {
        success: false,
        logs: [],
        error: (error as Error).message,
      };
    } finally {
      this.abortController = null;
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private parseLogs(rawLogs: string[]): Omit<LogEntry, 'id' | 'timestamp'>[] {
    const parsed: Omit<LogEntry, 'id' | 'timestamp'>[] = [];
    
    for (const log of rawLogs) {
      let tag: AgentTag = 'SYSTEM';
      let message = log;
      let depth: number | undefined;
      
      // Detect component from log content
      if (log.includes('Resolver') || log.includes('resolver')) {
        tag = 'PLANNER';
      } else if (log.includes('Scout') || log.includes('scout') || log.includes('🔍') || log.includes('📊')) {
        tag = 'SCOUT';
      } else if (log.includes('Planner') || log.includes('planner') || log.includes('Strategy')) {
        tag = 'PLANNER';
      } else if (log.includes('Researcher') || log.includes('researcher') || log.includes('Perplexity') || log.includes('Factor')) {
        tag = 'RESEARCHER';
        if (log.includes('depth:') || log.includes('(depth')) {
          depth = 1;
        }
      } else if (log.includes('Detector') || log.includes('detector') || log.includes('Alpha') || log.includes('Edge') || log.includes('Signal')) {
        tag = 'DETECTOR';
      } else if (log.includes('Matcher') || log.includes('Qwen')) {
        tag = 'SCOUT';
      }
      
      // Clean up the message
      message = log
        .replace(/\*\*/g, '')
        .replace(/🕒\s*\d{2}:\d{2}:\d{2}\s*-\s*/, '')
        .replace(/[🔍📊✅❌⚠️🔄🎯💡🕒]/g, '')
        .trim();
      
      if (message) {
        parsed.push({ tag, message, depth });
      }
    }
    
    return parsed;
  }
}

// Direct API functions for simple use cases
export async function runLangFlowAgent(
  query: string,
  config: AgentConfig,
  marketContext?: { title: string; slug: string; odds: number; volume: number } | null
): Promise<AgentRunResponse> {
  const response = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, config, marketContext }),
  });

  if (!response.ok) {
    throw new Error(`LangFlow API error: ${response.status}`);
  }

  return response.json();
}

// Check if LangFlow is available
export async function checkLangFlowHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${LANGFLOW_URL}/health`, {
      method: 'GET',
      // Short timeout
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
