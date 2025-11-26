'use client';

import { PriceDiscovery } from './PriceDiscovery';
import { AgentCockpit } from './AgentCockpit';
import { AlphaCard } from './AlphaCard';
import { useAgentStore } from '@/stores/agent-store';

export function MainStage() {
  const { activeGroupedMarket, alphaSignal, agentState } = useAgentStore();

  return (
    <div className="h-full flex flex-col relative">
      {/* Mode A: Price Discovery (Top Half) */}
      <section className="flex-1 min-h-0 border-b border-border p-4">
        <PriceDiscovery market={activeGroupedMarket} />
      </section>

      {/* Mode B: Agent Cockpit (Bottom Half) */}
      <section className="flex-1 min-h-0 p-4">
        <AgentCockpit />
      </section>

      {/* Alpha Card Overlay */}
      {alphaSignal && agentState === 'completed' && (
        <AlphaCard signal={alphaSignal} />
      )}
    </div>
  );
}

