import { create } from 'zustand';
import { 
  NormalizedMarket, 
  GroupedMarket,
  AgentState, 
  LogEntry, 
  DecisionPrompt, 
  AlphaSignal,
  AgentConfig,
  DataSource,
  AgentTag
} from '@/lib/types';

interface AgentStore {
  // Market State
  markets: NormalizedMarket[];
  groupedMarkets: GroupedMarket[];
  activeMarket: NormalizedMarket | null;
  activeGroupedMarket: GroupedMarket | null;
  activeOutcomeId: string | null;
  isSearching: boolean;
  searchQuery: string;
  setMarkets: (markets: NormalizedMarket[]) => void;
  setGroupedMarkets: (markets: GroupedMarket[]) => void;
  setActiveMarket: (market: NormalizedMarket | null) => void;
  setActiveGroupedMarket: (event: GroupedMarket) => void;
  setSearchQuery: (query: string) => void;
  searchMarkets: (query: string) => Promise<void>;
  
  // Agent State
  agentState: AgentState;
  setAgentState: (state: AgentState) => void;
  
  // Logs
  logs: LogEntry[];
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  addLogs: (logs: Omit<LogEntry, 'id' | 'timestamp'>[]) => void;
  clearLogs: () => void;
  
  // Decision Prompts
  decisionPrompt: DecisionPrompt | null;
  setDecisionPrompt: (prompt: DecisionPrompt | null) => void;
  sendDecisionResponse: (promptId: string, action: string, response?: string) => void;
  
  // Alpha Signal
  alphaSignal: AlphaSignal | null;
  setAlphaSignal: (signal: AlphaSignal | null) => void;
  clearAlphaSignal: () => void;
  
  // Configuration
  config: AgentConfig;
  updateConfig: (config: Partial<AgentConfig>) => void;
  
  // Actions
  startAgent: (query?: string) => Promise<void>;
  stopAgent: () => void;
  
  // Abort Controller for cancellation
  abortController: AbortController | null;
  setAbortController: (controller: AbortController | null) => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Initial Market State - empty, will be populated by search
  markets: [],
  groupedMarkets: [],
  activeMarket: null,
  activeGroupedMarket: null,
  activeOutcomeId: null,
  isSearching: false,
  searchQuery: '',
  
