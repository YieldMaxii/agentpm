'use client';

import { GroupedMarket } from '@/lib/types';
import { AreaChart, Card } from '@tremor/react';
import { Activity, Calendar, DollarSign, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface PriceDiscoveryProps {
  market: GroupedMarket | null;
}

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

export function PriceDiscovery({ market }: PriceDiscoveryProps) {
  // Memoize chart data to prevent regeneration on every render
  const { chartData, maxY } = useMemo(() => {
    if (!market) return { chartData: [], maxY: 100 };
    return generateMultiOutcomeChartData(market);
  }, [market?.eventId, market?.outcomes?.length]);

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
  const outcomeNames = outcomes.map(o => o.title);
  const colors = TREMOR_COLORS.slice(0, outcomeNames.length);

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

      {/* Polymarket-style Legend (above chart) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
        {outcomes.map((outcome, idx) => {
          const odds = outcome.odds * 100;
          const displayOdds = odds < 1 ? '<1' : odds.toFixed(0);
          return (
            <div key={outcome.id} className="flex items-center gap-1.5">
              <span 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: OUTCOME_COLORS[idx] }}
              />
              <span className="text-xs text-muted-foreground">
                {outcome.title}
              </span>
              <span className="text-xs font-semibold" style={{ color: OUTCOME_COLORS[idx] }}>
                {displayOdds}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Multi-Outcome Chart */}
      <Card className="flex-[2] min-h-0 bg-card/50 border-border p-2">
        <div className="h-full">
          <AreaChart
            className="h-full"
            data={chartData}
            index="time"
            categories={outcomeNames}
            colors={colors as unknown as string[]}
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
          
          {/* Outcome rows */}
          {outcomes.map((outcome, idx) => {
            const odds = outcome.odds * 100;
            const displayOdds = odds < 1 ? '<1' : odds.toFixed(0);
            
            return (
              <div key={outcome.id} className="contents group">
                <div className="flex items-center py-1.5 border-t border-border/30 group-first:border-t-0">
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: OUTCOME_COLORS[idx] }}
                  />
                </div>
                <div className="py-1.5 truncate text-foreground border-t border-border/30 group-first:border-t-0">
                  {outcome.title}
                </div>
                <div className={cn(
                  'py-1.5 font-mono font-bold text-right tabular-nums text-sm border-t border-border/30 group-first:border-t-0',
                  odds >= 50 ? 'text-primary' : odds >= 20 ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {displayOdds}%
                </div>
                <div className="py-1.5 font-mono text-muted-foreground text-right tabular-nums border-t border-border/30 group-first:border-t-0">
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

function generateMultiOutcomeChartData(market: GroupedMarket): { chartData: Record<string, string | number>[]; maxY: number } {
  const data: Record<string, string | number>[] = [];
  const outcomes = market.outcomes.slice(0, 6);
  
  // Track max value for Y-axis scaling
  let maxY = 0;
  
  // Generate 24 hours of historical data
  const numPoints = 48; // More points for smoother lines
  
  // Create base odds and trend for each outcome
  const outcomeData = outcomes.map((outcome) => {
    const currentOdds = outcome.odds * 100;
    // Random historical starting point (within reasonable range of current)
    const startingOdds = Math.max(1, Math.min(99, currentOdds + (Math.random() - 0.5) * 30));
    return {
      title: outcome.title,
      currentOdds,
      startingOdds,
      // Trend direction to end near current odds
      trendPerPoint: (currentOdds - startingOdds) / numPoints,
    };
  });
  
  for (let i = 0; i < numPoints; i++) {
    const time = new Date();
    time.setMinutes(time.getMinutes() - (numPoints - i) * 30); // 30-minute intervals
    
    const point: Record<string, string | number> = {
      time: time.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }),
    };
    
    // Generate data for each outcome
    outcomeData.forEach(({ title, startingOdds, trendPerPoint, currentOdds }) => {
      // Calculate base value trending toward current odds
      let odds = startingOdds + (trendPerPoint * i);
      
      // Add some market volatility (more at the start, settling toward current)
      const volatilityFactor = 1 - (i / numPoints) * 0.7;
      const noise = (Math.sin(i * 0.3) * 5 + Math.cos(i * 0.7) * 3) * volatilityFactor;
      const randomNoise = (Math.random() - 0.5) * 4 * volatilityFactor;
      
      odds = odds + noise + randomNoise;
      
      // For the last point, use the actual current odds
      if (i === numPoints - 1) {
        odds = currentOdds;
      }
      
      // Clamp to valid range
      odds = Math.max(0.5, Math.min(99.5, odds));
      
      point[title] = Number(odds.toFixed(1));
      maxY = Math.max(maxY, odds);
    });
    
    data.push(point);
  }
  
  // Ensure maxY has some padding (at least 10% above highest point)
  maxY = Math.max(maxY * 1.1, 20);
  
  return { chartData: data, maxY };
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toFixed(0);
}
