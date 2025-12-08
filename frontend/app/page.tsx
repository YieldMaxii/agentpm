'use client';

import { DraggableLayout } from '@/components/layout/DraggableLayout';
import { LayoutToolbar } from '@/components/layout/LayoutToolbar';
import { Clock } from '@/components/Clock';
import { Activity, Zap } from 'lucide-react';

export default function TerminalPage() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      {/* Header Bar */}
      <header className="h-12 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 relative z-[200]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg tracking-tight">AgentPM</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-muted-foreground font-mono">TERMINAL v1.0</span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Layout Controls */}
          <LayoutToolbar />
          
          <div className="h-4 w-px bg-border" />
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3 w-3 text-primary pulse-live" />
            <span className="font-mono">LIVE</span>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            <Clock />
          </div>
        </div>
      </header>

      {/* Main Draggable Layout Grid */}
      <main className="h-[calc(100vh-48px)] w-full overflow-hidden">
        <DraggableLayout className="h-full w-full" />
      </main>
    </div>
  );
}
