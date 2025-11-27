'use client';

import { MarketScanner } from '@/components/market-scanner/MarketScanner';
import { MainStage } from '@/components/main-stage/MainStage';
import { GlassBox } from '@/components/glass-box/GlassBox';
import { Clock } from '@/components/Clock';
import { Activity, Zap, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function TerminalPage() {
  const [isScannerCollapsed, setIsScannerCollapsed] = useState(false);
  const [isGlassBoxCollapsed, setIsGlassBoxCollapsed] = useState(false);
  const [isCockpitCollapsed, setIsCockpitCollapsed] = useState(false);

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

      {/* Main Terminal Grid - Responsive Three Columns */}
      <main 
        className={cn(
          "h-[calc(100vh-48px)] grid gap-0 transition-all duration-300 ease-in-out",
          isScannerCollapsed && isGlassBoxCollapsed && "grid-cols-[48px_1fr_48px]",
          isScannerCollapsed && !isGlassBoxCollapsed && "grid-cols-[48px_1fr_380px]",
          !isScannerCollapsed && isGlassBoxCollapsed && "grid-cols-[420px_1fr_48px]",
          !isScannerCollapsed && !isGlassBoxCollapsed && "grid-cols-[420px_1fr_380px]"
        )}
      >
        {/* Zone 1: Market Scanner (Left Sidebar) */}
        <aside className="border-r border-border bg-card/30 overflow-hidden relative">
          {/* Collapse/Expand Button */}
          <button
            onClick={() => setIsScannerCollapsed(!isScannerCollapsed)}
            className={cn(
              "absolute top-3 z-20 h-7 w-7 flex items-center justify-center rounded-md",
              "bg-secondary/80 hover:bg-secondary border border-border",
              "text-muted-foreground hover:text-foreground transition-all duration-200",
              isScannerCollapsed ? "right-2.5" : "right-3"
            )}
            title={isScannerCollapsed ? "Expand scanner" : "Collapse scanner"}
          >
            {isScannerCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          
          <MarketScanner isCollapsed={isScannerCollapsed} />
        </aside>

        {/* Zone 2: Main Stage (Center) */}
        <section className="overflow-hidden bg-background">
          <MainStage 
            isCockpitCollapsed={isCockpitCollapsed}
            onCockpitCollapseToggle={() => setIsCockpitCollapsed(!isCockpitCollapsed)}
          />
        </section>

        {/* Zone 3: Glass Box (Right Panel) */}
        <aside className="border-l border-border bg-[hsl(220_20%_3%)] overflow-hidden relative">
          {/* Collapse/Expand Button */}
          <button
            onClick={() => setIsGlassBoxCollapsed(!isGlassBoxCollapsed)}
            className={cn(
              "absolute top-3 z-20 h-7 w-7 flex items-center justify-center rounded-md",
              "bg-secondary/80 hover:bg-secondary border border-border",
              "text-muted-foreground hover:text-foreground transition-all duration-200",
              isGlassBoxCollapsed ? "left-2.5" : "left-3"
            )}
            title={isGlassBoxCollapsed ? "Expand glass box" : "Collapse glass box"}
          >
            {isGlassBoxCollapsed ? (
              <PanelRight className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
          </button>
          
          <GlassBox isCollapsed={isGlassBoxCollapsed} />
        </aside>
      </main>
    </div>
  );
}
