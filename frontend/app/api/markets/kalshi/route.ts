import { NextResponse } from 'next/server';
import { KalshiMarket, KalshiMarketsResponse, GroupedMarket, MarketOutcome } from '@/lib/types';

// Force dynamic rendering to avoid caching issues with large payloads
export const dynamic = 'force-dynamic';

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// Fetch all markets from Kalshi with pagination
async function fetchAllKalshiMarkets(): Promise<KalshiMarket[]> {
  const allMarkets: KalshiMarket[] = [];
  let cursor: string | undefined = undefined;
  const limit = 500; // Reduced for faster loading
  const maxPages = 5; // Reduced from 10 for faster loading

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${KALSHI_API_BASE}/markets`);
    url.searchParams.append('limit', String(limit));
    // Don't filter by status in API - we'll filter on our side
    
    if (cursor) {
      url.searchParams.append('cursor', cursor);
    }

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AgentPM/1.0',
        },
        cache: 'no-store', // Disable caching to avoid 2MB limit issues
      });

      if (!response.ok) {
        console.error(`Kalshi API error: ${response.status}`);
        break;
      }

      const data: KalshiMarketsResponse = await response.json();
      
      if (data.markets && data.markets.length > 0) {
        allMarkets.push(...data.markets);
      }

      // Check if there are more pages
      if (!data.cursor || data.markets.length < limit) {
        break;
      }
      
      cursor = data.cursor;
    } catch (error) {
      console.error('Error fetching Kalshi markets:', error);
      break;
    }
  }

  return allMarkets;
}

// Normalize Kalshi price (can be cents or fixed-point decimal)
function normalizeKalshiPrice(price?: number): number {
  if (price === undefined || price === null) return 0.5;
  
  // Kalshi prices can be in cents (e.g., 5600 = $0.56) or decimal (e.g., 0.56)
  // If price > 1, it's likely in cents
  if (price > 1) {
    return price / 10000; // Convert cents to decimal (5600 -> 0.56)
  }
  
  return price;
}

// Map Kalshi categories to our standard category slugs
function mapKalshiCategory(category?: string): string {
  if (!category) return 'other';
  const lower = category.toLowerCase();
  
  const categoryMap: Record<string, string> = {
    'politics': 'politics',
    'economics': 'finance',
    'financials': 'finance',
    'finance': 'finance',
    'fed': 'finance',
    'crypto': 'crypto',
    'climate': 'science',
    'science': 'science',
    'tech': 'ai',
    'technology': 'ai',
    'ai': 'ai',
    'sports': 'sports',
    'entertainment': 'pop-culture',
    'culture': 'pop-culture',
    'world': 'geopolitics',
    'companies': 'business',
    'business': 'business',
  };
  
  for (const [key, value] of Object.entries(categoryMap)) {
    if (lower.includes(key)) return value;
  }
  
  return 'other';
}

// Group Kalshi markets by event ticker
function groupKalshiMarkets(markets: KalshiMarket[]): GroupedMarket[] {
  const eventMap = new Map<string, { markets: KalshiMarket[]; eventTitle: string; category: string }>();

  // Group markets by event_ticker
  for (const market of markets) {
    const eventTicker = market.event_ticker || market.ticker;
    
    if (!eventMap.has(eventTicker)) {
      const eventTitle = market.title || eventTicker;
      const category = mapKalshiCategory(market.category);
      eventMap.set(eventTicker, { markets: [], eventTitle, category });
    }
    
    eventMap.get(eventTicker)!.markets.push(market);
  }

  const groupedMarkets: GroupedMarket[] = [];

  for (const [eventTicker, { markets: eventMarkets, eventTitle, category }] of Array.from(eventMap.entries())) {
    const outcomes: MarketOutcome[] = [];
    let totalVolume24h = 0;
    let totalVolumeTotal = 0;
    let totalLiquidity = 0;

    for (const market of eventMarkets) {
      // Skip non-active markets (Kalshi uses 'active' instead of 'open')
      if (market.status !== 'open' && market.status !== 'active') continue;

      const volume24h = market.volume_24h || 0;
      const volumeTotal = market.volume || 0;
      const liquidity = market.liquidity || market.open_interest || 0;
      
      // Get the "yes" price - prefer last_price, fallback to yes_bid/ask midpoint
      let yesPrice = 0.5;
      if (market.last_price !== undefined) {
        yesPrice = normalizeKalshiPrice(market.last_price);
      } else if (market.yes_bid !== undefined && market.yes_ask !== undefined) {
        const midpoint = (market.yes_bid + market.yes_ask) / 2;
        yesPrice = normalizeKalshiPrice(midpoint);
      }

      totalVolume24h += volume24h;
      totalVolumeTotal += volumeTotal;
      totalLiquidity += liquidity;

      // Use subtitle as outcome title if available, otherwise use title
      const outcomeTitle = market.yes_sub_title || market.subtitle || market.title || market.ticker;

      outcomes.push({
        id: `kalshi-${market.ticker}`,
        title: outcomeTitle,
        odds: yesPrice,
        volume24h: volume24h,
        volumeTotal: volumeTotal,
        liquidity: liquidity,
        resolved: market.status !== 'open' && market.status !== 'active',
        platform: 'kalshi',
      });
    }

    // Skip events with no valid outcomes
    if (outcomes.length === 0) continue;

    // Sort outcomes by odds (highest first)
    outcomes.sort((a, b) => b.odds - a.odds);

    const firstMarket = eventMarkets[0];

    // Get end date from expected_expiration_time or close_time
    const endDate = firstMarket.expected_expiration_time || 
                    firstMarket.expiration_time || 
                    firstMarket.close_time || '';

    // Create proper tags array matching the mapped category
    const tags = category && category !== 'other' 
      ? [{ slug: category, label: category.charAt(0).toUpperCase() + category.slice(1) }]
      : [];

    groupedMarkets.push({
      eventId: `kalshi-${eventTicker}`,
      eventTitle: eventTitle,
      slug: eventTicker.toLowerCase(),
      description: firstMarket.rules_primary,
      category: category,
      endDate: endDate,
      outcomes: outcomes,
      totalVolume24h: totalVolume24h,
      totalVolumeTotal: totalVolumeTotal,
      totalLiquidity: totalLiquidity,
      hasArbitrage: false,
      resolved: false,
      platforms: ['kalshi'],
      tags: tags,
    });
  }

  // Sort by 24h volume (most active first)
  groupedMarkets.sort((a, b) => b.totalVolume24h - a.totalVolume24h);

  return groupedMarkets;
}

export async function GET() {
  try {
    const markets = await fetchAllKalshiMarkets();
    const groupedMarkets = groupKalshiMarkets(markets);

    return NextResponse.json({
      markets: [], // We primarily use groupedMarkets
      groupedMarkets: groupedMarkets,
      totalEvents: groupedMarkets.length,
      totalMarkets: markets.length,
      timestamp: Date.now(),
      source: 'kalshi',
    });
  } catch (error) {
    console.error('Error in Kalshi markets route:', error);
    
    return NextResponse.json({
      markets: [],
      groupedMarkets: [],
      timestamp: Date.now(),
      error: 'Failed to fetch markets from Kalshi',
    }, { status: 500 });
  }
}
