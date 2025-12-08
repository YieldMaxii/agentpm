/**
 * Kalshi Adapter
 * 
 * Fetches and normalizes markets from Kalshi's public API.
 * 
 * KEY INSIGHT: Use the /events endpoint instead of /markets to get:
 * - Proper event titles (e.g., "Pro Football Champion?")
 * - Markets grouped under their parent events
 * - Outcome titles (e.g., "Los Angeles R", "Philadelphia")
 * 
 * Reference: https://docs.kalshi.com/api-reference/events/get-events
 */

import { BasePlatformAdapter } from './base-adapter';
import { RawMarket, AdapterConfig } from './types';
import { mapCategory } from './category-mapper';

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// ============================================================
// Kalshi API Types (from /events endpoint)
// ============================================================

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type?: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status: string;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  last_price?: number;
  volume?: number;
  volume_24h?: number;
  liquidity?: number;
  open_interest?: number;
  result?: string;
  close_time?: string;
  expiration_time?: string;
  expected_expiration_time?: string;
  category?: string;
  rules_primary?: string;
}

interface KalshiEvent {
  event_ticker: string;
  series_ticker?: string;
  title: string;
  sub_title?: string;
  category?: string;
  mutually_exclusive?: boolean;
  markets: KalshiMarket[];
  strike_date?: string;
}

interface KalshiEventsResponse {
  events: KalshiEvent[];
  cursor?: string;
}

// ============================================================
// Kalshi Adapter
// ============================================================

export class KalshiAdapter extends BasePlatformAdapter {
  readonly platform = 'kalshi' as const;
  readonly displayName = 'Kalshi';
  
  constructor(config?: Partial<AdapterConfig>) {
    super({
      maxPages: 10,
      pageSize: 200,
      ...config,
    });
  }
  
  /**
   * Check if a market is active and tradeable.
   */
  isActiveMarket(market: KalshiMarket): boolean {
    return market.status === 'active' || market.status === 'open';
  }
  
  /**
   * Normalize Kalshi price to decimal (0-1).
   * Kalshi API returns prices in cents (0-100).
   * e.g., 17 = 17 cents = 17% = 0.17
   */
  normalizePrice(price: number | undefined): number {
    if (price === undefined || price === null) return 0.5;
    
    // Kalshi prices are in cents (0-100)
    // Always divide by 100 to get decimal probability
    if (price > 1) {
      return Math.min(price / 100, 1); // Cap at 1.0
    }
    
    // If price is already <= 1, it might be in decimal format
    // or it's a very low probability (1 cent = 1%)
    // Check if it looks like it needs conversion
    if (price >= 0.01 && price <= 1) {
      // Could be 0.17 (already decimal) or could be 1 (1 cent)
      // If it's a whole number like 1, 2, etc., treat as cents
      if (Number.isInteger(price) && price <= 100) {
        return price / 100;
      }
      return price; // Already decimal
    }
    
    return price;
  }
  
  /**
   * Fetch all active markets from Kalshi using the /events endpoint.
   */
  async fetchMarkets(): Promise<RawMarket[]> {
    const events = await this.fetchAllEvents();
    return this.normalizeEvents(events);
  }
  
  /**
   * Fetch all events from Kalshi API.
   * The /events endpoint returns events with their markets nested inside.
   */
  private async fetchAllEvents(): Promise<KalshiEvent[]> {
    const allEvents: KalshiEvent[] = [];
    let cursor: string | undefined = undefined;
    
    for (let page = 0; page < this.config.maxPages; page++) {
      const url = new URL(`${KALSHI_API_BASE}/events`);
      url.searchParams.append('limit', String(this.config.pageSize));
      url.searchParams.append('with_nested_markets', 'true');
      url.searchParams.append('status', 'open');
      
      if (cursor) {
        url.searchParams.append('cursor', cursor);
      }
      
      const data = await this.fetchJSON<KalshiEventsResponse>(url.toString());
      
      if (!data || !data.events || data.events.length === 0) {
        break;
      }
      
      allEvents.push(...data.events);
      
      if (!data.cursor || data.events.length < this.config.pageSize) {
        break;
      }
      
      cursor = data.cursor;
    }
    
    console.log(`[Kalshi] Fetched ${allEvents.length} events from /events endpoint`);
    return allEvents;
  }
  
