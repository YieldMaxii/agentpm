'use client';

import { ReactNode } from 'react';
import { Minimize2, Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLayoutStore, PanelType } from '@/stores/layout-store';

interface DraggablePanelProps {
  id: string;
  title: string;
  type: PanelType;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  showControls?: boolean;
  isMinimized?: boolean;
}


export function DraggablePanel({
  id,
  title,
  type,
  icon,
  children,
  className,
  headerClassName,
  showControls = true,
  isMinimized = false,
}: DraggablePanelProps) {
  const { togglePanelVisibility, togglePanelMinimized } = useLayoutStore();

  return (
    <div 
      className={cn(
        "h-full flex flex-col bg-card/50 backdrop-blur-sm border border-border rounded-lg overflow-hidden",
        className
      )}
    >
      {/* Panel Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 bg-card/80 border-b border-border select-none",
          headerClassName
        )}
      >
        {/* Panel Icon & Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {icon && (
            <span className="shrink-0 text-muted-foreground">
              {icon}
            </span>
          )}
          <span className="text-sm font-medium truncate">{title}</span>
        </div>
        
        {/* Control Buttons */}
        {showControls && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePanelMinimized(id);
              }}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title={isMinimized ? "Maximize" : "Minimize"}
            >
              {isMinimized ? (
                <Maximize2 className="h-3.5 w-3.5" />
              ) : (
                <Minimize2 className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePanelVisibility(id);
              }}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
              title="Hide panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      
      {/* Panel Content */}
      <div className={cn(
        "flex-1 min-h-0 overflow-hidden transition-all duration-200",
        isMinimized && "hidden"
      )}>
        {children}
      </div>
      
      {/* Minimized placeholder */}
      {isMinimized && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground/50 text-xs">
          Click maximize to expand
        </div>
      )}
    </div>
  );
}
