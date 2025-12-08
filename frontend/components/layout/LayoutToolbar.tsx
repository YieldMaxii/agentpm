'use client';

import { useLayoutStore, PanelType } from '@/stores/layout-store';
import { 
  LayoutGrid, 
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const LAYOUT_STORAGE_KEY = 'agentpm-grid-layout-v14';

const PANEL_OPTIONS: { id: PanelType; label: string }[] = [
  { id: 'scanner', label: 'Market Scanner' },
  { id: 'chart', label: 'Price Discovery' },
  { id: 'comparison', label: 'Platform Comparison' },
  { id: 'glassbox', label: 'Glass Box' },
  { id: 'cockpit', label: 'Agent Cockpit' },
];

export function LayoutToolbar() {
  const { 
    panels, 
    togglePanelVisibility,
    showAllPanels,
  } = useLayoutStore();
  
  const [isOpen, setIsOpen] = useState(false);
  
  const visibleCount = panels.filter(p => p.visible).length;
  const allVisible = visibleCount === panels.length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm",
          "bg-secondary/50 hover:bg-secondary border border-border",
          "text-muted-foreground hover:text-foreground transition-colors"
        )}
      >
        <Layers className="h-4 w-4" />
        <span className="hidden sm:inline">Panels</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
          {visibleCount}/{panels.length}
        </span>
        <ChevronDown className={cn(
          "h-3 w-3 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>
      
      {/* Dropdown */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-[100]" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute top-full right-0 mt-1 w-52 bg-popover border border-border rounded-lg shadow-xl z-[101] py-1">
            {/* Show All Button */}
            {!allVisible && (
              <>
                <button
                  onClick={() => {
                    showAllPanels();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/50 transition-colors text-primary"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="text-sm font-medium">Show All Panels</span>
                </button>
                <div className="border-t border-border my-1" />
              </>
            )}
            
            {/* Individual Panel Toggles */}
            {PANEL_OPTIONS.map((option) => {
              const panel = panels.find(p => p.id === option.id);
              const isVisible = panel?.visible ?? true;
              
              return (
                <button
                  key={option.id}
                  onClick={() => togglePanelVisibility(option.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                >
                  {isVisible ? (
                    <Eye className="h-4 w-4 text-foreground" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={cn(
                    "text-sm flex-1",
                    isVisible ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {option.label}
                  </span>
                  {isVisible && (
                    <span className="w-2 h-2 rounded-full bg-foreground/50" />
                  )}
                </button>
              );
            })}
            
            {/* Reset Layout Button */}
            <div className="border-t border-border my-1" />
            <button
              onClick={() => {
                localStorage.removeItem(LAYOUT_STORAGE_KEY);
                showAllPanels();
                window.location.reload();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="text-sm">Reset Layout</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