  /**
   * Normalize Kalshi events to RawMarket format.
   * Each market within an event becomes a RawMarket with the event's title.
   */
  private normalizeEvents(events: KalshiEvent[]): RawMarket[] {
    const result: RawMarket[] = [];
    let totalMarkets = 0;
    
    for (const event of events) {
      const markets = event.markets || [];
      if (markets.length === 0) continue;
      
      // The event title is the proper title (e.g., "Pro Football Champion?")
      const eventTitle = event.title;
      const eventTicker = event.event_ticker;
      const seriesTicker = event.series_ticker;
      const category = mapCategory(event.category);
      
      for (const market of markets) {
        // Skip inactive markets
        if (!this.isActiveMarket(market)) continue;
        
        // Get odds
        let odds = 0.5;
        if (market.last_price !== undefined) {
          odds = this.normalizePrice(market.last_price);
        } else if (market.yes_bid !== undefined && market.yes_ask !== undefined) {
          odds = this.normalizePrice((market.yes_bid + market.yes_ask) / 2);
        }
        
        const volume24h = market.volume_24h || 0;
        const volumeTotal = market.volume || 0;
        const liquidity = market.liquidity || market.open_interest || 0;
        
        // Get outcome title - this describes what this specific market represents
        // For multi-outcome events like "Pro Football Champion?", this would be "Los Angeles R"
        const outcomeTitle = this.getOutcomeTitle(market, markets.length);
        
        const endDate = market.expected_expiration_time ||
                        market.expiration_time ||
                        market.close_time;
        
        result.push({
          id: `kalshi-${market.ticker}`,
          platform: 'kalshi',
          seriesId: seriesTicker ? `kalshi-series-${seriesTicker}` : undefined,
          seriesTitle: seriesTicker ? this.getSeriesTitle(seriesTicker) : undefined,
          eventId: `kalshi-${eventTicker}`,
          eventTitle, // The proper event title from Kalshi!
          title: outcomeTitle,
          description: market.rules_primary,
          odds,
          volume24h,
          volumeTotal,
          liquidity,
          status: 'active',
          endDate,
          category,
          metadata: {
            ticker: market.ticker,
            eventTicker,
            seriesTicker,
            mutuallyExclusive: event.mutually_exclusive,
          },
        });
        
        totalMarkets++;
      }
    }
    
    console.log(`[Kalshi] Normalized ${totalMarkets} markets from ${events.length} events`);
    return result;
  }
  
  /**
   * Get the outcome title for a market.
   */
  private getOutcomeTitle(market: KalshiMarket, siblingCount: number): string {
    // Prefer specific outcome fields
    if (market.yes_sub_title) {
      return market.yes_sub_title;
    }
    
    if (market.subtitle) {
      return market.subtitle;
    }
    
    // For single-market events, outcome is just "Yes"
    if (siblingCount === 1) {
      return 'Yes';
    }
    
    // The market title might be the outcome for multi-outcome events
    const title = market.title || '';
    
    // If it's a short title, use it as the outcome
    if (title.length > 0 && title.length < 100) {
      return title;
    }
    
    return 'Yes';
  }
  
  /**
   * Get series title from series ticker.
   */
  private getSeriesTitle(seriesTicker: string): string {
    const seriesNames: Record<string, string> = {
      'KXFEDWATCH': 'Fed Rate Decisions',
      'KXINFL': 'Inflation',
      'KXGDP': 'GDP',
      'KXJOBS': 'Jobs Reports',
      'KXCPI': 'CPI',
      'KXNFL': 'NFL',
      'KXNBA': 'NBA',
      'KXMLB': 'MLB',
      'KXNHL': 'NHL',
      'SUPERBOWL': 'Super Bowl',
      'NFL': 'NFL',
      'NBA': 'NBA',
    };
    
    for (const [prefix, name] of Object.entries(seriesNames)) {
      if (seriesTicker.toUpperCase().includes(prefix)) {
        return name;
      }
    }
    
    return seriesTicker;
  }
}

// Export singleton instance
export const kalshiAdapter = new KalshiAdapter();
