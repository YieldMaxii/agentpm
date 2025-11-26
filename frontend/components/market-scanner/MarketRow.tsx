'use client';

import { NormalizedMarket } from '@/lib/types';
import { TrafficLight } from './TrafficLight';
import { cn } from '@/lib/utils';

interface MarketRowProps {
  market: NormalizedMarket;
  isActive: boolean;
  onClick: () => void;
}

export function MarketRow({ market, isActive, onClick }: MarketRowProps) {
  const odds = market.normalizedOdds.polymarket * 100;
  const volume = formatVolume(market.volume24h);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full grid grid-cols-[auto_1fr_60px_70px] gap-2 items-center px-2 py-2 rounded-md',
        'text-left transition-colors duration-150',
        'hover:bg-secondary/50',
        isActive && 'bg-secondary/80 ring-1 ring-primary/30'
      )}
    >
      {/* Traffic Light Indicator */}
      <TrafficLight hasArbitrage={market.hasArbitrage} />

      {/* Event Title */}
      <span className="text-xs font-medium truncate pr-2">
        {market.title}
      </span>

      {/* Odds */}
      <span className={cn(
        'text-xs font-mono font-semibold text-right tabular-nums',
        odds >= 50 ? 'text-primary' : 'text-muted-foreground'
      )}>
        {odds.toFixed(1)}%
      </span>

      {/* Volume */}
      <span className="text-[10px] font-mono text-muted-foreground text-right tabular-nums">
        ${volume}
      </span>
    </button>
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

