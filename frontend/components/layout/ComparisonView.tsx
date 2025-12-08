'use client';

import { useAgentStore } from '@/stores/agent-store';
import { GroupedMarket, MarketPlatform, MarketOutcome } from '@/lib/types';
import { AreaChart, Card } from '@tremor/react';
import { cn } from '@/lib/utils';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { 
  GitCompare, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ArrowRight,
  DollarSign,
  Activity
} from 'lucide-react';

// Timeframe options
type Timeframe = '1D' | '1W' | '1M' | 'ALL';

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: 'ALL', label: 'All' },
];

// Platform colors
const PLATFORM_COLORS: Record<MarketPlatform, { bg: string; text: string; chart: string }> = {
  polymarket: { bg: 'bg-blue-500/10', text: 'text-blue-400', chart: 'blue' },
  kalshi: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', chart: 'emerald' },
  predictit: { bg: 'bg-purple-500/10', text: 'text-purple-400', chart: 'violet' },
  metaculus: { bg: 'bg-orange-500/10', text: 'text-orange-400', chart: 'amber' },
  manifold: { bg: 'bg-pink-500/10', text: 'text-pink-400', chart: 'pink' },
};

const PLATFORM_LABELS: Record<MarketPlatform, string> = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
  predictit: 'PredictIt',
  metaculus: 'Metaculus',
  manifold: 'Manifold',
};

interface PlatformChartData {
  platform: MarketPlatform;
  title: string;
  outcomes: MarketOutcome[];
  volume24h: number;
  volumeTotal: number;
}

