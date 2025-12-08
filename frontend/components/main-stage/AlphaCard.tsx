'use client';

import { AlphaSignal, SignalType } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAgentStore } from '@/stores/agent-store';
import { X, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface AlphaCardProps {
  signal: AlphaSignal;
}

const SIGNAL_CONFIG: Record<SignalType, { color: string; icon: React.ReactNode; label: string }> = {
  STRONG_BUY: { 
    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', 
    icon: <TrendingUp className="h-6 w-6" />,
    label: 'STRONG BUY'
  },
  BUY: { 
    color: 'text-green-400 bg-green-400/10 border-green-400/30', 
    icon: <TrendingUp className="h-6 w-6" />,
    label: 'BUY'
  },
  HOLD: { 
    color: 'text-gray-400 bg-gray-400/10 border-gray-400/30', 
    icon: <Minus className="h-6 w-6" />,
    label: 'HOLD'
  },
  SELL: { 
    color: 'text-orange-400 bg-orange-400/10 border-orange-400/30', 
    icon: <TrendingDown className="h-6 w-6" />,
    label: 'SELL'
  },
  STRONG_SELL: { 
    color: 'text-red-400 bg-red-400/10 border-red-400/30', 
    icon: <TrendingDown className="h-6 w-6" />,
    label: 'STRONG SELL'
  },
};

export function AlphaCard({ signal }: AlphaCardProps) {
  const { clearAlphaSignal } = useAgentStore();
  const [expanded, setExpanded] = useState(false);
  
  const config = SIGNAL_CONFIG[signal.signal];
  const edgeDisplay = signal.edge >= 0 ? `+${signal.edge.toFixed(1)}%` : `${signal.edge.toFixed(1)}%`;

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8 z-50">
      <Card className={cn(
        "w-full max-w-lg border-2 shadow-2xl",
        config.color
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", config.color)}>
              {config.icon}
            </div>
            <div>
              <Badge variant="outline" className={cn("font-mono text-lg px-3 py-1", config.color)}>
                {config.label}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={clearAlphaSignal}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          <h3 className="font-semibold text-lg mb-4 line-clamp-2">
            {signal.marketTitle}
          </h3>

          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className={cn("text-2xl font-mono font-bold", 
                signal.edge >= 0 ? 'text-primary' : 'text-destructive'
              )}>
                {edgeDisplay}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Edge
              </div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-mono font-bold">
                {(signal.fairValue * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Fair Value
              </div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-mono font-bold">
                {(signal.marketOdds * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                Market Odds
              </div>
            </div>
          </div>

          {/* Confidence Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Model Confidence</span>
              <span className="font-mono">{(signal.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${signal.confidence * 100}%` }}
              />
            </div>
          </div>

          {/* Expandable Analysis */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors"
          >
            <span className="text-sm font-medium">View Full Analysis</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expanded && (
            <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
              {/* Factor Breakdown */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Factor Analysis
                </h4>
                <div className="space-y-2">
                  {signal.factors.map((factor, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <div className="w-24 truncate text-muted-foreground">{factor.name}</div>
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full",
                            factor.score > 0 ? 'bg-primary' : 'bg-destructive'
                          )}
                          style={{ 
                            width: `${Math.abs(factor.score) * 10}%`,
                            marginLeft: factor.score < 0 ? 'auto' : 0
                          }}
                        />
                      </div>
                      <div className="w-12 text-right font-mono">
                        {factor.score > 0 ? '+' : ''}{factor.score.toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reasoning */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Reasoning
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {signal.reasoning}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-4">
          <Button 
            onClick={clearAlphaSignal}
            className="w-full"
            variant="outline"
          >
            Dismiss
          </Button>
        </div>
      </Card>
    </div>
  );
}

