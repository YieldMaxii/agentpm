'use client';

import { useAgentStore } from '@/stores/agent-store';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { 
  Brain, 
  Gauge, 
  Zap, 
  Database, 
  MessageSquare,
  StopCircle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataSource } from '@/lib/types';

const DATA_SOURCES: { id: DataSource; label: string; icon: React.ReactNode }[] = [
  { id: 'perplexity', label: 'Perplexity', icon: <Brain className="h-3 w-3" /> },
  { id: 'twitter', label: 'Twitter/X', icon: <MessageSquare className="h-3 w-3" /> },
  { id: 'news', label: 'News', icon: <Database className="h-3 w-3" /> },
  { id: 'onchain', label: 'On-Chain', icon: <Database className="h-3 w-3" /> },
];

export function AgentCockpit() {
  const { 
    config, 
    updateConfig, 
    activeMarket, 
    agentState,
    startAgent,
    stopAgent 
  } = useAgentStore();

  const logicValue = config.logic === 'first_principles' ? 0 : config.logic === 'balanced' ? 50 : 100;
  const riskValue = 
    config.risk === 'conservative' ? 0 : 
    config.risk === 'standard' ? 33 : 
    config.risk === 'aggressive' ? 66 : 100;

  const handleLogicChange = (value: number[]) => {
    const v = value[0];
    const logic = v < 33 ? 'first_principles' : v < 66 ? 'balanced' : 'contrarian';
    updateConfig({ logic });
  };

  const handleRiskChange = (value: number[]) => {
    const v = value[0];
    const risk = v < 25 ? 'conservative' : v < 50 ? 'standard' : v < 75 ? 'aggressive' : 'degen';
    updateConfig({ risk });
  };

  const toggleSource = (source: DataSource) => {
    const sources = config.sources.includes(source)
      ? config.sources.filter(s => s !== source)
      : [...config.sources, source];
    updateConfig({ sources });
  };

  const isRunning = agentState === 'running' || agentState === 'awaiting_input';

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="h-4 w-4 text-accent" />
        <h3 className="font-semibold text-sm">Agent Cockpit</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          Configure analysis parameters
        </span>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* Left Column: Dials */}
        <div className="space-y-4">
          {/* Logic Dial */}
          <Card className="p-4 bg-card/50 border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium">Logic Mode</span>
              <span className="text-[10px] font-mono text-accent">
                {config.logic.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <Slider
              value={[logicValue]}
              onValueChange={handleLogicChange}
              max={100}
              step={1}
              className="mb-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>First Principles</span>
              <span>Contrarian</span>
            </div>
          </Card>

          {/* Risk Dial */}
          <Card className="p-4 bg-card/50 border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium">Risk Tolerance</span>
              <span className={cn(
                "text-[10px] font-mono",
                config.risk === 'conservative' && 'text-blue-400',
                config.risk === 'standard' && 'text-green-400',
                config.risk === 'aggressive' && 'text-amber-400',
                config.risk === 'degen' && 'text-red-400',
              )}>
                {config.risk.toUpperCase()}
              </span>
            </div>
            <div className="relative">
              <Slider
                value={[riskValue]}
                onValueChange={handleRiskChange}
                max={100}
                step={1}
                className="mb-2"
              />
              {/* Color gradient overlay hint */}
              <div className="absolute inset-x-0 h-1 top-[9px] -z-10 rounded-full bg-gradient-to-r from-blue-500 via-green-500 via-amber-500 to-red-500 opacity-20" />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Conservative</span>
              <span>Degen</span>
            </div>
          </Card>
        </div>

        {/* Right Column: Sources & Directives */}
        <div className="space-y-4">
          {/* Data Sources */}
          <Card className="p-4 bg-card/50 border-border">
            <span className="text-xs font-medium block mb-3">Data Sources</span>
            <div className="grid grid-cols-2 gap-2">
              {DATA_SOURCES.map((source) => (
                <label
                  key={source.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                    "hover:bg-secondary/50",
                    config.sources.includes(source.id) && "bg-secondary/80"
                  )}
                >
                  <Checkbox
                    checked={config.sources.includes(source.id)}
                    onCheckedChange={() => toggleSource(source.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="flex items-center gap-1.5 text-xs">
                    {source.icon}
                    {source.label}
                  </span>
                </label>
              ))}
            </div>
          </Card>

          {/* Custom Directives */}
          <Card className="p-4 bg-card/50 border-border flex-1">
            <span className="text-xs font-medium block mb-2">Custom Directives</span>
            <Textarea
              placeholder="e.g., 'Ignore any news from CNBC' or 'Focus on regulatory factors'"
              value={config.directives}
              onChange={(e) => updateConfig({ directives: e.target.value })}
              className="h-16 text-xs resize-none bg-secondary/30 border-border"
            />
          </Card>
        </div>
      </div>

      {/* VERIFY Button */}
      <div className="mt-4 pt-4 border-t border-border">
        {isRunning ? (
          <Button
            onClick={stopAgent}
            variant="destructive"
            size="lg"
            className="w-full h-12 font-semibold"
          >
            <StopCircle className="mr-2 h-5 w-5" />
            ABORT ANALYSIS
          </Button>
        ) : (
          <Button
            onClick={() => startAgent()}
            disabled={!activeMarket}
            size="lg"
            className={cn(
              "w-full h-12 font-semibold text-lg transition-all duration-300",
              "bg-primary hover:bg-primary/90",
              activeMarket && "btn-glow"
            )}
          >
            <Zap className="mr-2 h-5 w-5" />
            VERIFY ALPHA
          </Button>
        )}
        
        {!activeMarket && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            Select a market from the scanner to begin analysis
          </p>
        )}
      </div>
    </div>
  );
}

