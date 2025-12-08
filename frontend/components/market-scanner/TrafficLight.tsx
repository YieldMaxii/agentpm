'use client';

import { cn } from '@/lib/utils';

interface TrafficLightProps {
  hasArbitrage: boolean;
}

export function TrafficLight({ hasArbitrage }: TrafficLightProps) {
  return (
    <div
      className={cn(
        'h-2 w-2 rounded-full flex-shrink-0',
        hasArbitrage 
          ? 'bg-primary shadow-[0_0_6px_hsl(var(--primary))]' 
          : 'bg-muted-foreground/30'
      )}
      title={hasArbitrage ? 'Arbitrage opportunity detected' : 'Stable'}
    />
  );
}

