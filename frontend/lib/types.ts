// ============================================================
// Market Types
// ============================================================

export interface MarketOutcome {
  id: string;
  title: string;
  odds: number;
  volume24h: number;
  liquidity: number;
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
  totalLiquidity: number;
  hasArbitrage: boolean;
}

export interface NormalizedMarket {
  id: string;
  title: string;
  slug: string;
  description?: string;
  normalizedOdds: {
    polymarket: number;
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

