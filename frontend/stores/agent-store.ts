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

// Filter types
export type CategorySlug = 'all' | 'politics' | 'crypto' | 'sports' | 'ai' | 'business' | 'finance' | 'science' | 'pop-culture' | 'geopolitics';
export type SortOption = 'trending' | 'newest' | 'ending-soon' | 'liquidity' | 'alphabetical';

export interface MarketFilters {
  showResolved: boolean;
  category: CategorySlug;
  sortBy: SortOption;
}

interface AgentStore {
  // Market State
  markets: NormalizedMarket[];
  groupedMarkets: GroupedMarket[];
  allGroupedMarkets: GroupedMarket[]; // Unfiltered list
  activeMarket: NormalizedMarket | null;
  activeGroupedMarket: GroupedMarket | null;
  activeOutcomeId: string | null;
  isSearching: boolean;
  searchQuery: string;
  filters: MarketFilters;
  setMarkets: (markets: NormalizedMarket[]) => void;
  setGroupedMarkets: (markets: GroupedMarket[]) => void;
  setActiveMarket: (market: NormalizedMarket | null) => void;
  setActiveGroupedMarket: (event: GroupedMarket) => void;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: MarketFilters) => void;
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

// Helper function to filter markets by category
function filterByCategory(markets: GroupedMarket[], category: CategorySlug): GroupedMarket[] {
  if (category === 'all') return markets;
  
  return markets.filter(market => {
    // Check if any tag matches the category
    const tags = market.tags || [];
    return tags.some((tag) => {
      const tagSlug = tag?.slug;
      return tagSlug === category || tagSlug?.includes(category);
    });
  });
}

// Helper function to filter resolved markets
function filterResolved(markets: GroupedMarket[], showResolved: boolean): GroupedMarket[] {
  if (showResolved) return markets;
  return markets.filter(market => !market.resolved);
}

// Helper function to sort markets
function sortMarkets(markets: GroupedMarket[], sortBy: SortOption): GroupedMarket[] {
  const sorted = [...markets];
  
  switch (sortBy) {
    case 'trending':
      // Sort by 24h volume (most active first) - this is the default "trending" sort
      return sorted.sort((a, b) => b.totalVolume24h - a.totalVolume24h);
    
    case 'newest':
      // Sort by end date descending (furthest end date = newest markets)
      return sorted.sort((a, b) => {
        const dateA = a.endDate ? new Date(a.endDate).getTime() : 0;
        const dateB = b.endDate ? new Date(b.endDate).getTime() : 0;
        return dateB - dateA;
      });
    
    case 'ending-soon':
      // Sort by end date ascending (soonest first)
      return sorted.sort((a, b) => {
        const dateA = a.endDate ? new Date(a.endDate).getTime() : Infinity;
        const dateB = b.endDate ? new Date(b.endDate).getTime() : Infinity;
        return dateA - dateB;
      });
    
    case 'liquidity':
      // Sort by total liquidity (most liquid first)
      return sorted.sort((a, b) => b.totalLiquidity - a.totalLiquidity);
    
    case 'alphabetical':
      // Sort alphabetically by title
      return sorted.sort((a, b) => a.eventTitle.localeCompare(b.eventTitle));
    
    default:
      return sorted;
  }
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Initial Market State - empty, will be populated by search
  markets: [],
  groupedMarkets: [],
  allGroupedMarkets: [],
  activeMarket: null,
  activeGroupedMarket: null,
  activeOutcomeId: null,
  isSearching: false,
  searchQuery: '',
  filters: {
    showResolved: false,
    category: 'all' as CategorySlug,
    sortBy: 'trending' as SortOption,
  },
  
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
  
  setFilters: (filters: MarketFilters) => {
    const { allGroupedMarkets } = get();
    
    // Apply filters to the stored markets
    let filtered = allGroupedMarkets;
    filtered = filterResolved(filtered, filters.showResolved);
    filtered = filterByCategory(filtered, filters.category);
    filtered = sortMarkets(filtered, filters.sortBy);
    
    set({ 
      filters, 
      groupedMarkets: filtered 
    });
  },
  
  // Search markets - filter locally from all markets for better results
  searchMarkets: async (query: string) => {
    const { filters, allGroupedMarkets } = get();
    set({ isSearching: true, searchQuery: query });
    
    try {
      // Always fetch from main markets endpoint and filter locally
      // Polymarket's search API is unreliable, so we filter on our end
      let url = `/api/markets`;
      
      // Add category filter if not 'all'
      if (filters.category !== 'all') {
        url += `?tag=${filters.category}`;
      }
      
      // Only fetch if we don't have markets cached or query is empty (refresh)
      let allMarkets = allGroupedMarkets;
      if (!allMarkets.length || !query) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status}`);
        }
        const data = await response.json();
        allMarkets = data.groupedMarkets || [];
      }
      
      // Apply search filter locally for better matching
      let filtered = allMarkets;
      if (query && query.trim()) {
        const searchTerms = query.toLowerCase().trim().split(/\s+/);
        filtered = allMarkets.filter((market: GroupedMarket) => {
          const title = market.eventTitle?.toLowerCase() || '';
          const description = market.description?.toLowerCase() || '';
          // Match all search terms (AND logic)
          return searchTerms.every(term => 
            title.includes(term) || description.includes(term)
          );
        });
      }
      
      // Apply other filters and sorting
      filtered = filterResolved(filtered, filters.showResolved);
      filtered = filterByCategory(filtered, filters.category);
      filtered = sortMarkets(filtered, filters.sortBy);
      
      set({ 
        markets: [], 
        allGroupedMarkets: allMarkets,
        groupedMarkets: filtered,
        isSearching: false 
      });
    } catch (error) {
      console.error('Market search error:', error);
      set({ markets: [], groupedMarkets: [], allGroupedMarkets: [], isSearching: false });
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
