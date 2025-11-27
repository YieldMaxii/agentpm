'use client';

import { useState } from 'react';
import { GroupedMarket } from '@/lib/types';
import { TrafficLight } from './TrafficLight';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface EventGroupProps {
  event: GroupedMarket;
  isActive: boolean;
  onSelectEvent: (event: GroupedMarket) => void;
}

export function EventGroup({ event, isActive, onSelectEvent }: EventGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMultipleOutcomes = event.outcomes.length > 1;
  const volume = formatVolume(event.totalVolume24h);
  const isResolved = event.resolved === true;
  
  // For single outcome events, show the outcome odds
  // For multi-outcome events, show the top outcome odds
  const topOutcome = event.outcomes[0];
  const displayOdds = topOutcome ? topOutcome.odds * 100 : 50;

  const handleClick = () => {
    // Always select the event when clicking
    onSelectEvent(event);
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={cn(
      'rounded-md overflow-hidden transition-colors duration-150',
      isActive && 'ring-1 ring-primary/30 bg-secondary/50'
    )}>
      {/* Event Header */}
      <button
        onClick={handleClick}
        className={cn(
          'w-full grid gap-2 items-center px-2 py-2 text-left transition-colors duration-150',
          'hover:bg-secondary/50',
          'grid-cols-[16px_1fr_70px_80px]',
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
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">
              {event.eventTitle}
            </span>
            {isResolved && (
              <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                RESOLVED
              </span>
            )}
          </div>
          {hasMultipleOutcomes && (
            <span className="text-[10px] text-muted-foreground">
              {event.outcomes.length} outcomes
            </span>
          )}
        </div>

        {/* Odds (top outcome for multi-outcome) */}
        <span className={cn(
          'text-xs font-mono font-semibold text-right tabular-nums',
          displayOdds >= 50 ? 'text-primary' : 'text-muted-foreground'
        )}>
          {hasMultipleOutcomes ? '—' : `${displayOdds.toFixed(1)}%`}
        </span>

        {/* Volume */}
        <span className="text-[10px] font-mono text-muted-foreground text-right tabular-nums">
          ${volume}
        </span>
      </button>

      {/* Expanded Outcomes (read-only preview) */}
      {isExpanded && hasMultipleOutcomes && (
        <div className="bg-secondary/30 border-t border-border/30">
          {event.outcomes.slice(0, 6).map((outcome, idx) => {
            const outcomeOdds = outcome.odds * 100;
            const outcomeVolume = formatVolume(outcome.volume24h);
            // Assign colors to match the chart
            const colors = ['bg-emerald-500', 'bg-amber-500', 'bg-cyan-500', 'bg-violet-500', 'bg-rose-500', 'bg-blue-500'];
            
            return (
              <div
                key={outcome.id}
                className="w-full grid grid-cols-[16px_1fr_60px_70px] gap-2 items-center px-2 py-1.5"
              >
                {/* Color indicator */}
                <span className="flex items-center justify-center">
                  <span className={cn('w-2 h-2 rounded-full', colors[idx % colors.length])} />
                </span>

                {/* Outcome Title */}
                <span className="text-[11px] text-muted-foreground truncate pr-2">
                  {outcome.title}
                </span>

                {/* Odds */}
                <span className={cn(
                  'text-[11px] font-mono font-medium text-right tabular-nums',
                  outcomeOdds >= 50 ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {outcomeOdds.toFixed(1)}%
                </span>

                {/* Volume */}
                <span className="text-[10px] font-mono text-muted-foreground/70 text-right tabular-nums">
                  ${outcomeVolume}
                </span>
              </div>
            );
          })}
          {event.outcomes.length > 6 && (
            <div className="text-[10px] text-muted-foreground text-center py-1">
              +{event.outcomes.length - 6} more outcomes
            </div>
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

