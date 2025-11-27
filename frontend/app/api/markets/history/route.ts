import { NextResponse } from 'next/server';

const CLOB_API_BASE = 'https://clob.polymarket.com';

interface PricePoint {
  t: number; // Unix timestamp
  p: number; // Price (0-1)
}

interface PriceHistoryResponse {
  history: PricePoint[];
}

// Timeframe configurations using the interval parameter
// This gives us full historical data back to market inception!
const TIMEFRAME_CONFIG: Record<string, { interval: string; fidelity: number }> = {
  '1D': { interval: '1d', fidelity: 15 },        // Last day, 15-min intervals
  '1W': { interval: '1w', fidelity: 60 },        // Last week, hourly intervals
  '1M': { interval: '1m', fidelity: 240 },       // Last month, 4-hour intervals
  'ALL': { interval: 'max', fidelity: 1440 },    // All time (market inception), daily intervals
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenId = searchParams.get('tokenId');
  const timeframe = searchParams.get('timeframe') || '1D';

  if (!tokenId) {
    return NextResponse.json({ 
      error: 'tokenId is required',
      history: [] 
    }, { status: 400 });
  }

  const config = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['1D'];

  try {
    // Use the interval parameter for full historical data
    const url = new URL(`${CLOB_API_BASE}/prices-history`);
    url.searchParams.append('market', tokenId);
    url.searchParams.append('interval', config.interval);
    url.searchParams.append('fidelity', String(config.fidelity));

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      console.error('CLOB API error:', response.status);
      return NextResponse.json({ 
        history: [],
        error: `CLOB API error: ${response.status}` 
      });
    }

    const data: PriceHistoryResponse = await response.json();
    
    // Transform the data to include formatted timestamps
    const history = (data.history || []).map(point => ({
      timestamp: point.t,
      price: point.p,
      date: new Date(point.t * 1000).toISOString(),
    }));

    // Calculate the date range for the response
    const firstDate = history.length > 0 ? history[0].date : null;
    const lastDate = history.length > 0 ? history[history.length - 1].date : null;

    return NextResponse.json({
      history,
      tokenId,
      timeframe,
      interval: config.interval,
      fidelity: config.fidelity,
      pointCount: history.length,
      dateRange: {
        start: firstDate,
        end: lastDate,
      }
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    return NextResponse.json({ 
      history: [],
      error: 'Failed to fetch price history' 
    });
  }
}