export function ComparisonView() {
  const { activeGroupedMarket, setActivePlatform, activePlatform } = useAgentStore();
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);

  // Get platform-specific data
  const platformData = useMemo((): PlatformChartData[] => {
    if (!activeGroupedMarket) return [];
    
    // If we have platformMarkets (cross-platform grouped market)
    if (activeGroupedMarket.platformMarkets && activeGroupedMarket.platformMarkets.length > 0) {
      return activeGroupedMarket.platformMarkets.map(pm => ({
        platform: pm.platform,
        title: pm.eventTitle,
        outcomes: pm.outcomes,
        volume24h: pm.totalVolume24h,
        volumeTotal: pm.totalVolumeTotal,
      }));
    }
    
    // Otherwise, group outcomes by platform
    const byPlatform = new Map<MarketPlatform, MarketOutcome[]>();
    activeGroupedMarket.outcomes.forEach(outcome => {
      const platform = outcome.platform || 'polymarket';
      if (!byPlatform.has(platform)) {
        byPlatform.set(platform, []);
      }
      byPlatform.get(platform)!.push(outcome);
    });
    
    return Array.from(byPlatform.entries()).map(([platform, outcomes]) => ({
      platform,
      title: activeGroupedMarket.eventTitle,
      outcomes,
      volume24h: outcomes.reduce((sum, o) => sum + o.volume24h, 0),
      volumeTotal: outcomes.reduce((sum, o) => sum + o.volumeTotal, 0),
    }));
  }, [activeGroupedMarket]);

  // Find matching outcomes across platforms
  const outcomeComparison = useMemo(() => {
    if (platformData.length < 2) return [];
    
    // Use first platform as reference
    const reference = platformData[0];
    
    return reference.outcomes.slice(0, 6).map(refOutcome => {
      const comparison: { 
        title: string; 
        platforms: { platform: MarketPlatform; odds: number; volume: number }[] 
      } = {
        title: refOutcome.title,
        platforms: [{
          platform: reference.platform,
          odds: refOutcome.odds,
          volume: refOutcome.volume24h,
        }],
      };
      
      // Find matching outcomes in other platforms
      platformData.slice(1).forEach(pd => {
        // Try to find a matching outcome (fuzzy match on title)
        const match = pd.outcomes.find(o => 
          normalizeTitle(o.title) === normalizeTitle(refOutcome.title) ||
          o.title.toLowerCase().includes(refOutcome.title.toLowerCase().slice(0, 10)) ||
          refOutcome.title.toLowerCase().includes(o.title.toLowerCase().slice(0, 10))
        );
        
        if (match) {
          comparison.platforms.push({
            platform: pd.platform,
            odds: match.odds,
            volume: match.volume24h,
          });
        }
      });
      
      return comparison;
    });
  }, [platformData]);

  // Reset selected outcome when market changes
  useEffect(() => {
    setSelectedOutcome(null);
  }, [activeGroupedMarket?.eventId]);

  if (!activeGroupedMarket) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <GitCompare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            Platform Comparison
          </p>
          <p className="text-xs text-muted-foreground/70">
            Select a cross-platform market to compare odds
          </p>
        </div>
      </div>
    );
  }

  if (platformData.length < 2) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <GitCompare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            Single Platform Market
          </p>
          <p className="text-xs text-muted-foreground/70">
            This market is only available on {PLATFORM_LABELS[platformData[0]?.platform || 'polymarket']}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GitCompare className="h-4 w-4 text-purple-400 shrink-0" />
          <h3 className="text-sm font-medium truncate">{activeGroupedMarket.eventTitle}</h3>
        </div>
        
        {/* Timeframe Selector */}
        <div className="flex items-center gap-0.5 bg-secondary/50 rounded-md p-0.5 shrink-0">
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

      {/* Platform Charts Side by Side */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 mb-3">
        {platformData.slice(0, 2).map((pd) => (
          <PlatformChart
            key={pd.platform}
            data={pd}
            timeframe={timeframe}
            isActive={activePlatform === pd.platform}
            onClick={() => setActivePlatform(pd.platform)}
            selectedOutcome={selectedOutcome}
          />
        ))}
      </div>

      {/* Comparison Table */}
      <div className="flex-shrink-0 max-h-[40%] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card/95 backdrop-blur z-10">
            <tr className="border-b border-border/50">
              <th className="text-left py-2 px-2 font-medium text-muted-foreground">Outcome</th>
              {platformData.slice(0, 2).map((pd) => (
                <th 
                  key={pd.platform} 
                  className={cn(
                    "text-right py-2 px-2 font-medium whitespace-nowrap",
                    PLATFORM_COLORS[pd.platform].text
                  )}
                >
                  {PLATFORM_LABELS[pd.platform]}
                </th>
              ))}
              <th className="text-right py-2 px-2 font-medium text-muted-foreground">Diff</th>
            </tr>
          </thead>
          <tbody>
            {outcomeComparison.map((comparison, idx) => {
              const odds1 = comparison.platforms[0]?.odds ?? 0;
              const odds2 = comparison.platforms[1]?.odds ?? 0;
              const diff = (odds1 - odds2) * 100;
              const absDiff = Math.abs(diff);
              
              return (
                <tr 
                  key={idx}
                  onClick={() => setSelectedOutcome(
                    selectedOutcome === comparison.title ? null : comparison.title
                  )}
                  className={cn(
                    "border-b border-border/30 cursor-pointer transition-colors",
                    "hover:bg-secondary/30",
                    selectedOutcome === comparison.title && "bg-secondary/50"
                  )}
                >
                  <td className="py-2 px-2">
                    <span className="block truncate" title={comparison.title}>
                      {comparison.title}
                    </span>
                  </td>
                  {platformData.slice(0, 2).map((pd) => {
                    const platformOdds = comparison.platforms.find(p => p.platform === pd.platform);
                    return (
                      <td 
                        key={pd.platform}
                        className="py-2 px-2 text-right font-mono whitespace-nowrap"
                      >
                        {platformOdds ? `${(platformOdds.odds * 100).toFixed(1)}%` : '—'}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                    <span className={cn(
                      "inline-flex items-center gap-0.5",
                      absDiff >= 5 ? "text-amber-400" : 
                      absDiff >= 2 ? "text-blue-400" : 
                      "text-muted-foreground"
                    )}>
                      {absDiff >= 0.1 ? (
                        <>
                          {diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {absDiff.toFixed(1)}%
                        </>
                      ) : (
                        <Minus className="h-3 w-3" />
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Arbitrage Alert */}
      {activeGroupedMarket.hasArbitrage && (
        <div className="mt-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-amber-400">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium">Potential Arbitrage Detected</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Platform Chart Sub-component
interface PlatformChartProps {
  data: PlatformChartData;
  timeframe: Timeframe;
  isActive: boolean;
  onClick: () => void;
  selectedOutcome: string | null;
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

function PlatformChart({ data, timeframe, isActive, onClick, selectedOutcome }: PlatformChartProps) {
  const colors = PLATFORM_COLORS[data.platform];
  
  // Get top 6 outcomes
  const chartOutcomes = data.outcomes.slice(0, 6);
  
  // Generate chart data for all 6 outcomes
  const chartData = useMemo(() => {
    const numPoints = timeframe === '1D' ? 24 : timeframe === '1W' ? 7 : timeframe === '1M' ? 30 : 52;
    
    return Array.from({ length: numPoints }, (_, i) => {
      const point: Record<string, string | number> = {
        time: formatTimeLabel(i, numPoints, timeframe),
      };
      
      chartOutcomes.forEach((outcome) => {
        // Simple simulated movement - in production, fetch real data
        const base = outcome.odds * 100;
        const variance = Math.sin(i * 0.5 + hashCode(outcome.title)) * 5;
        point[outcome.title] = Math.max(0, Math.min(100, base + variance * (1 - i / numPoints)));
      });
      
      return point;
    });
  }, [chartOutcomes, timeframe]);

  const outcomeNames = chartOutcomes.map(o => o.title);
  
  // Filter to selected outcome or show all
  const displayedOutcomes = selectedOutcome 
    ? chartOutcomes.filter(o => o.title === selectedOutcome)
    : chartOutcomes;
  const displayedNames = displayedOutcomes.map(o => o.title);
  
  // Get colors for displayed outcomes (maintain original color mapping)
  const displayedColors = displayedOutcomes.map(o => {
    const idx = chartOutcomes.findIndex(co => co.title === o.title);
    return TREMOR_COLORS[idx] || 'gray';
  });

  return (
    <Card 
      onClick={onClick}
      className={cn(
        "p-3 cursor-pointer transition-all flex flex-col overflow-hidden",
        colors.bg,
        isActive && "ring-2 ring-primary"
      )}
    >
      {/* Platform Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-semibold", colors.text)}>
            {PLATFORM_LABELS[data.platform]}
          </span>
          {isActive && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          {formatNumber(data.volume24h)}
        </div>
      </div>

      {/* Chart - flexible height */}
      <div className="flex-1 min-h-[80px] mb-2">
        <AreaChart
          className="h-full"
          data={chartData}
          index="time"
          categories={displayedNames}
          colors={displayedColors as unknown as string[]}
          showLegend={false}
          showGridLines={false}
          showYAxis={false}
          showXAxis={false}
          curveType="monotone"
          showAnimation={false}
          stack={false}
          minValue={0}
          maxValue={100}
        />
      </div>

      {/* Outcome Legend - Top 6 with overflow scroll */}
      <div className="overflow-y-auto flex-shrink-0" style={{ maxHeight: '40%' }}>
        {chartOutcomes.map((outcome, idx) => {
          const odds = outcome.odds * 100;
          const displayOdds = odds < 1 ? '<1' : odds.toFixed(0);
          const isSelected = selectedOutcome === outcome.title;
          
          return (
            <div 
              key={outcome.id}
              className={cn(
                "flex items-center gap-1.5 text-xs py-0.5",
                isSelected && "bg-secondary/50 -mx-1 px-1 rounded"
              )}
            >
              <span 
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: OUTCOME_COLORS[idx] }}
              />
              <span className="truncate text-muted-foreground flex-1 min-w-0">{outcome.title}</span>
              <span 
                className="font-mono font-semibold shrink-0"
                style={{ color: OUTCOME_COLORS[idx] }}
              >
                {displayOdds}%
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Helper functions
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toFixed(0);
}

function formatTimeLabel(index: number, total: number, timeframe: Timeframe): string {
  if (timeframe === '1D') {
    const hour = (24 - (total - index)) % 24;
    return `${hour}:00`;
  }
  if (timeframe === '1W') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[(new Date().getDay() - (total - index - 1) + 7) % 7];
  }
  return `${index + 1}`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}
