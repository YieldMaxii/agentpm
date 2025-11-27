'use client';

import { MarketScanner } from '@/components/market-scanner/MarketScanner';
import { MainStage } from '@/components/main-stage/MainStage';
import { GlassBox } from '@/components/glass-box/GlassBox';
import { Clock } from '@/components/Clock';
import { Activity, Zap, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Min/max widths for resizable panels
const SCANNER_MIN_WIDTH = 280;
const SCANNER_MAX_WIDTH = 600;
const SCANNER_DEFAULT_WIDTH = 420;
const SCANNER_COLLAPSED_WIDTH = 48;

const GLASSBOX_MIN_WIDTH = 280;
const GLASSBOX_MAX_WIDTH = 500;
const GLASSBOX_DEFAULT_WIDTH = 380;
const GLASSBOX_COLLAPSED_WIDTH = 48;

export default function TerminalPage() {
  const [isScannerCollapsed, setIsScannerCollapsed] = useState(false);
  const [isGlassBoxCollapsed, setIsGlassBoxCollapsed] = useState(false);
  const [isCockpitCollapsed, setIsCockpitCollapsed] = useState(false);
  
  // Resizable widths
  const [scannerWidth, setScannerWidth] = useState(SCANNER_DEFAULT_WIDTH);
  const [glassBoxWidth, setGlassBoxWidth] = useState(GLASSBOX_DEFAULT_WIDTH);
  
  // Drag state
  const [isResizingScanner, setIsResizingScanner] = useState(false);
  const [isResizingGlassBox, setIsResizingGlassBox] = useState(false);
  
  // Refs for tracking
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle scanner resize
  const handleScannerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingScanner(true);
  }, []);

  // Handle glass box resize
  const handleGlassBoxMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingGlassBox(true);
  }, []);

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      if (isResizingScanner && !isScannerCollapsed) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        setScannerWidth(Math.max(SCANNER_MIN_WIDTH, Math.min(SCANNER_MAX_WIDTH, newWidth)));
      }
      
      if (isResizingGlassBox && !isGlassBoxCollapsed) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;
        setGlassBoxWidth(Math.max(GLASSBOX_MIN_WIDTH, Math.min(GLASSBOX_MAX_WIDTH, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingScanner(false);
      setIsResizingGlassBox(false);
    };

    if (isResizingScanner || isResizingGlassBox) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingScanner, isResizingGlassBox, isScannerCollapsed, isGlassBoxCollapsed]);

  // Calculate grid template columns
  const getGridCols = () => {
    const leftWidth = isScannerCollapsed ? SCANNER_COLLAPSED_WIDTH : scannerWidth;
    const rightWidth = isGlassBoxCollapsed ? GLASSBOX_COLLAPSED_WIDTH : glassBoxWidth;
    return `${leftWidth}px 1fr ${rightWidth}px`;
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-background" ref={containerRef}>
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
        className="h-[calc(100vh-48px)] grid gap-0"
        style={{ 
          gridTemplateColumns: getGridCols(),
          transition: (isResizingScanner || isResizingGlassBox) ? 'none' : 'grid-template-columns 300ms ease-in-out'
        }}
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
          
          {/* Resize Handle - Right edge */}
          {!isScannerCollapsed && (
            <div
              onMouseDown={handleScannerMouseDown}
              className={cn(
                "absolute top-0 right-0 w-1 h-full cursor-col-resize z-30",
                "hover:bg-primary/50 active:bg-primary transition-colors",
                isResizingScanner && "bg-primary"
              )}
              title="Drag to resize"
            />
          )}
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
          {/* Resize Handle - Left edge */}
          {!isGlassBoxCollapsed && (
            <div
              onMouseDown={handleGlassBoxMouseDown}
              className={cn(
                "absolute top-0 left-0 w-1 h-full cursor-col-resize z-30",
                "hover:bg-primary/50 active:bg-primary transition-colors",
                isResizingGlassBox && "bg-primary"
              )}
              title="Drag to resize"
            />
          )}
          
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
