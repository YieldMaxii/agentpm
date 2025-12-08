'use client';

import { useState } from 'react';
import { GroupedMarket, MarketPlatform } from '@/lib/types';
import { TrafficLight } from './TrafficLight';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface EventGroupProps {
  event: GroupedMarket;
  isActive: boolean;
  activePlatform?: MarketPlatform | null;
  onSelectEvent: (event: GroupedMarket, platform?: MarketPlatform) => void;
  onSelectPlatform?: (platform: MarketPlatform) => void;
}

// Platform badge component
function PlatformBadge({ platform, size = 'sm' }: { platform: MarketPlatform; size?: 'sm' | 'xs' }) {
  const colors: Record<MarketPlatform, string> = {
    polymarket: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    kalshi: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    predictit: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    metaculus: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    manifold: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  };
  
  const labels: Record<MarketPlatform, string> = {
    polymarket: 'PM',
    kalshi: 'KL',
    predictit: 'PI',
    metaculus: 'MC',
    manifold: 'MF',
  };
  
  return (
    <span className={cn(
      'shrink-0 font-medium rounded border',
      colors[platform] || 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      size === 'sm' ? 'text-[8px] px-1 py-0.5' : 'text-[7px] px-0.5 py-px'
    )}>
      {labels[platform] || platform.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function EventGroup({ event, isActive, activePlatform, onSelectEvent, onSelectPlatform }: EventGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMultipleOutcomes = event.outcomes.length > 1;
  // Use total volume as default, falling back to 24h if total not available
  const volume = formatVolume(event.totalVolumeTotal || event.totalVolume24h);
  const isResolved = event.resolved === true;
  
  // Platform info
  const platforms = event.platforms || ['polymarket'];
  const isMultiPlatform = platforms.length > 1;
  
  // For single outcome events, show the outcome odds
  // For multi-outcome events, show the top outcome odds
  const topOutcome = event.outcomes[0];
  const displayOdds = topOutcome ? topOutcome.odds * 100 : 50;
  
  // Cross-platform odds comparison
  const crossPlatformOdds = event.crossPlatformOdds;
  const hasOddsDiff = crossPlatformOdds?.polymarket !== undefined && 
                      crossPlatformOdds?.kalshi !== undefined &&
                      Math.abs((crossPlatformOdds.polymarket || 0) - (crossPlatformOdds.kalshi || 0)) > 0.02;

  const handleClick = () => {
    // Always select the event when clicking
    onSelectEvent(event);
  };
  
  const handlePlatformSelect = (platform: MarketPlatform) => {
    onSelectEvent(event, platform);
    onSelectPlatform?.(platform);
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={cn(
      'rounded-md overflow-hidden transition-colors duration-150',
      isActive && 'ring-1 ring-primary/30 bg-secondary/50',
      isMultiPlatform && 'ring-1 ring-amber-500/20'
    )}>
      {/* Event Header */}
      <button
        onClick={handleClick}
        className={cn(
          'w-full grid gap-1 items-center px-2 py-2 text-left transition-colors duration-150',
          'hover:bg-secondary/50',
          'grid-cols-[16px_1fr_36px_48px]',
          isActive && 'bg-secondary/80',
          isResolved && 'opacity-50'
        )}
      >
        {/* Expand Icon or Traffic Light */}
        {hasMultipleOutcomes ? (
          <span 
            className="flex items-center justify-center cursor-pointer hover:bg-secondary rounded"
            onClick={handleExpandClick}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
        ) : (
          <TrafficLight hasArbitrage={event.hasArbitrage} />
        )}

        {/* Event Title */}
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium truncate">
              {event.eventTitle}
            </span>
            {/* Platform badges */}
            <div className="flex items-center gap-0.5 shrink-0">
              {platforms.map(platform => (
                <PlatformBadge key={platform} platform={platform} size="sm" />
              ))}
            </div>
            {isResolved && (
              <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                RESOLVED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasMultipleOutcomes && (
              <span className="text-[10px] text-muted-foreground">
                {event.outcomes.length} outcomes
              </span>
            )}
            {/* Cross-platform odds comparison */}
            {isMultiPlatform && crossPlatformOdds && hasOddsDiff && (
              <span className="text-[9px] text-amber-400">
                PM: {((crossPlatformOdds.polymarket || 0) * 100).toFixed(0)}% / KL: {((crossPlatformOdds.kalshi || 0) * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        {/* Odds (top outcome for multi-outcome) */}
        <span className={cn(
          'text-[10px] font-mono font-semibold text-right tabular-nums',
          displayOdds >= 50 ? 'text-primary' : 'text-muted-foreground'
        )}>
          {hasMultipleOutcomes ? '—' : `${displayOdds.toFixed(0)}%`}
        </span>

        {/* Volume */}
        <span className="text-[9px] font-mono text-muted-foreground text-right tabular-nums">
          ${volume}
        </span>
      </button>

      {/* Expanded Outcomes - Platform-grouped for cross-platform markets */}
      {isExpanded && hasMultipleOutcomes && (
        <div className="bg-secondary/30 border-t border-border/30">
          {event.platformMarkets && event.platformMarkets.length > 1 ? (
            // Cross-platform view: show each platform as a section
            <CrossPlatformOutcomes 
              platformMarkets={event.platformMarkets} 
              activePlatform={activePlatform}
              onSelectPlatform={handlePlatformSelect}
            />
          ) : (
            // Single platform view: show outcomes directly
            <SinglePlatformOutcomes outcomes={event.outcomes} isMultiPlatform={isMultiPlatform} />
          )}
        </div>
      )}
    </div>
  );
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) {
    return (volume / 1_000_000).toFixed(1) + 'M';
  }
  if (volume >= 1_000) {
    return (volume / 1_000).toFixed(1) + 'K';
  }
  return volume.toFixed(0);
}

// Component for cross-platform outcomes with platform sections
function CrossPlatformOutcomes({ platformMarkets, activePlatform, onSelectPlatform }: { 
  platformMarkets: NonNullable<GroupedMarket['platformMarkets']>;
  activePlatform?: MarketPlatform | null;
  onSelectPlatform?: (platform: MarketPlatform) => void;
}) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<MarketPlatform>>(new Set());
  
  const togglePlatform = (platform: MarketPlatform) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };
  
  const handlePlatformClick = (platform: MarketPlatform) => {
    togglePlatform(platform);
    onSelectPlatform?.(platform);
  };
  
  const platformColors: Record<MarketPlatform, string> = {
    polymarket: 'border-blue-500/50 bg-blue-500/5',
    kalshi: 'border-emerald-500/50 bg-emerald-500/5',
    predictit: 'border-purple-500/50 bg-purple-500/5',
    metaculus: 'border-orange-500/50 bg-orange-500/5',
    manifold: 'border-pink-500/50 bg-pink-500/5',
  };
  
  const activePlatformColors: Record<MarketPlatform, string> = {
    polymarket: 'border-l-4 border-l-blue-500 bg-blue-500/10',
    kalshi: 'border-l-4 border-l-emerald-500 bg-emerald-500/10',
    predictit: 'border-l-4 border-l-purple-500 bg-purple-500/10',
    metaculus: 'border-l-4 border-l-orange-500 bg-orange-500/10',
    manifold: 'border-l-4 border-l-pink-500 bg-pink-500/10',
  };
  
  return (
    <div className="divide-y divide-border/30">
      {platformMarkets.map(pm => {
        const isExpanded = expandedPlatforms.has(pm.platform);
        const isActive = activePlatform === pm.platform;
        const topOutcome = pm.outcomes[0];
        const topOdds = topOutcome ? (topOutcome.odds * 100).toFixed(0) : '—';
        
        return (
          <div key={pm.platform} className={cn(
            '', 
            isActive ? activePlatformColors[pm.platform] : platformColors[pm.platform]
          )}>
            {/* Platform Header */}
            <button
              onClick={() => handlePlatformClick(pm.platform)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 transition-colors",
                isActive && "font-medium"
              )}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              <PlatformBadge platform={pm.platform} size="sm" />
              <span className="text-[11px] text-muted-foreground truncate flex-1 text-left">
                {pm.eventTitle}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {pm.outcomes.length} outcomes
              </span>
              <span className="text-[10px] font-mono font-medium">
                Top: {topOdds}%
              </span>
              <span className="text-[9px] font-mono text-muted-foreground">
                ${formatVolume(pm.totalVolumeTotal || pm.totalVolume24h)}
              </span>
            </button>
            
            {/* Platform Outcomes */}
            {isExpanded && (
              <div className="pl-6 pb-2">
                {pm.outcomes.slice(0, 6).map((outcome, idx) => {
                  const outcomeOdds = outcome.odds * 100;
                  const outcomeVolume = formatVolume(outcome.volumeTotal || outcome.volume24h);
                  const colors = ['bg-emerald-500', 'bg-amber-500', 'bg-cyan-500', 'bg-violet-500', 'bg-rose-500', 'bg-blue-500'];
                  
                  return (
                    <div
                      key={outcome.id}
                      className="grid grid-cols-[12px_1fr_36px_48px] gap-1 items-center px-2 py-1"
                    >
                      <span className={cn('w-2 h-2 rounded-full', colors[idx % colors.length])} />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {outcome.title}
                      </span>
                      <span className={cn(
                        'text-[10px] font-mono text-right',
                        outcomeOdds >= 50 ? 'text-primary' : 'text-muted-foreground'
                      )}>
                        {outcomeOdds.toFixed(0)}%
                      </span>
                      <span className="text-[9px] font-mono text-muted-foreground/70 text-right">
                        ${outcomeVolume}
                      </span>
                    </div>
                  );
                })}
                {pm.outcomes.length > 6 && (
                  <div className="text-[9px] text-muted-foreground text-center py-1">
                    +{pm.outcomes.length - 6} more
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Component for single platform outcomes
function SinglePlatformOutcomes({ outcomes, isMultiPlatform }: { 
  outcomes: GroupedMarket['outcomes'];
  isMultiPlatform: boolean;
}) {
  const colors = ['bg-emerald-500', 'bg-amber-500', 'bg-cyan-500', 'bg-violet-500', 'bg-rose-500', 'bg-blue-500'];
  
  return (
    <>
      {outcomes.slice(0, 8).map((outcome, idx) => {
        const outcomeOdds = outcome.odds * 100;
        const outcomeVolume = formatVolume(outcome.volumeTotal || outcome.volume24h);
        const outcomePlatform = outcome.platform || 'polymarket';
        
        return (
          <div
            key={outcome.id}
            className="w-full grid grid-cols-[16px_1fr_36px_48px] gap-1 items-center px-2 py-1.5"
          >
            <span className="flex items-center justify-center">
              <span className={cn('w-2 h-2 rounded-full', colors[idx % colors.length])} />
            </span>
            <div className="flex items-center gap-1 min-w-0 pr-2">
              <span className="text-[11px] text-muted-foreground truncate">
                {outcome.title}
              </span>
              {isMultiPlatform && (
                <PlatformBadge platform={outcomePlatform} size="xs" />
              )}
            </div>
            <span className={cn(
              'text-[10px] font-mono font-medium text-right tabular-nums',
              outcomeOdds >= 50 ? 'text-primary' : 'text-muted-foreground'
            )}>
              {outcomeOdds.toFixed(0)}%
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/70 text-right tabular-nums">
              ${outcomeVolume}
            </span>
          </div>
        );
      })}
      {outcomes.length > 8 && (
        <div className="text-[10px] text-muted-foreground text-center py-1">
          +{outcomes.length - 8} more outcomes
        </div>
      )}
    </>
  );
}

