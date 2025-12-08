import { NextResponse } from 'next/server';
import { GroupedMarket, MarketOutcome, MarketPlatform, NormalizedMarket } from '@/lib/types';
import { 
  fetchAllMarkets, 
  processMarkets,
  RawMarket,
  GroupedMarketResult,
} from '@/lib/platforms';

// Force dynamic rendering to avoid caching issues with large payloads
export const dynamic = 'force-dynamic';

// ============================================================
// Type Conversion
// ============================================================

/**
 * Convert GroupedMarketResult to GroupedMarket for backward compatibility.
 */
function toGroupedMarket(result: GroupedMarketResult): GroupedMarket {
  // Convert outcomes to the expected format
  const outcomes: MarketOutcome[] = result.outcomes.map(o => ({
    id: o.id,
    title: o.title,
    odds: o.odds,
    volume24h: o.volume24h,
    volume1wk: o.volume1wk,
    volume1mo: o.volume1mo,
    volumeTotal: o.volumeTotal,
    liquidity: o.liquidity,
    resolved: o.resolved,
    platform: o.platform as MarketPlatform,
  }));

  return {
    eventId: result.eventId,
    eventTitle: result.eventTitle,
    slug: result.slug,
    description: result.description,
    category: result.category,
    endDate: result.endDate,
    outcomes,
    totalVolume24h: result.totalVolume24h,
    totalVolume1wk: result.totalVolume1wk,
    totalVolume1mo: result.totalVolume1mo,
    totalVolumeTotal: result.totalVolumeTotal,
    totalLiquidity: result.totalLiquidity,
    hasArbitrage: result.hasArbitrage,
    resolved: result.resolved,
    tags: result.tags,
    platforms: result.platforms as MarketPlatform[],
    seriesId: result.seriesId,
    seriesTitle: result.seriesTitle,
    crossPlatformOdds: result.crossPlatformOdds as GroupedMarket['crossPlatformOdds'],
  };
}

/**
 * Convert RawMarket to NormalizedMarket for backward compatibility.
 */
function toNormalizedMarket(raw: RawMarket): NormalizedMarket {
  return {
    id: raw.id,
    title: raw.title,
    slug: (raw.metadata?.slug as string) || '',
    description: raw.description,
    normalizedOdds: {
      [raw.platform]: raw.odds,
    } as Record<MarketPlatform, number>,
    volume24h: raw.volume24h,
    liquidity: raw.liquidity,
    endDate: raw.endDate || '',
    category: raw.category,
    hasArbitrage: false,
    eventId: raw.eventId,
    eventTitle: raw.eventTitle,
    platform: raw.platform as MarketPlatform,
  };
}

// ============================================================
// Main Route Handler
// ============================================================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const platformFilter = searchParams.get('platform') as MarketPlatform | 'all' | null;

  try {
    // Fetch from all platforms using adapters
    const rawMarkets = await fetchAllMarkets();
    
    // Log platform breakdown
    const platformCounts: Record<string, number> = {};
    for (const market of rawMarkets) {
      platformCounts[market.platform] = (platformCounts[market.platform] || 0) + 1;
    }
    console.log(`[Markets API] Raw markets by platform:`, platformCounts);

    // Process and group markets using shared logic
    const groupedResults = processMarkets(rawMarkets);
    
    console.log(`[Markets API] Grouped: ${groupedResults.length} events`);

    // Convert to GroupedMarket format for backward compatibility
    let allGroupedMarkets = groupedResults.map(toGroupedMarket);

    // Apply platform filter if specified
    if (platformFilter && platformFilter !== 'all') {
      allGroupedMarkets = allGroupedMarkets.filter(m => 
        m.platforms.includes(platformFilter)
      );
    }

    // Sort by total 24h volume (most active first)
    allGroupedMarkets.sort((a, b) => b.totalVolume24h - a.totalVolume24h);

    // Count stats
    const polymarketCount = allGroupedMarkets.filter(m => m.platforms.includes('polymarket')).length;
    const kalshiCount = allGroupedMarkets.filter(m => m.platforms.includes('kalshi')).length;
    const crossPlatformCount = allGroupedMarkets.filter(m => m.platforms.length > 1).length;

    // Create flat markets for backward compatibility
    const flatMarkets: NormalizedMarket[] = rawMarkets
      .filter(m => {
        if (platformFilter && platformFilter !== 'all') {
          return m.platform === platformFilter;
        }
        return true;
      })
      .map(toNormalizedMarket);

    return NextResponse.json({
      markets: flatMarkets,
      groupedMarkets: allGroupedMarkets,
      totalEvents: allGroupedMarkets.length,
      stats: {
        polymarket: polymarketCount,
        kalshi: kalshiCount,
        crossPlatform: crossPlatformCount,
      },
      timestamp: Date.now(),
      query: query || null,
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    
    return NextResponse.json({
      markets: [],
      groupedMarkets: [],
      timestamp: Date.now(),
      error: 'Failed to fetch markets',
    }, { status: 500 });
  }
}
