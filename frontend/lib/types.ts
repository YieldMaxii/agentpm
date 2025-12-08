// ============================================================
// Market Types
// ============================================================

export type MarketPlatform = 'polymarket' | 'kalshi' | 'predictit' | 'metaculus' | 'manifold';

export interface MarketOutcome {
  id: string;
  title: string;
  odds: number;
  volume24h: number;
  volume1wk?: number;
  volume1mo?: number;
  volumeTotal: number;
  liquidity: number;
  resolved?: boolean;
  clobTokenIds?: string[]; // Token IDs for CLOB price history API
  platform: MarketPlatform; // Which platform this outcome is from
}

export interface MarketTag {
  slug: string;
  label: string;
}

export interface GroupedMarket {
  eventId: string;
  eventTitle: string;
  slug: string;
  description?: string;
  category?: string;
  endDate: string;
  outcomes: MarketOutcome[];
  totalVolume24h: number;
  totalVolume1wk?: number;
  totalVolume1mo?: number;
  totalVolumeTotal: number;
  totalLiquidity: number;
  hasArbitrage: boolean;
  resolved?: boolean;
  tags?: MarketTag[];
  platforms: MarketPlatform[]; // Which platforms have this market
  // Hierarchical grouping (optional series level above events)
  seriesId?: string;
  seriesTitle?: string;
  // Cross-platform odds for comparison (when same market on multiple platforms)
  crossPlatformOdds?: {
    polymarket?: number;
    kalshi?: number;
  };
  // For cross-platform view: contains the matching market from each platform
  platformMarkets?: {
    platform: MarketPlatform;
    eventId: string;
    eventTitle: string;
    outcomes: MarketOutcome[];
    totalVolume24h: number;
    totalVolumeTotal: number;
  }[];
}

export type VolumeTimeframe = '24h' | '1wk' | '1mo' | 'total';

export interface NormalizedMarket {
  id: string;
  title: string;
  slug: string;
  description?: string;
  normalizedOdds: {
    polymarket?: number;
    kalshi?: number;
    predictit?: number;
    azuro?: number;
    zeitgeist?: number;
  };
  volume24h: number;
  liquidity: number;
  endDate: string;
  category?: string;
  hasArbitrage: boolean;
  priceHistory?: PricePoint[];
  // Reference to parent event if this is an outcome
  eventId?: string;
  eventTitle?: string;
  // Whether this market has been resolved/closed
  resolved?: boolean;
  // Primary platform source
  platform: MarketPlatform;
}

export interface PricePoint {
  timestamp: number;
  odds: number;
  source: 'polymarket' | 'kalshi' | 'predictit' | 'azuro' | 'zeitgeist';
}

// ============================================================
// Agent Types
// ============================================================

export type AgentState = 'idle' | 'running' | 'awaiting_input' | 'completed' | 'error';

export type AgentTag = 'PLANNER' | 'SCOUT' | 'RESEARCHER' | 'DETECTOR' | 'SYSTEM';

export interface LogEntry {
  id: string;
  timestamp: number;
  tag: AgentTag;
  message: string;
  depth?: number;
}

export interface DecisionPrompt {
  id: string;
  title: string;
  message: string;
  options: DecisionOption[];
  timestamp: number;
}

export interface DecisionOption {
  id: string;
  label: string;
  action: 'continue' | 'provide_input' | 'abort';
  inputRequired?: boolean;
}

// ============================================================
// Alpha Signal Types
// ============================================================

export type SignalType = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

export interface AlphaSignal {
  marketId: string;
  marketTitle: string;
  signal: SignalType;
  edge: number;
  fairValue: number;
  marketOdds: number;
  confidence: number;
  factors: FactorAnalysis[];
  reasoning: string;
  timestamp: number;
}

export interface FactorAnalysis {
  name: string;
  weight: number;
  score: number;
  evidence: string;
}

// ============================================================
// Agent Configuration
// ============================================================

export interface AgentConfig {
  risk: 'conservative' | 'standard' | 'aggressive' | 'degen';
  logic: 'first_principles' | 'balanced' | 'contrarian';
  sources: DataSource[];
  directives: string;
}

export type DataSource = 'perplexity' | 'twitter' | 'sec' | 'news' | 'onchain';

// ============================================================
// WebSocket Message Types
// ============================================================

export type WSMessageType = 'log' | 'decision_prompt' | 'final_result' | 'error' | 'status';

export interface WSMessage {
  type: WSMessageType;
  payload: LogEntry | DecisionPrompt | AlphaSignal | { status: AgentState } | { error: string };
}

export interface WSOutgoingMessage {
  type: 'start' | 'decision_response' | 'abort';
  payload: {
    marketId?: string;
    query?: string;
    config?: AgentConfig;
    decisionId?: string;
    response?: string;
  };
}

// ============================================================
// API Response Types
// ============================================================

export interface MarketsResponse {
  markets: NormalizedMarket[];
  groupedMarkets?: GroupedMarket[];
  timestamp: number;
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  outcomes: string[];
  outcomePrices: string | string[]; // Can be JSON string or array
  volume: string;
  liquidity: string;
  endDate: string;
  category?: string;
}

// ============================================================
// Kalshi API Types
// ============================================================

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  open_time?: string;
  close_time?: string;
  expected_expiration_time?: string;
  expiration_time?: string;
  status: string; // 'open', 'closed', 'settled', 'finalized', etc.
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  last_price?: number;
  previous_yes_bid?: number;
  previous_yes_ask?: number;
  previous_price?: number;
  volume?: number;
  volume_24h?: number;
  liquidity?: number;
  open_interest?: number;
  result?: 'yes' | 'no' | 'all_yes' | 'all_no';
  category?: string;
  series_ticker?: string;
  can_close_early?: boolean;
  risk_limit_cents?: number;
  notional_value?: number;
  tick_size?: number;
  yes_floor_cents?: number;
  no_floor_cents?: number;
  settlement_value?: number;
  settlement_timer_seconds?: number;
  cap_strike?: number;
  rules_primary?: string;
  rules_secondary?: string;
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

// ============================================================
// LangFlow API Types
// ============================================================

export interface LangFlowRunRequest {
  input_value: string;
  output_type: 'chat';
  input_type: 'chat';
  tweaks?: Record<string, unknown>;
}

export interface LangFlowRunResponse {
  outputs: LangFlowOutput[];
  session_id?: string;
}

export interface LangFlowOutput {
  inputs: Record<string, unknown>;
  outputs: Array<{
    results: {
      message?: {
        text: string;
        data?: {
          logs?: string[];
          signal?: AlphaSignal;
          [key: string]: unknown;
        };
      };
    };
  }>;
}

export interface AgentRunRequest {
  query: string;
  config: AgentConfig;
  marketContext?: {
    title: string;
    slug: string;
    odds: number;
    volume: number;
  } | null;
}

export interface AgentRunResponse {
  success: boolean;
  logs: string[];
  signal?: AlphaSignal;
  error?: string;
  rawOutput?: string;
}