  setMarkets: (markets) => set({ markets }),
  setGroupedMarkets: (groupedMarkets) => set({ groupedMarkets }),
  setActiveMarket: (market) => set({ activeMarket: market }),
  setActiveGroupedMarket: (event: GroupedMarket) => {
    // Set the grouped market as active - used for multi-outcome chart view
    set({ 
      activeGroupedMarket: event,
      activeOutcomeId: null,
      // Also set activeMarket for backward compatibility (use event info)
      activeMarket: {
        id: event.eventId,
        title: event.eventTitle,
        slug: event.slug,
        description: event.description,
        normalizedOdds: {
          polymarket: event.outcomes[0]?.odds || 0.5,
        },
        volume24h: event.totalVolume24h,
        liquidity: event.totalLiquidity,
        endDate: event.endDate,
        category: event.category,
        hasArbitrage: event.hasArbitrage,
        eventId: event.eventId,
        eventTitle: event.eventTitle,
      }
    });
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  // Search markets from Polymarket API
  searchMarkets: async (query: string) => {
    set({ isSearching: true, searchQuery: query });
    
    try {
      const url = query 
        ? `/api/markets/search?q=${encodeURIComponent(query)}&limit=20`
        : `/api/markets?limit=20`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      set({ 
        markets: data.markets || [], 
        groupedMarkets: data.groupedMarkets || [],
        isSearching: false 
      });
    } catch (error) {
      console.error('Market search error:', error);
      set({ markets: [], groupedMarkets: [], isSearching: false });
    }
  },
  
  // Initial Agent State
  agentState: 'idle',
  setAgentState: (agentState) => set({ agentState }),
  
  // Logs
  logs: [],
  addLog: (log) => set((state) => ({
    logs: [...state.logs, {
      ...log,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }]
  })),
  addLogs: (newLogs) => set((state) => ({
    logs: [...state.logs, ...newLogs.map(log => ({
      ...log,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }))]
  })),
  clearLogs: () => set({ logs: [] }),
  
  // Decision Prompts
  decisionPrompt: null,
  setDecisionPrompt: (prompt) => set({ decisionPrompt: prompt }),
  sendDecisionResponse: (promptId, action, response) => {
    // For now, just clear the prompt - can be extended for real interaction
    set({ decisionPrompt: null });
  },
  
  // Alpha Signal
  alphaSignal: null,
  setAlphaSignal: (signal) => set({ alphaSignal: signal }),
  clearAlphaSignal: () => set({ alphaSignal: null, agentState: 'idle' }),
  
  // Configuration
  config: {
    risk: 'standard',
    logic: 'balanced',
    sources: ['perplexity', 'news'] as DataSource[],
    directives: '',
  },
  updateConfig: (config) => set((state) => ({
    config: { ...state.config, ...config }
  })),
  
  // Abort Controller
  abortController: null,
  setAbortController: (controller) => set({ abortController: controller }),
  
  // Start Agent - calls real LangFlow API
  startAgent: async (customQuery?: string) => {
    const { activeMarket, config, addLog, setAgentState, setAlphaSignal, setAbortController } = get();
    
    // Determine query - either custom query or market title
    const query = customQuery || (activeMarket ? activeMarket.title : null);
    if (!query) {
      addLog({ tag: 'SYSTEM', message: 'Error: No query provided' });
      return;
    }
    
    // Clear previous state
    set({ logs: [], alphaSignal: null, decisionPrompt: null });
    setAgentState('running');
    
    // Create abort controller for cancellation
    const abortController = new AbortController();
    setAbortController(abortController);
    
    addLog({ tag: 'SYSTEM', message: `Starting analysis for: "${query}"` });
    addLog({ tag: 'SYSTEM', message: `Config: ${config.logic} logic, ${config.risk} risk` });
    
    try {
      // Call LangFlow API via our proxy
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          config,
          marketContext: activeMarket ? {
            title: activeMarket.title,
            slug: activeMarket.slug,
            odds: activeMarket.normalizedOdds.polymarket,
            volume: activeMarket.volume24h,
          } : null,
        }),
        signal: abortController.signal,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LangFlow API error: ${response.status} - ${error}`);
      }
      
      const result = await response.json();
      
      // Parse logs from LangFlow response
      if (result.logs && Array.isArray(result.logs)) {
        const parsedLogs = parseLangFlowLogs(result.logs);
        parsedLogs.forEach(log => addLog(log));
      }
      
      // Parse alpha signal from response
      if (result.signal) {
        setAlphaSignal(result.signal);
      }
      
      addLog({ tag: 'SYSTEM', message: 'Analysis complete.' });
      setAgentState('completed');
      
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        addLog({ tag: 'SYSTEM', message: 'Analysis aborted by user' });
      } else {
        addLog({ tag: 'SYSTEM', message: `Error: ${(error as Error).message}` });
      }
      setAgentState('error');
    } finally {
      setAbortController(null);
    }
  },
  
  // Stop Agent
  stopAgent: () => {
    const { abortController, addLog, setAbortController } = get();
    
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    
    addLog({ tag: 'SYSTEM', message: 'Analysis aborted by user' });
    set({ agentState: 'idle', decisionPrompt: null });
  },
}));

// Helper function to parse LangFlow logs into our format
function parseLangFlowLogs(rawLogs: string[]): Omit<LogEntry, 'id' | 'timestamp'>[] {
  const parsed: Omit<LogEntry, 'id' | 'timestamp'>[] = [];
  
  for (const log of rawLogs) {
    // Try to extract tag from log message
    // LangFlow logs format: "🕒 **HH:MM:SS** - Component: Message" or emoji prefix
    let tag: AgentTag = 'SYSTEM';
    let message = log;
    let depth: number | undefined;
    
    // Detect component from log content
    if (log.includes('**Resolver') || log.includes('Resolver:')) {
      tag = 'PLANNER';
    } else if (log.includes('**Scout') || log.includes('Scout:') || log.includes('🔍') || log.includes('📊')) {
      tag = 'SCOUT';
    } else if (log.includes('**Planner') || log.includes('Planner:') || log.includes('Strategy')) {
      tag = 'PLANNER';
    } else if (log.includes('**Researcher') || log.includes('Researcher:') || log.includes('Perplexity') || log.includes('Factor')) {
      tag = 'RESEARCHER';
      // Check for depth indicators
      if (log.includes('depth:') || log.includes('(depth')) {
        depth = 1;
      }
    } else if (log.includes('**Detector') || log.includes('Alpha') || log.includes('Edge') || log.includes('Signal')) {
      tag = 'DETECTOR';
    } else if (log.includes('**Matcher') || log.includes('Qwen')) {
      tag = 'SCOUT';
    }
    
    // Clean up the message - remove markdown formatting
    message = log
      .replace(/\*\*/g, '')
      .replace(/🕒\s*\d{2}:\d{2}:\d{2}\s*-\s*/, '')
      .replace(/[🔍📊✅❌⚠️🔄🎯💡]/g, '')
      .trim();
    
    if (message) {
      parsed.push({ tag, message, depth });
    }
  }
  
  return parsed;
}
