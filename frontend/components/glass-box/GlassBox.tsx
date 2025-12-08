'use client';

import { useAgentStore } from '@/stores/agent-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogLine } from './LogLine';
import { DecisionCard } from './DecisionCard';
import { Clock } from '@/components/Clock';
import { Terminal, Circle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface GlassBoxProps {
  isCollapsed?: boolean;
}

export function GlassBox({ isCollapsed = false }: GlassBoxProps) {
  const { logs, agentState, decisionPrompt } = useAgentStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  };

  const getStatusColor = () => {
    switch (agentState) {
      case 'running': return 'text-primary';
      case 'awaiting_input': return 'text-accent';
      case 'completed': return 'text-blue-400';
      case 'error': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusText = () => {
    switch (agentState) {
      case 'running': return 'PROCESSING';
      case 'awaiting_input': return 'AWAITING INPUT';
      case 'completed': return 'COMPLETE';
      case 'error': return 'ERROR';
      default: return 'IDLE';
    }
  };

  // Collapsed state - show minimal UI (kept for compatibility)
  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-4">
        <Circle className={cn(
          "h-3 w-3 fill-current mb-2",
          getStatusColor(),
          agentState === 'running' && 'pulse-live'
        )} />
        <div className={cn(
          "text-[10px] font-mono",
          getStatusColor()
        )}>
          {logs.length > 0 ? logs.length : '—'}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col font-mono">
      {/* Status Bar */}
      <div className="px-3 py-2 border-b border-border/50 bg-card/50">
        <div className="flex items-center gap-2 text-[10px]">
          <Circle className={`h-2 w-2 fill-current ${getStatusColor()} ${agentState === 'running' ? 'pulse-live' : ''}`} />
          <span className={getStatusColor()}>{getStatusText()}</span>
          {logs.length > 0 && (
            <span className="text-muted-foreground ml-auto">
              {logs.length} entries
            </span>
          )}
        </div>
      </div>

      {/* Log Stream */}
      <ScrollArea 
        className="flex-1 min-h-0" 
        ref={scrollRef}
        onScrollCapture={handleScroll}
      >
        <div className="p-3 space-y-0.5">
          {logs.length > 0 ? (
            <>
              {logs.map((log) => (
                <LogLine key={log.id} entry={log} />
              ))}
              {agentState === 'running' && (
                <div className="cursor-blink text-xs text-primary" />
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <div className="text-muted-foreground/50 text-xs mb-2">
                {'>'} Agent logs will appear here
              </div>
              <div className="text-muted-foreground/30 text-[10px]">
                Select a market and click VERIFY ALPHA to start
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Decision Card (Self-Correction Prompt) */}
      {decisionPrompt && (
        <div className="border-t border-border/50">
          <DecisionCard prompt={decisionPrompt} />
        </div>
      )}

      {/* Glass Box Footer */}
      <div className="p-2 border-t border-border/50 bg-[hsl(220_20%_5%)]">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>WebSocket: {agentState !== 'idle' ? 'Connected' : 'Standby'}</span>
          <span className="font-mono">
            <Clock />
          </span>
        </div>
      </div>
    </div>
  );
}
