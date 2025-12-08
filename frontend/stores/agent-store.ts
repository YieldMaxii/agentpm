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
  AgentTag,
  MarketPlatform
} from '@/lib/types';

// Filter types
export type CategorySlug = 'all' | 'politics' | 'crypto' | 'sports' | 'ai' | 'business' | 'finance' | 'science' | 'pop-culture' | 'geopolitics';
export type SortOption = 'trending' | 'newest' | 'ending-soon' | 'liquidity' | 'alphabetical';

export interface MarketFilters {
  showResolved: boolean;
  category: CategorySlug;
  sortBy: SortOption;
  selectedPlatforms: MarketPlatform[]; // Empty array = all platforms
  crossPlatformOnly: boolean; // Only show markets on multiple platforms
}

interface AgentStore {
  // Market State
  markets: NormalizedMarket[];
  groupedMarkets: GroupedMarket[];
  allGroupedMarkets: GroupedMarket[]; // Unfiltered list
  activeMarket: NormalizedMarket | null;
  activeGroupedMarket: GroupedMarket | null;
  activeOutcomeId: string | null;
  activePlatform: MarketPlatform | null; // Which platform's data to show in chart
  isSearching: boolean;
  searchQuery: string;
  filters: MarketFilters;
  setMarkets: (markets: NormalizedMarket[]) => void;
  setGroupedMarkets: (markets: GroupedMarket[]) => void;
  setActiveMarket: (market: NormalizedMarket | null) => void;
  setActiveGroupedMarket: (event: GroupedMarket, platform?: MarketPlatform) => void;
  setActivePlatform: (platform: MarketPlatform) => void;
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

// Stop words for matching
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'will',
  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'win', 'winner',
  'champion', 'championship', 'next', 'any'
]);

// Synonym mappings
const SYNONYMS: Record<string, string[]> = {
  'super bowl': ['pro football championship', 'nfl championship'],
  'world series': ['mlb championship', 'baseball championship'],
  'nba finals': ['nba championship', 'basketball championship'],
  'president': ['presidential', 'potus'],
  'presidential': ['president', 'potus'],
  'nominee': ['nomination', 'nominate'],
  'democratic': ['democrat', 'dem'],
  'republican': ['gop', 'rep'],
  'fed': ['federal reserve', 'fomc'],
  'bitcoin': ['btc'],
  'ethereum': ['eth'],
};

// Helper function to normalize titles for matching
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate title similarity with synonym support
function calculateTitleSimilarity(title1: string, title2: string): number {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  
  if (norm1 === norm2) return 1;
  
  // Extract years - if both have years, they must match
  const years1: string[] = title1.match(/\b(19|20)\d{2}\b/g) || [];
  const years2: string[] = title2.match(/\b(19|20)\d{2}\b/g) || [];
  if (years1.length > 0 && years2.length > 0) {
    if (!years1.some(y => years2.includes(y))) return 0;
  }
  
  // Get meaningful words
  const words1 = norm1.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const words2 = norm2.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Expand with synonyms
  const expanded1 = new Set(words1.flatMap(w => {
    const syns = [w];
    for (const [key, vals] of Object.entries(SYNONYMS)) {
      if (key.includes(w) || vals.some(v => v.includes(w))) {
        syns.push(key, ...vals);
      }
    }
    return syns;
  }));
  
  const expanded2 = new Set(words2.flatMap(w => {
    const syns = [w];
    for (const [key, vals] of Object.entries(SYNONYMS)) {
      if (key.includes(w) || vals.some(v => v.includes(w))) {
        syns.push(key, ...vals);
      }
    }
    return syns;
  }));
  
  const intersection = Array.from(expanded1).filter(x => expanded2.has(x));
  const union = new Set([...Array.from(expanded1), ...Array.from(expanded2)]);
  
  return intersection.length / union.size;
}

