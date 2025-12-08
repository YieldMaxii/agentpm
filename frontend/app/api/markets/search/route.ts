import { NextResponse } from 'next/server';
import { NormalizedMarket, GroupedMarket, MarketOutcome } from '@/lib/types';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

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
  tags?: { slug: string; label: string }[];
}

interface PolymarketMarket {
  id?: string;
  closed?: boolean;
  resolved?: boolean;
  outcomePrices?: string | string[];
  volume24hr?: string;
  volume1wk?: string;
  volume1mo?: string;
  volume?: string; // Total volume
  liquidity?: string;
  groupItemTitle?: string;
  question?: string;
  slug?: string;
  description?: string;
  endDate?: string;
  clobTokenIds?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || !query.trim()) {
    return NextResponse.json({
      markets: [],
      groupedMarkets: [],
      timestamp: Date.now(),
      error: 'Search query is required',
    }, { status: 400 });
  }

  try {
    // Search ALL events (including resolved/closed) to find any market ever on Polymarket
    const allEvents: PolymarketEvent[] = [];
    const pageSize = 100;
    const maxPages = 10; // Limit search to 1000 results for performance
    
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(`${GAMMA_API_BASE}/events`);
      url.searchParams.append('q', query.trim());
      url.searchParams.append('limit', String(pageSize));
      url.searchParams.append('offset', String(page * pageSize));
      // NOTE: No active/closed filters - search ALL events including historical

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AgentPM/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Polymarket search error: ${response.status}`);
      }

      const pageEvents = await response.json();
      
      if (!pageEvents || pageEvents.length === 0) {
        break;
      }
      
      allEvents.push(...pageEvents);
      
      if (pageEvents.length < pageSize) {
        break;
      }
    }

    const events = allEvents;
    const groupedMarkets: GroupedMarket[] = [];
    const flatMarkets: NormalizedMarket[] = [];

    for (const event of events) {
      const eventMarkets = event.markets || [];
      const outcomes: MarketOutcome[] = [];
      let totalVolume24h = 0;
      let totalVolume1wk = 0;
      let totalVolume1mo = 0;
      let totalVolumeTotal = 0;
      let totalLiquidity = 0;
      
      // Check if the entire event is resolved/closed
      const isEventResolved = event.closed === true || event.resolved === true;
      
      for (const market of eventMarkets) {
        // Skip placeholder markets (like "Individual T", "Individual P", etc.)
        // These have no prices, no volume, and no liquidity
        const hasValidPrices = market.outcomePrices !== undefined && market.outcomePrices !== null;
        const volume24h = parseFloat(market.volume24hr || '0') || 0;
        const volume1wk = parseFloat(market.volume1wk || '0') || 0;
        const volume1mo = parseFloat(market.volume1mo || '0') || 0;
        const volumeTotal = parseFloat(market.volume || '0') || 0;
        const liquidity = parseFloat(market.liquidity || '0') || 0;
        
        // If no valid prices AND no volume/liquidity, skip this placeholder
        if (!hasValidPrices && volumeTotal === 0 && liquidity === 0) {
          continue;
        }
        
        // Parse the outcome prices
        let yesPrice = 0.5;
        try {
          const prices = typeof market.outcomePrices === 'string' 
            ? JSON.parse(market.outcomePrices) 
            : (market.outcomePrices || ['0.5']);
          yesPrice = parseFloat(prices[0]) || 0.5;
        } catch {
          yesPrice = 0.5;
        }
        
        // Check if this specific market is resolved
        // Only consider it resolved if explicitly closed/resolved, not just low probability
        const isMarketResolved = market.closed === true || market.resolved === true;
        
        totalVolume24h += volume24h;
        totalVolume1wk += volume1wk;
        totalVolume1mo += volume1mo;
        totalVolumeTotal += volumeTotal;
        totalLiquidity += liquidity;
        
        // Get outcome title - this is the specific outcome within the event
        const outcomeTitle = market.groupItemTitle || market.question || event.title;
        
        // Parse clobTokenIds - they come as a JSON string from the API
        let tokenIds: string[] = [];
        try {
          if (typeof market.clobTokenIds === 'string') {
            tokenIds = JSON.parse(market.clobTokenIds);
          } else if (Array.isArray(market.clobTokenIds)) {
            tokenIds = market.clobTokenIds;
          }
        } catch {
          tokenIds = [];
        }
        
        outcomes.push({
          id: market.id || `${event.id}-${outcomes.length}`,
          title: outcomeTitle,
          odds: yesPrice,
          volume24h: volume24h,
          volume1wk: volume1wk,
          volume1mo: volume1mo,
          volumeTotal: volumeTotal,
          liquidity: liquidity,
          resolved: isMarketResolved,
          clobTokenIds: tokenIds,
          platform: 'polymarket',
        });

        // Also add to flat markets for backward compatibility
        flatMarkets.push({
          id: market.id || `${event.id}-${flatMarkets.length}`,
          title: outcomeTitle,
          slug: event.slug || market.slug || '',
          description: market.description || event.description,
          normalizedOdds: {
            polymarket: yesPrice,
          },
          volume24h: volume24h,
          liquidity: liquidity,
          endDate: market.endDate || event.endDate || '',
          category: event.category,
          hasArbitrage: false,
          eventId: event.id,
          eventTitle: event.title,
          resolved: isMarketResolved || isEventResolved,
          platform: 'polymarket',
        });
      }

      // Create grouped market entry for this event
      if (outcomes.length > 0) {
        // Sort outcomes by odds (highest first)
        outcomes.sort((a, b) => b.odds - a.odds);
        
        // Check if all outcomes are resolved
        const allOutcomesResolved = outcomes.every(o => o.resolved);
        
        // Extract tags from event
        const tags = (event.tags || []).map((tag) => ({
          slug: tag.slug || '',
          label: tag.label || '',
        })).filter((tag) => tag.slug);
        
        groupedMarkets.push({
          eventId: event.id,
          eventTitle: event.title,
          slug: event.slug || '',
          description: event.description,
          category: event.category,
          endDate: event.endDate || '',
          outcomes: outcomes,
          totalVolume24h: totalVolume24h,
          totalVolume1wk: totalVolume1wk,
          totalVolume1mo: totalVolume1mo,
          totalVolumeTotal: totalVolumeTotal,
          totalLiquidity: totalLiquidity,
          hasArbitrage: false,
          resolved: isEventResolved || allOutcomesResolved,
          tags: tags,
          platforms: ['polymarket'],
        });
      }
    }

    // Sort grouped markets by total volume (most liquid first)
    groupedMarkets.sort((a, b) => b.totalVolume24h - a.totalVolume24h);

    return NextResponse.json({
      markets: flatMarkets,
      groupedMarkets: groupedMarkets,
      timestamp: Date.now(),
      query,
      totalResults: groupedMarkets.length,
    });
  } catch (error) {
    console.error('Market search error:', error);
    
    return NextResponse.json({
      markets: [],
      groupedMarkets: [],
      timestamp: Date.now(),
      query,
      error: 'Search failed',
    }, { status: 500 });
  }
}

