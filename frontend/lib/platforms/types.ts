/**
 * Platform Adapter Types
 * 
 * Defines the core interfaces for the multi-platform prediction market system.
 * All platform adapters must conform to these interfaces.
 */

// ============================================================
// Platform Identification
// ============================================================

export type MarketPlatform = 'polymarket' | 'kalshi' | 'predictit' | 'metaculus' | 'manifold';

export type MarketStatus = 'active' | 'closed' | 'resolved';

// ============================================================
// Raw Market (normalized from any platform)
// ============================================================

/**
 * RawMarket represents a single market/outcome from any platform,
 * normalized to a common format before grouping.
 */
export interface RawMarket {
  // Identification
  id: string;                    // Unique ID within platform
  platform: MarketPlatform;
  
  // Hierarchical grouping (series > event > outcome)
  seriesId?: string;             // Optional series grouping (e.g., "all Fed meetings")
  seriesTitle?: string;
  eventId: string;               // Event this outcome belongs to
  eventTitle: string;            // Title of the parent event
  
  // Outcome details
  title: string;                 // This specific outcome's title
  description?: string;
  
  // Pricing & volume
  odds: number;                  // Probability as decimal (0-1)
  volume24h: number;
  volume1wk?: number;
  volume1mo?: number;
  volumeTotal: number;
  liquidity: number;
  
  // Status & timing
  status: MarketStatus;
  endDate?: string;
  
  // Categorization
  category?: string;             // Normalized category slug
  tags?: string[];
  
  // Platform-specific metadata
  metadata?: Record<string, unknown>;
}

// ============================================================
// Platform Adapter Interface
// ============================================================

/**
 * PlatformAdapter defines the contract all platform integrations must follow.
 * Each adapter is responsible for fetching and normalizing markets from its platform.
 */
export interface PlatformAdapter {
  /** Platform identifier */
  readonly platform: MarketPlatform;
  
  /** Human-readable platform name */
  readonly displayName: string;
  
  /** Whether this adapter is enabled */
  readonly enabled: boolean;
  
  /**
   * Fetch all active markets from the platform and normalize them.
   * Should handle pagination internally.
   */
  fetchMarkets(): Promise<RawMarket[]>;
  
  /**
   * Check if a raw API market is in an active/tradeable state.
   */
  isActiveMarket(market: unknown): boolean;
  
  /**
   * Normalize a price from platform-specific format to decimal (0-1).
   * e.g., Kalshi cents (5600) -> 0.56
   */
  normalizePrice(price: number | undefined): number;
}

// ============================================================
// Adapter Configuration
// ============================================================

export interface AdapterConfig {
  /** Maximum pages to fetch (for pagination) */
  maxPages: number;
  
  /** Items per page */
  pageSize: number;
  
  /** Request timeout in ms */
  timeout: number;
  
  /** Whether to log debug info */
  debug: boolean;
}

export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
  maxPages: 15,
  pageSize: 100,
  timeout: 30000,
  debug: process.env.NODE_ENV === 'development',
};

// ============================================================
// Grouped Market Output
// ============================================================

/**
 * GroupedOutcome represents a single outcome within a grouped market.
 */
export interface GroupedOutcome {
  id: string;
  title: string;
  odds: number;
  volume24h: number;
  volume1wk?: number;
  volume1mo?: number;
  volumeTotal: number;
  liquidity: number;
  platform: MarketPlatform;
  resolved?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * GroupedMarketResult is the final output format after grouping.
 * This extends the existing GroupedMarket type with additional fields.
 */
export interface GroupedMarketResult {
  // Identification
  eventId: string;
  eventTitle: string;
  slug: string;
  
  // Optional series grouping
  seriesId?: string;
  seriesTitle?: string;
  
  // Content
  description?: string;
  category?: string;
  endDate: string;
  
  // Outcomes (grouped from multiple platforms)
  outcomes: GroupedOutcome[];
  
  // Aggregated metrics
  totalVolume24h: number;
  totalVolume1wk?: number;
  totalVolume1mo?: number;
  totalVolumeTotal: number;
  totalLiquidity: number;
  
  // Platform info
  platforms: MarketPlatform[];
  
  // Flags
  hasArbitrage: boolean;
  resolved?: boolean;
  
  // Categorization
  tags?: { slug: string; label: string }[];
  
  // Cross-platform comparison
  crossPlatformOdds?: Partial<Record<MarketPlatform, number>>;
}
