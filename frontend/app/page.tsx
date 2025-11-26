'use client';

import { MarketScanner } from '@/components/market-scanner/MarketScanner';
import { MainStage } from '@/components/main-stage/MainStage';
import { GlassBox } from '@/components/glass-box/GlassBox';
import { Clock } from '@/components/Clock';
import { Activity, Zap } from 'lucide-react';

export default function TerminalPage() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      {/* Header Bar */}
      <header className="h-12 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg tracking-tight">AgentPM</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-muted-foreground font-mono">TERMINAL v1.0</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3 w-3 text-primary pulse-live" />
            <span className="font-mono">LIVE</span>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            <Clock />
          </div>
        </div>
      </header>

      {/* Main Terminal Grid - Three Columns */}
      <main className="h-[calc(100vh-48px)] grid grid-cols-[280px_1fr_380px] gap-0">
        {/* Zone 1: Market Scanner (Left Sidebar) */}
        <aside className="border-r border-border bg-card/30 overflow-hidden">
          <MarketScanner />
        </aside>

        {/* Zone 2: Main Stage (Center) */}
        <section className="overflow-hidden bg-background">
          <MainStage />
        </section>

        {/* Zone 3: Glass Box (Right Panel) */}
        <aside className="border-l border-border bg-[hsl(220_20%_3%)] overflow-hidden">
          <GlassBox />
        </aside>
      </main>
    </div>
  );
}