// Helper function to filter by platform(s)
function filterByPlatform(
  markets: GroupedMarket[], 
  selectedPlatforms: MarketPlatform[], 
  crossPlatformOnly: boolean
): GroupedMarket[] {
  // If no platforms selected and not cross-platform only, show all
  if (selectedPlatforms.length === 0 && !crossPlatformOnly) {
    return markets;
  }
  
  // If crossPlatformOnly, group matching markets together
  if (crossPlatformOnly) {
    return groupCrossPlatformMarkets(markets, selectedPlatforms);
  }
  
  // Regular platform filter
  return markets.filter(market => {
    return selectedPlatforms.length === 0 || 
      market.platforms?.some(p => selectedPlatforms.includes(p));
  });
}

// Group cross-platform markets together using title similarity
function groupCrossPlatformMarkets(
  markets: GroupedMarket[],
  selectedPlatforms: MarketPlatform[]
): GroupedMarket[] {
  // Filter to only markets with crossPlatformOdds
  const crossPlatformMarkets = markets.filter(m => {
    if (!m.crossPlatformOdds) return false;
    const platformsWithOdds = Object.entries(m.crossPlatformOdds)
      .filter(([, odds]) => odds !== undefined)
      .map(([p]) => p as MarketPlatform);
    
    if (selectedPlatforms.length >= 2) {
      return platformsWithOdds.filter(p => selectedPlatforms.includes(p)).length >= 2;
    }
    return platformsWithOdds.length >= 2;
  });
  
  // Find matching pairs using title similarity
  const grouped: GroupedMarket[] = [];
  const processedIds = new Set<string>();
  
  // Group markets by platform
  const byPlatform = new Map<MarketPlatform, GroupedMarket[]>();
  for (const market of crossPlatformMarkets) {
    const platform = market.platforms[0];
    if (!byPlatform.has(platform)) {
      byPlatform.set(platform, []);
    }
    byPlatform.get(platform)!.push(market);
  }
  
  const platforms = Array.from(byPlatform.keys());
  if (platforms.length < 2) {
    return crossPlatformMarkets; // Not enough platforms to group
  }
  
  // Use first platform as base and find matches from other platforms
  const basePlatform = platforms[0];
  const baseMarkets = byPlatform.get(basePlatform) || [];
  
  for (const baseMarket of baseMarkets) {
    const baseId = `${baseMarket.platforms[0]}:${baseMarket.eventId}`;
    if (processedIds.has(baseId)) continue;
    
    const matchingMarkets: GroupedMarket[] = [baseMarket];
    processedIds.add(baseId);
    
    // Find matches from other platforms
    for (const otherPlatform of platforms.slice(1)) {
      const otherMarkets = byPlatform.get(otherPlatform) || [];
      
      let bestMatch: GroupedMarket | null = null;
      let bestScore = 0;
      
      for (const otherMarket of otherMarkets) {
        const otherId = `${otherMarket.platforms[0]}:${otherMarket.eventId}`;
        if (processedIds.has(otherId)) continue;
        
        const similarity = calculateTitleSimilarity(baseMarket.eventTitle, otherMarket.eventTitle);
        if (similarity > bestScore && similarity >= 0.6) {
          bestScore = similarity;
          bestMatch = otherMarket;
        }
      }
      
      if (bestMatch) {
        matchingMarkets.push(bestMatch);
        processedIds.add(`${bestMatch.platforms[0]}:${bestMatch.eventId}`);
      }
    }
    
    // Only include if we found matches from multiple platforms
    if (matchingMarkets.length >= 2) {
      // Use highest volume market as base
      const bestMarket = matchingMarkets.reduce((best, m) => 
        m.totalVolume24h > best.totalVolume24h ? m : best
      );
      
      // Create platform-specific data
      const platformMarkets = matchingMarkets.map(m => ({
        platform: m.platforms[0],
        eventId: m.eventId,
        eventTitle: m.eventTitle,
        outcomes: m.outcomes,
        totalVolume24h: m.totalVolume24h,
        totalVolumeTotal: m.totalVolumeTotal,
      }));
      
      // Combine platforms
      const allPlatforms = Array.from(new Set(matchingMarkets.flatMap(m => m.platforms))) as MarketPlatform[];
      
      grouped.push({
        ...bestMarket,
        platforms: allPlatforms,
        platformMarkets,
        totalVolume24h: matchingMarkets.reduce((sum, m) => sum + m.totalVolume24h, 0),
        totalVolumeTotal: matchingMarkets.reduce((sum, m) => sum + m.totalVolumeTotal, 0),
        totalLiquidity: matchingMarkets.reduce((sum, m) => sum + m.totalLiquidity, 0),
      });
    }
  }
  
  // Sort by volume
  grouped.sort((a, b) => b.totalVolume24h - a.totalVolume24h);
  
  return grouped;
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
  activePlatform: null,
  isSearching: false,
  searchQuery: '',
  filters: {
    showResolved: false,
    category: 'all' as CategorySlug,
    sortBy: 'trending' as SortOption,
    selectedPlatforms: [],
    crossPlatformOnly: false,
  },
  
  setMarkets: (markets) => set({ markets }),
  setGroupedMarkets: (groupedMarkets) => set({ groupedMarkets }),
  setActiveMarket: (market) => set({ activeMarket: market }),
  setActiveGroupedMarket: (event: GroupedMarket, platform?: MarketPlatform) => {
    // Set the grouped market as active - used for multi-outcome chart view
    // Get odds from each platform's first outcome
    const polyOutcome = event.outcomes.find(o => o.platform === 'polymarket');
    const kalshiOutcome = event.outcomes.find(o => o.platform === 'kalshi');
    
    // Use provided platform or default to first available
    const selectedPlatform = platform || event.platforms?.[0] || 'polymarket';
    
    set({ 
      activeGroupedMarket: event,
      activeOutcomeId: null,
      activePlatform: selectedPlatform,
      // Also set activeMarket for backward compatibility (use event info)
      activeMarket: {
        id: event.eventId,
        title: event.eventTitle,
        slug: event.slug,
        description: event.description,
        normalizedOdds: {
          polymarket: polyOutcome?.odds || event.crossPlatformOdds?.polymarket,
          kalshi: kalshiOutcome?.odds || event.crossPlatformOdds?.kalshi,
        },
        volume24h: event.totalVolume24h,
        liquidity: event.totalLiquidity,
        endDate: event.endDate,
        category: event.category,
        hasArbitrage: event.hasArbitrage,
        eventId: event.eventId,
        eventTitle: event.eventTitle,
        platform: selectedPlatform,
      }
    });
  },
  setActivePlatform: (platform: MarketPlatform) => {
    const { activeGroupedMarket } = get();
    if (activeGroupedMarket) {
      // Update the active platform and refresh the activeMarket
      const polyOutcome = activeGroupedMarket.outcomes.find(o => o.platform === 'polymarket');
      const kalshiOutcome = activeGroupedMarket.outcomes.find(o => o.platform === 'kalshi');
      
      set({
        activePlatform: platform,
        activeMarket: {
          id: activeGroupedMarket.eventId,
          title: activeGroupedMarket.eventTitle,
          slug: activeGroupedMarket.slug,
          description: activeGroupedMarket.description,
          normalizedOdds: {
            polymarket: polyOutcome?.odds || activeGroupedMarket.crossPlatformOdds?.polymarket,
            kalshi: kalshiOutcome?.odds || activeGroupedMarket.crossPlatformOdds?.kalshi,
          },
          volume24h: activeGroupedMarket.totalVolume24h,
          liquidity: activeGroupedMarket.totalLiquidity,
          endDate: activeGroupedMarket.endDate,
          category: activeGroupedMarket.category,
          hasArbitrage: activeGroupedMarket.hasArbitrage,
          eventId: activeGroupedMarket.eventId,
          eventTitle: activeGroupedMarket.eventTitle,
          platform: platform,
        }
      });
    }
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setFilters: (filters: MarketFilters) => {
    const { allGroupedMarkets } = get();
    
    // Apply filters to the stored markets
    let filtered = allGroupedMarkets;
    filtered = filterResolved(filtered, filters.showResolved);
    filtered = filterByCategory(filtered, filters.category);
    filtered = filterByPlatform(filtered, filters.selectedPlatforms || [], filters.crossPlatformOnly || false);
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
      filtered = filterByPlatform(filtered, filters.selectedPlatforms || [], filters.crossPlatformOnly || false);
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
