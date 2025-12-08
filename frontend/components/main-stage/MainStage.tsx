'use client';

import { PriceDiscovery } from './PriceDiscovery';
import { AgentCockpit } from './AgentCockpit';
import { AlphaCard } from './AlphaCard';
import { useAgentStore } from '@/stores/agent-store';
import { Gauge, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MainStageProps {
  isCockpitCollapsed?: boolean;
  onCockpitCollapseToggle?: () => void;
}

export function MainStage({ isCockpitCollapsed = false, onCockpitCollapseToggle }: MainStageProps) {
  const { activeGroupedMarket, activePlatform, alphaSignal, agentState } = useAgentStore();

  return (
    <div className="h-full flex flex-col relative">
      {/* Mode A: Price Discovery (Top - expands when cockpit collapsed) */}
      <section className={cn(
        "min-h-0 border-b border-border p-4 transition-all duration-300 ease-in-out",
        isCockpitCollapsed ? "flex-1" : "flex-[1]"
      )}>
        <PriceDiscovery market={activeGroupedMarket} activePlatform={activePlatform} />
      </section>

      {/* Mode B: Agent Cockpit (Bottom - collapsible) */}
      <section className={cn(
        "relative transition-all duration-300 ease-in-out overflow-hidden",
        isCockpitCollapsed ? "h-12" : "flex-[1] min-h-0 p-4"
      )}>
        {/* Collapse/Expand Bar */}
        <button
          onClick={onCockpitCollapseToggle}
          className={cn(
            "absolute top-0 left-0 right-0 h-12 flex items-center justify-center gap-2",
            "bg-card/50 hover:bg-card/80 border-b border-border/50 transition-colors",
            "text-muted-foreground hover:text-foreground cursor-pointer z-10",
            !isCockpitCollapsed && "border-b-0"
          )}
        >
          <Gauge className="h-4 w-4 text-accent" />
          <span className="text-xs font-medium">Agent Cockpit</span>
          {isCockpitCollapsed ? (
            <ChevronUp className="h-4 w-4 ml-2" />
          ) : (
            <ChevronDown className="h-4 w-4 ml-2" />
          )}
          <span className="text-[10px] text-muted-foreground ml-auto mr-4">
            {isCockpitCollapsed ? 'Click to expand' : 'Click to collapse'}
          </span>
        </button>

        {/* Cockpit Content */}
        <div className={cn(
          "h-full pt-12 transition-opacity duration-200",
          isCockpitCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
        )}>
          {!isCockpitCollapsed && <AgentCockpit />}
        </div>
      </section>

      {/* Alpha Card Overlay */}
      {alphaSignal && agentState === 'completed' && (
        <AlphaCard signal={alphaSignal} />
      )}
    </div>
  );
}
