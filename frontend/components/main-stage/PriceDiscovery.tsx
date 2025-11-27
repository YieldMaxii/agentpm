'use client';

import { GroupedMarket } from '@/lib/types';
import { AreaChart, Card } from '@tremor/react';
import { Activity, Calendar, DollarSign, Droplets, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState, useCallback } from 'react';

interface PriceDiscoveryProps {
  market: GroupedMarket | null;
}

// Timeframe options for the chart
type Timeframe = '1D' | '1W' | '1M' | 'ALL';

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: 'ALL', label: 'All' },
];

// Vibrant color palette matching Polymarket style
const OUTCOME_COLORS = [
  '#22c55e', // green (leading option)
  '#3b82f6', // blue
  '#f59e0b', // amber/orange
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#06b6d4', // cyan
] as const;

const TREMOR_COLORS = ['green', 'blue', 'amber', 'pink', 'violet', 'cyan'] as const;

interface PriceHistoryPoint {
  timestamp: number;
  price: number;
  date: string;
}

interface PriceHistoryData {
  [outcomeTitle: string]: PriceHistoryPoint[];
}

export function PriceDiscovery({ market }: PriceDiscoveryProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [priceHistory, setPriceHistory] = useState<PriceHistoryData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track which outcomes are visible on the chart (all visible by default)
  const [hiddenOutcomes, setHiddenOutcomes] = useState<Set<string>>(new Set());
  
  // Toggle outcome visibility
  const toggleOutcome = useCallback((outcomeTitle: string) => {
    setHiddenOutcomes(prev => {
      const next = new Set(prev);
      if (next.has(outcomeTitle)) {
        next.delete(outcomeTitle);
      } else {
        next.add(outcomeTitle);
      }
      return next;
    });
  }, []);
  
  // Fetch historical price data for all outcomes
  const fetchPriceHistory = useCallback(async (market: GroupedMarket, tf: Timeframe) => {
    const outcomes = market.outcomes.slice(0, 6);
    const historyData: PriceHistoryData = {};
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch history for each outcome that has a clobTokenId
      const fetchPromises = outcomes.map(async (outcome) => {
        const tokenId = outcome.clobTokenIds?.[0];
        if (!tokenId) {
          console.log(`No token ID for outcome: ${outcome.title}`);
          return { title: outcome.title, history: [] };
        }
        
        try {
          const response = await fetch(`/api/markets/history?tokenId=${encodeURIComponent(tokenId)}&timeframe=${tf}`);
          if (!response.ok) {
            console.error(`Failed to fetch history for ${outcome.title}`);
            return { title: outcome.title, history: [] };
          }
          
          const data = await response.json();
          return { title: outcome.title, history: data.history || [] };
        } catch (err) {
          console.error(`Error fetching history for ${outcome.title}:`, err);
          return { title: outcome.title, history: [] };
        }
      });
      
      const results = await Promise.all(fetchPromises);
      
      results.forEach(({ title, history }) => {
        historyData[title] = history;
      });
      
      setPriceHistory(historyData);
    } catch (err) {
      console.error('Error fetching price history:', err);
      setError('Failed to load price history');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Fetch data when market or timeframe changes
  useEffect(() => {
    if (market) {
      fetchPriceHistory(market, timeframe);
    }
  }, [market, timeframe, fetchPriceHistory]);
  
  // Reset hidden outcomes when market changes
  useEffect(() => {
    setHiddenOutcomes(new Set());
  }, [market?.eventId]);
  
  // Generate chart data from real or simulated data
  const { chartData, maxY } = useMemo(() => {
    if (!market) return { chartData: [], maxY: 100 };
    
    const outcomes = market.outcomes.slice(0, 6);
    
    // Check if we have real data for at least one outcome
    const hasRealData = outcomes.some(o => priceHistory[o.title]?.length > 0);
    
    if (hasRealData) {
      return generateChartFromRealData(outcomes, priceHistory, timeframe);
    } else {
      // Fallback to simulated data
      return generateSimulatedChartData(market, timeframe);
    }
  }, [market, priceHistory, timeframe]);

  if (!market) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Select a market from the scanner to view odds
          </p>
        </div>
      </div>
    );
  }

  const outcomes = market.outcomes.slice(0, 6);
  
  // Filter outcomes for chart based on visibility
  const visibleOutcomes = outcomes.filter(o => !hiddenOutcomes.has(o.title));
  const visibleOutcomeNames = visibleOutcomes.map(o => o.title);
  
  // Build colors array maintaining original indices for consistency
  const visibleColors = outcomes
    .map((o, idx) => hiddenOutcomes.has(o.title) ? null : TREMOR_COLORS[idx])
    .filter((c): c is typeof TREMOR_COLORS[number] => c !== null);

  return (
    <div className="h-full flex flex-col">
      {/* Market Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate pr-4">{market.eventTitle}</h2>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {market.endDate ? new Date(market.endDate).toLocaleDateString() : 'N/A'}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              ${formatNumber(market.totalVolume24h)} Vol
            </span>
            <span className="flex items-center gap-1">
              <Droplets className="h-3 w-3" />
              ${formatNumber(market.totalLiquidity || 0)} Liq
            </span>
          </div>
        </div>
      </div>

      {/* Polymarket-style Legend & Timeframe Selector */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {outcomes.map((outcome, idx) => {
            const odds = outcome.odds * 100;
            const displayOdds = odds < 1 ? '<1' : odds.toFixed(0);
            const isHidden = hiddenOutcomes.has(outcome.title);
            return (
              <button
                key={outcome.id}
                onClick={() => toggleOutcome(outcome.title)}
                className={cn(
                  "flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-all",
                  "hover:bg-secondary/50 cursor-pointer",
                  isHidden && "opacity-40"
                )}
                title={isHidden ? `Show ${outcome.title} on chart` : `Hide ${outcome.title} from chart`}
              >
                <span 
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-all",
                    isHidden && "ring-1 ring-muted-foreground"
                  )}
                  style={{ 
                    backgroundColor: isHidden ? 'transparent' : OUTCOME_COLORS[idx],
                    borderColor: OUTCOME_COLORS[idx],
                  }}
                />
                <span className={cn(
                  "text-xs transition-colors",
                  isHidden ? "text-muted-foreground/50 line-through" : "text-muted-foreground"
                )}>
                  {outcome.title}
                </span>
                <span 
                  className={cn(
                    "text-xs font-semibold transition-colors",
                    isHidden && "opacity-50"
                  )} 
                  style={{ color: OUTCOME_COLORS[idx] }}
                >
                  {displayOdds}%
                </span>
              </button>
            );
          })}
        </div>
        
        {/* Timeframe Selector */}
        <div className="flex items-center gap-0.5 bg-secondary/50 rounded-md p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={cn(
                'px-2 py-1 text-[10px] font-medium rounded transition-colors',
                timeframe === tf.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Multi-Outcome Chart */}
      <Card className="flex-[2] min-h-0 bg-card/50 border-border p-2 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {error && (
          <div className="absolute top-2 left-2 text-xs text-yellow-500 flex items-center gap-1">
            <span>⚠️ Using simulated data</span>
          </div>
        )}
        <div className="h-full">
          <AreaChart
            className="h-full"
            data={chartData}
            index="time"
            categories={visibleOutcomeNames}
            colors={visibleColors as unknown as string[]}
            valueFormatter={(value) => `${value.toFixed(0)}%`}
            showLegend={false}
            showGridLines={true}
            showAnimation={false}
            curveType="monotone"
            yAxisWidth={45}
            minValue={0}
            maxValue={Math.ceil(maxY / 10) * 10}
            connectNulls={true}
            customTooltip={({ payload, active, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-popover/95 backdrop-blur border border-border rounded-lg p-2.5 shadow-xl">
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">{label}</p>
                  {payload.map((item, idx) => {
                    const itemData = item as { name?: string; value?: number; color?: string };
                    return (
                      <div key={itemData.name || idx} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: itemData.color }}
                          />
                          <span className="text-muted-foreground">{itemData.name}</span>
                        </span>
                        <span className="font-mono font-semibold">
                          {typeof itemData.value === 'number' ? itemData.value.toFixed(1) : '—'}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
        </div>
      </Card>

      {/* Outcomes Table */}
      <div className="flex-1 min-h-0 mt-2 overflow-auto">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-0.5 text-xs">
          {/* Header */}
          <div className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide pb-1"></div>
          <div className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide pb-1">Outcome</div>
          <div className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide text-right pb-1">% Chance</div>
          <div className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide text-right pb-1">Volume</div>
          
          {/* Outcome rows - clickable to toggle chart visibility */}
          {outcomes.map((outcome, idx) => {
            const odds = outcome.odds * 100;
            const displayOdds = odds < 1 ? '<1' : odds.toFixed(0);
            const isHidden = hiddenOutcomes.has(outcome.title);
            
            return (
              <div 
                key={outcome.id} 
                className={cn(
                  "contents group cursor-pointer",
                  isHidden && "opacity-40"
                )}
                onClick={() => toggleOutcome(outcome.title)}
                title={isHidden ? `Show ${outcome.title} on chart` : `Hide ${outcome.title} from chart`}
              >
                <div className="flex items-center py-1.5 border-t border-border/30 group-first:border-t-0 group-hover:bg-secondary/30">
                  <span 
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      isHidden && "ring-1 ring-muted-foreground"
                    )}
                    style={{ 
                      backgroundColor: isHidden ? 'transparent' : OUTCOME_COLORS[idx],
                    }}
                  />
                </div>
                <div className={cn(
                  "py-1.5 truncate border-t border-border/30 group-first:border-t-0 group-hover:bg-secondary/30 transition-colors",
                  isHidden ? "text-muted-foreground line-through" : "text-foreground"
                )}>
                  {outcome.title}
                </div>
                <div className={cn(
                  'py-1.5 font-mono font-bold text-right tabular-nums text-sm border-t border-border/30 group-first:border-t-0 group-hover:bg-secondary/30 transition-colors',
                  isHidden ? 'text-muted-foreground' : odds >= 50 ? 'text-primary' : odds >= 20 ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {displayOdds}%
                </div>
                <div className="py-1.5 font-mono text-muted-foreground text-right tabular-nums border-t border-border/30 group-first:border-t-0 group-hover:bg-secondary/30 transition-colors">
                  ${formatNumber(outcome.volume24h)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Timeframe formatting configuration
const TIMEFRAME_FORMAT: Record<Timeframe, (date: Date) => string> = {
  '1D': (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  '1W': (date) => date.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', hour12: true }),
  '1M': (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  'ALL': (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
};

interface OutcomeInfo {
  title: string;
  odds: number;
  clobTokenIds?: string[];
}

function generateChartFromRealData(
  outcomes: OutcomeInfo[], 
  priceHistory: PriceHistoryData,
  timeframe: Timeframe
): { chartData: Record<string, string | number>[]; maxY: number } {
  
  // Collect all unique timestamps across all outcomes
  const allTimestamps = new Set<number>();
  outcomes.forEach(outcome => {
    const history = priceHistory[outcome.title] || [];
    history.forEach(point => allTimestamps.add(point.timestamp));
  });
  
  // Sort timestamps
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
  
  if (sortedTimestamps.length === 0) {
    // No real data, return empty
    return { chartData: [], maxY: 100 };
  }
  
  // Subsample if we have too many points (keep around 50-100 for performance)
  let timestamps = sortedTimestamps;
  if (sortedTimestamps.length > 100) {
    const step = Math.floor(sortedTimestamps.length / 80);
    timestamps = sortedTimestamps.filter((_, i) => i % step === 0 || i === sortedTimestamps.length - 1);
  }
  
  const formatTime = TIMEFRAME_FORMAT[timeframe];
  let maxY = 0;
  
  const chartData: Record<string, string | number>[] = timestamps.map(timestamp => {
    const date = new Date(timestamp * 1000);
    const point: Record<string, string | number> = {
      time: formatTime(date),
    };
    
    outcomes.forEach(outcome => {
      const history = priceHistory[outcome.title] || [];
      
      // Find the closest price point to this timestamp
      let price = outcome.odds; // fallback to current odds
      
      // Binary search or linear search for closest timestamp
      for (let i = 0; i < history.length; i++) {
        if (history[i].timestamp <= timestamp) {
          price = history[i].price;
        } else {
          break;
        }
      }
      
      // If no data before this timestamp, use the first available
      if (history.length > 0 && history[0].timestamp > timestamp) {
        price = history[0].price;
      }
      
      const odds = price * 100;
      point[outcome.title] = Number(odds.toFixed(1));
      maxY = Math.max(maxY, odds);
    });
    
    return point;
  });
  
  // Ensure maxY has some padding
  maxY = Math.max(maxY * 1.1, 20);
  
  return { chartData, maxY };
}

// Timeframe configuration for simulated chart data
const SIMULATED_TIMEFRAME_CONFIG: Record<Timeframe, { 
  numPoints: number; 
  intervalMinutes: number; 
  formatTime: (date: Date) => string;
  volatilityScale: number;
  trendVariance: number;
}> = {
  '1D': {
    numPoints: 48,
    intervalMinutes: 30,
    formatTime: (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    volatilityScale: 1,
    trendVariance: 30,
  },
  '1W': {
    numPoints: 42,
    intervalMinutes: 60 * 4,
    formatTime: (date) => date.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', hour12: true }),
    volatilityScale: 1.5,
    trendVariance: 40,
  },
  '1M': {
    numPoints: 30,
    intervalMinutes: 60 * 24,
    formatTime: (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    volatilityScale: 2,
    trendVariance: 50,
  },
  'ALL': {
    numPoints: 52,
    intervalMinutes: 60 * 24 * 7,
    formatTime: (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    volatilityScale: 3,
    trendVariance: 60,
  },
};

function generateSimulatedChartData(market: GroupedMarket, timeframe: Timeframe): { chartData: Record<string, string | number>[]; maxY: number } {
  const data: Record<string, string | number>[] = [];
  const outcomes = market.outcomes.slice(0, 6);
  const config = SIMULATED_TIMEFRAME_CONFIG[timeframe];
  
  let maxY = 0;
  
  const { numPoints, intervalMinutes, formatTime, volatilityScale, trendVariance } = config;
  
  let seed = hashCode(market.eventId + timeframe);
  const seededRandom = () => {
    seed++;
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  const outcomeData = outcomes.map((outcome) => {
    const currentOdds = outcome.odds * 100;
    const startingOdds = Math.max(1, Math.min(99, currentOdds + (seededRandom() - 0.5) * trendVariance));
    return {
      title: outcome.title,
      currentOdds,
      startingOdds,
      trendPerPoint: (currentOdds - startingOdds) / numPoints,
      phaseOffset: seededRandom() * Math.PI * 2,
    };
  });
  
  for (let i = 0; i < numPoints; i++) {
    const time = new Date();
    time.setMinutes(time.getMinutes() - (numPoints - i) * intervalMinutes);
    
    const point: Record<string, string | number> = {
      time: formatTime(time),
    };
    
    outcomeData.forEach(({ title, startingOdds, trendPerPoint, currentOdds, phaseOffset }) => {
      let odds = startingOdds + (trendPerPoint * i);
      
      const volatilityFactor = 1 - (i / numPoints) * 0.7;
      const noise = (Math.sin(i * 0.3 + phaseOffset) * 5 + Math.cos(i * 0.7 + phaseOffset) * 3) * volatilityFactor * volatilityScale;
      const randomNoise = (seededRandom() - 0.5) * 4 * volatilityFactor * volatilityScale;
      
      odds = odds + noise + randomNoise;
      
      if (i === numPoints - 1) {
        odds = currentOdds;
      }
      
      odds = Math.max(0.5, Math.min(99.5, odds));
      
      point[title] = Number(odds.toFixed(1));
      maxY = Math.max(maxY, odds);
    });
    
    data.push(point);
  }
  
  maxY = Math.max(maxY * 1.1, 20);
  
  return { chartData: data, maxY };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toFixed(0);
}
