/**
 * Polymarket Adapter
 * 
 * Fetches and normalizes markets from Polymarket's Gamma API.
 * Polymarket structure: Event -> Markets (outcomes)
 */

import { BasePlatformAdapter } from './base-adapter';
import { RawMarket, AdapterConfig } from './types';
import { mapCategory } from './category-mapper';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

// ============================================================
// Polymarket API Types
// ============================================================

interface PolymarketEvent {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  category?: string;
  endDate?: string;
  closed?: boolean;
  resolved?: boolean;
  markets?: PolymarketMarket[];
  tags?: Array<{ slug: string; label: string }>;
}

interface PolymarketMarket {
  id?: string;
  closed?: boolean;
  resolved?: boolean;
  outcomePrices?: string | string[];
  volume24hr?: string;
  volume1wk?: string;
  volume1mo?: string;
  volume?: string;
  liquidity?: string;
  groupItemTitle?: string;
  question?: string;
  slug?: string;
  description?: string;
  endDate?: string;
  clobTokenIds?: string;
}

// ============================================================
// Polymarket Adapter
// ============================================================

export class PolymarketAdapter extends BasePlatformAdapter {
  readonly platform = 'polymarket' as const;
  readonly displayName = 'Polymarket';
  
  constructor(config?: Partial<AdapterConfig>) {
    super({
      maxPages: 15,
      pageSize: 100,
      ...config,
    });
  }
  
  /**
   * Check if a market is active and tradeable.
   */
  isActiveMarket(market: PolymarketMarket): boolean {
    if (market.closed === true || market.resolved === true) {
      return false;
    }
    
    // Check for valid prices
    const hasValidPrices = market.outcomePrices !== undefined && market.outcomePrices !== null;
    const volumeTotal = parseFloat(market.volume || '0') || 0;
    const liquidity = parseFloat(market.liquidity || '0') || 0;
    
    // Skip placeholder markets with no data
    if (!hasValidPrices && volumeTotal === 0 && liquidity === 0) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Normalize Polymarket price (already in decimal format 0-1).
   */
  normalizePrice(price: number | undefined): number {
    if (price === undefined || price === null) return 0.5;
    return price;
  }
  
  /**
   * Fetch all active markets from Polymarket.
   */
  async fetchMarkets(): Promise<RawMarket[]> {
    const events = await this.fetchEvents();
    return this.normalizeEvents(events);
  }
  
  /**
   * Fetch events from Polymarket API with pagination.
   */
  private async fetchEvents(): Promise<PolymarketEvent[]> {
    const fetchPromises = Array.from({ length: this.config.maxPages }, (_, page) => {
      const url = new URL(`${GAMMA_API_BASE}/events`);
      url.searchParams.append('limit', String(this.config.pageSize));
      url.searchParams.append('offset', String(page * this.config.pageSize));
      url.searchParams.append('active', 'true');
      url.searchParams.append('closed', 'false');
      
      return this.fetchJSON<PolymarketEvent[]>(url.toString())
        .then(data => data || []);
    });
    
    const allPages = await Promise.all(fetchPromises);
    const allEvents: PolymarketEvent[] = [];
    
    for (const pageEvents of allPages) {
      if (pageEvents && pageEvents.length > 0) {
        allEvents.push(...pageEvents);
      }
    }
    
    this.log(`Fetched ${allEvents.length} events`);
    return allEvents;
  }
  
  /**
   * Normalize Polymarket events to RawMarket format.
   */
  private normalizeEvents(events: PolymarketEvent[]): RawMarket[] {
    const markets: RawMarket[] = [];
    
    for (const event of events) {
      const eventMarkets = event.markets || [];
      
      for (const market of eventMarkets) {
        // Skip inactive markets
        if (!this.isActiveMarket(market)) {
          continue;
        }
        
        // Parse price
        let odds = 0.5;
        try {
          const prices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : (market.outcomePrices || ['0.5']);
          odds = parseFloat(prices[0]) || 0.5;
        } catch {
          odds = 0.5;
        }
        
        // Skip fully resolved prices
        if ((odds >= 1.0 || odds <= 0) && (market.closed || market.resolved)) {
          continue;
        }
        
        // Parse volumes
        const volume24h = parseFloat(market.volume24hr || '0') || 0;
        const volume1wk = parseFloat(market.volume1wk || '0') || 0;
        const volume1mo = parseFloat(market.volume1mo || '0') || 0;
        const volumeTotal = parseFloat(market.volume || '0') || 0;
        const liquidity = parseFloat(market.liquidity || '0') || 0;
        
        // Parse metadata
        let clobTokenIds: string[] = [];
        try {
          if (typeof market.clobTokenIds === 'string') {
            clobTokenIds = JSON.parse(market.clobTokenIds);
          } else if (Array.isArray(market.clobTokenIds)) {
            clobTokenIds = market.clobTokenIds;
          }
        } catch {
          clobTokenIds = [];
        }
        
        // Get outcome title
        const outcomeTitle = market.groupItemTitle || market.question || event.title;
        
        // Map category
        const category = mapCategory(event.category);
        
        markets.push({
          id: market.id || `${event.id}-${markets.length}`,
          platform: 'polymarket',
          
          // Polymarket doesn't have series, just events
          eventId: event.id,
          eventTitle: event.title,
          
          title: outcomeTitle,
          description: market.description || event.description,
          
          odds,
          volume24h,
          volume1wk,
          volume1mo,
          volumeTotal,
          liquidity,
          
          status: market.resolved ? 'resolved' : (market.closed ? 'closed' : 'active'),
          endDate: market.endDate || event.endDate,
          
          category,
          tags: event.tags?.map(t => t.slug),
          
          metadata: {
            slug: event.slug || market.slug,
            clobTokenIds,
          },
        });
      }
    }
    
    this.log(`Normalized ${markets.length} markets`);
    return markets;
  }
}

// Export singleton instance
export const polymarketAdapter = new PolymarketAdapter();
