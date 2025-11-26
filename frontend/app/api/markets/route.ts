import { NextResponse } from 'next/server';
import { NormalizedMarket, GroupedMarket, MarketOutcome } from '@/lib/types';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const query = searchParams.get('q');

  try {
    // Build the API URL
    const url = new URL(`${GAMMA_API_BASE}/events`);
    url.searchParams.append('limit', String(Math.min(limit, 50)));
    url.searchParams.append('active', 'true');
    url.searchParams.append('closed', 'false');
    
    // Add search query if provided
    if (query && query.trim()) {
      url.searchParams.append('q', query.trim());
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AgentPM/1.0',
      },
      next: { revalidate: 10 }, // Cache for 10 seconds
    });

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status}`);
    }

    const events = await response.json();
    const groupedMarkets: GroupedMarket[] = [];
    const flatMarkets: NormalizedMarket[] = [];

    for (const event of events) {
      const eventMarkets = event.markets || [];
      const outcomes: MarketOutcome[] = [];
      let totalVolume = 0;
      let totalLiquidity = 0;
      
      for (const market of eventMarkets) {
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
        
        const volume = parseFloat(market.volume24hr || market.volume || '0') || 0;
        const liquidity = parseFloat(market.liquidity || '0') || 0;
        totalVolume += volume;
        totalLiquidity += liquidity;
        
        // Get outcome title - this is the specific outcome within the event
        const outcomeTitle = market.groupItemTitle || market.question || event.title;
        
        outcomes.push({
          id: market.id || `${event.id}-${outcomes.length}`,
          title: outcomeTitle,
          odds: yesPrice,
          volume24h: volume,
          liquidity: liquidity,
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
          volume24h: volume,
          liquidity: liquidity,
          endDate: market.endDate || event.endDate || '',
          category: event.category,
          hasArbitrage: false,
          eventId: event.id,
          eventTitle: event.title,
        });
      }

      // Create grouped market entry for this event
      if (outcomes.length > 0) {
        // Sort outcomes by odds (highest first)
        outcomes.sort((a, b) => b.odds - a.odds);
        
        groupedMarkets.push({
          eventId: event.id,
          eventTitle: event.title,
          slug: event.slug || '',
          description: event.description,
          category: event.category,
          endDate: event.endDate || '',
          outcomes: outcomes,
          totalVolume24h: totalVolume,
          totalLiquidity: totalLiquidity,
          hasArbitrage: false,
        });
      }
    }

    // Sort grouped markets by total volume (most liquid first)
    groupedMarkets.sort((a, b) => b.totalVolume24h - a.totalVolume24h);

    return NextResponse.json({
      markets: flatMarkets.slice(0, limit * 3),
      groupedMarkets: groupedMarkets.slice(0, limit),
      timestamp: Date.now(),
      query: query || null,
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    
    return NextResponse.json({
      markets: [],
      groupedMarkets: [],
      timestamp: Date.now(),
      error: 'Failed to fetch markets from Polymarket',
    }, { status: 500 });
  }
}
