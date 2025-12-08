'use client';

import { useCallback, useState, useEffect, useMemo, useRef, MouseEvent as ReactMouseEvent } from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import { useLayoutStore, PanelType } from '@/stores/layout-store';
import { MarketScanner } from '@/components/market-scanner/MarketScanner';
import { PriceDiscovery } from '@/components/main-stage/PriceDiscovery';
import { ComparisonView } from './ComparisonView';
import { GlassBox } from '@/components/glass-box/GlassBox';
import { AgentCockpit } from '@/components/main-stage/AgentCockpit';
import { useAgentStore } from '@/stores/agent-store';
import { cn } from '@/lib/utils';
import { 
  Search, 
  LineChart, 
  GitCompare, 
  Terminal, 
  Gauge,
  X,
  GripHorizontal
} from 'lucide-react';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Custom resize handle component
interface CustomResizeHandleProps {
  direction: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  onResizeStart: (e: ReactMouseEvent, direction: string) => void;
}

function CustomResizeHandle({ direction, onResizeStart }: CustomResizeHandleProps) {
  const handleMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onResizeStart(e, direction);
  };

  const positionClasses = {
    n: 'top-0 left-0 right-0 h-2 cursor-ns-resize',
    s: 'bottom-0 left-0 right-0 h-2 cursor-ns-resize',
    e: 'right-0 top-0 bottom-0 w-2 cursor-ew-resize',
    w: 'left-0 top-0 bottom-0 w-2 cursor-ew-resize',
    ne: 'top-0 right-0 w-3 h-3 cursor-ne-resize',
    nw: 'top-0 left-0 w-3 h-3 cursor-nw-resize',
    se: 'bottom-0 right-0 w-3 h-3 cursor-se-resize',
    sw: 'bottom-0 left-0 w-3 h-3 cursor-sw-resize',
  };

  return (
    <div
      className={cn('absolute z-20 hover:bg-primary/20', positionClasses[direction])}
      onMouseDown={handleMouseDown}
    />
  );
}

// Panel icons mapping
const PANEL_ICONS: Record<PanelType, React.ReactNode> = {
  scanner: <Search className="h-4 w-4" />,
  chart: <LineChart className="h-4 w-4" />,
  comparison: <GitCompare className="h-4 w-4" />,
  glassbox: <Terminal className="h-4 w-4" />,
  cockpit: <Gauge className="h-4 w-4" />,
};

// Panel titles
const PANEL_TITLES: Record<PanelType, string> = {
  scanner: 'Market Scanner',
  chart: 'Price Discovery',
  comparison: 'Platform Comparison',
  glassbox: 'Glass Box',
  cockpit: 'Agent Cockpit',
};

// Default sizes for each panel type (width, height in grid units)
// Designed to fill full 24-column width and fit within 24 rows
const DEFAULT_SIZES: Record<PanelType, { w: number; h: number; minW: number; minH: number }> = {
  scanner: { w: 6, h: 16, minW: 4, minH: 6 },
  chart: { w: 9, h: 12, minW: 5, minH: 5 },
  comparison: { w: 9, h: 12, minW: 5, minH: 5 },
  glassbox: { w: 9, h: 12, minW: 4, minH: 5 },
  cockpit: { w: 9, h: 12, minW: 4, minH: 5 },
};

// Generate initial layout positions for all 5 panels
// 3-column layout: Scanner (0-6) | Chart+Comparison (6-15) | Glassbox+Cockpit (15-24)
const generateDefaultLayout = (): Layout[] => {
  return [
    { i: 'scanner', x: 0, y: 0, w: 6, h: 24, minW: 4, minH: 6 },        // Full height left column
    { i: 'chart', x: 6, y: 0, w: 9, h: 12, minW: 5, minH: 5 },          // Top middle
    { i: 'comparison', x: 6, y: 12, w: 9, h: 12, minW: 5, minH: 5 },    // Bottom middle
    { i: 'glassbox', x: 15, y: 0, w: 9, h: 12, minW: 4, minH: 5 },      // Top right
    { i: 'cockpit', x: 15, y: 12, w: 9, h: 12, minW: 4, minH: 5 },      // Bottom right
  ];
};

// Storage key for persisting layout - bump version to force fresh layout
const LAYOUT_STORAGE_KEY = 'agentpm-grid-layout-v14';

interface DraggableLayoutProps {
  className?: string;
}

export function DraggableLayout({ className }: DraggableLayoutProps) {
  const { panels, setPanelVisible } = useLayoutStore();
  const { activeGroupedMarket, activePlatform } = useAgentStore();
  
  const containerRef = useRef<HTMLDivElement>(null);
  // Initialize with window dimensions for better initial render
  const [containerSize, setContainerSize] = useState(() => {
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight - 48 };
    }
    return { width: 1920, height: 800 };
  });
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Get visible panels
  const visiblePanels = useMemo(() => 
    panels.filter(p => p.visible), 
    [panels]
  );
  
  // Grid boundaries - this is our fixed canvas
  const MAX_ROWS = 24;
  const COLS = 24;

  // Smart reflow algorithm - packs items like iOS/Android widgets
  const constrainLayoutToCanvas = useCallback((layout: Layout[]): Layout[] => {
    if (layout.length === 0) return layout;

    // Create a working copy with min sizes enforced
    let items = layout.map(item => {
      const size = DEFAULT_SIZES[item.i as PanelType];
      if (!size) return { ...item };
      
      return {
        ...item,
        w: Math.min(Math.max(item.w, size.minW), COLS),
        h: Math.max(item.h, size.minH),
        minW: size.minW,
        minH: size.minH,
      };
    });

    // First pass: ensure X positions are valid
    items = items.map(item => {
      const { w } = item;
      let { x } = item;
      // Clamp x to valid range
      x = Math.max(0, x);
      if (x + w > COLS) {
        x = Math.max(0, COLS - w);
      }
      return { ...item, x };
    });

    // Second pass: pack items vertically using column-based algorithm
    // This ensures items stack within their columns without overflow
    const packed = packItemsVertically(items, COLS, MAX_ROWS);

    // Third pass: if items still overflow, shrink heights proportionally
    const maxBottom = Math.max(...packed.map(item => item.y + item.h));
    if (maxBottom > MAX_ROWS) {
      return shrinkToFit(packed, MAX_ROWS, COLS);
    }

    return packed;
  }, []);

  // Pack items vertically within columns (like iOS widget grid)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const packItemsVertically = (items: Layout[], cols: number, _maxRows: number): Layout[] => {
    // Sort items by y position first, then by x
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    
    // Track the bottom-most point at each column
    const columnBottoms = new Array(cols).fill(0);
    
    return sorted.map(item => {
      const size = DEFAULT_SIZES[item.i as PanelType];
      const { x, h } = item;
      let { w } = item;
      
      // Ensure width doesn't exceed available columns
      if (x + w > cols) {
        w = Math.max(size?.minW || 1, cols - x);
      }
      
      // Find the lowest available Y position for this item's column span
      let minY = 0;
      for (let col = x; col < Math.min(x + w, cols); col++) {
        minY = Math.max(minY, columnBottoms[col]);
      }
      
      // Place item at the computed position
      const newY = minY;
      
      // Update column bottoms for this item's span
      for (let col = x; col < Math.min(x + w, cols); col++) {
        columnBottoms[col] = newY + h;
      }
      
      return { ...item, x, y: newY, w, h };
    });
  };

  // Shrink only overflowing items to fit within maxRows (keeps non-overflowing items at their size)
  const shrinkToFit = (items: Layout[], maxRows: number, cols: number): Layout[] => {
    // Process each column stack independently
    const columnGroups = new Map<string, Layout[]>();
    
    items.forEach(item => {
      // Find all column ranges this item belongs to
      for (let col = item.x; col < item.x + item.w; col++) {
        const key = String(col);
        if (!columnGroups.has(key)) {
          columnGroups.set(key, []);
        }
        // Only add if not already in the group
        const group = columnGroups.get(key)!;
        if (!group.find(i => i.i === item.i)) {
          group.push(item);
        }
      }
    });

    // For each column, ensure items fit within maxRows
    const adjustedItems = new Map<string, Layout>();
    
    // Initialize with original items
    items.forEach(item => adjustedItems.set(item.i, { ...item }));

    // Process each column
    columnGroups.forEach((columnItems) => {
      // Sort by Y position
      const sorted = [...columnItems].sort((a, b) => a.y - b.y);
      
      // Calculate total height in this column
      let totalHeight = 0;
      sorted.forEach(item => {
        const currentItem = adjustedItems.get(item.i)!;
        const itemBottom = currentItem.y + currentItem.h;
        totalHeight = Math.max(totalHeight, itemBottom);
      });

      // If total height exceeds maxRows, we need to shrink
      if (totalHeight > maxRows) {
        const overflow = totalHeight - maxRows;
        
        // Distribute the shrinkage among items in this column (bottom-up)
        let remainingOverflow = overflow;
        const reverseSorted = [...sorted].reverse();
        
        for (const item of reverseSorted) {
          if (remainingOverflow <= 0) break;
          
          const currentItem = adjustedItems.get(item.i)!;
          const size = DEFAULT_SIZES[item.i as PanelType];
          const minH = size?.minH || 4;
          
          // Calculate how much we can shrink this item
          const shrinkable = currentItem.h - minH;
          const shrinkAmount = Math.min(shrinkable, remainingOverflow);
          
          if (shrinkAmount > 0) {
            adjustedItems.set(item.i, {
              ...currentItem,
              h: currentItem.h - shrinkAmount
            });
            remainingOverflow -= shrinkAmount;
          }
        }
      }
    });

    // Convert back to array and do final position enforcement
    let result = Array.from(adjustedItems.values());
    
    // Final pass: ensure all items are within bounds
    result = result.map(item => {
      const size = DEFAULT_SIZES[item.i as PanelType];
      const { x } = item;
      let { y, w, h } = item;
      
      // Ensure width within bounds
      if (x + w > cols) {
        w = Math.max(size?.minW || 4, cols - x);
      }
      
      // Ensure height within bounds
      if (y + h > maxRows) {
        h = Math.max(size?.minH || 4, maxRows - y);
      }
      
      // If still overflowing (y too large), cap y position
      if (y + h > maxRows) {
        y = maxRows - h;
      }
      
      // Ensure y is not negative
      y = Math.max(0, y);
      
      return { ...item, x, y, w, h };
    });

    return result;
  };

  // Track previous visible panels to detect changes
  const prevVisiblePanelsRef = useRef<string[]>([]);

  // Load saved layouts on initial mount
  useEffect(() => {
    if (isInitialized) return; // Only run once on mount
    
    const savedLayouts = localStorage.getItem(LAYOUT_STORAGE_KEY);
    const defaultLayout = generateDefaultLayout();
    const visiblePanelTypes: string[] = visiblePanels.map(p => p.type);
    
    if (savedLayouts) {
      try {
        const parsed = JSON.parse(savedLayouts) as Layout[];
        // Filter to only visible panels and ensure min sizes
        const filteredLayouts = parsed
          .filter(l => visiblePanelTypes.includes(l.i))
          .map(l => {
            const size = DEFAULT_SIZES[l.i as PanelType];
            if (!size) return l;
            return {
              ...l,
              w: Math.max(l.w, size.minW),
              h: Math.max(l.h, size.minH),
              minW: size.minW,
              minH: size.minH,
            };
          });
        
        // Add any missing panels
        visiblePanelTypes.forEach(panelType => {
          if (!filteredLayouts.find(l => l.i === panelType)) {
            const defaultForPanel = defaultLayout.find(l => l.i === panelType);
            if (defaultForPanel) {
              filteredLayouts.push(defaultForPanel);
            }
          }
        });
        
        setLayouts(constrainLayoutToCanvas(filteredLayouts));
      } catch {
        const fallbackLayout = defaultLayout.filter(l => 
          visiblePanelTypes.includes(l.i)
        );
        setLayouts(constrainLayoutToCanvas(fallbackLayout));
      }
    } else {
      const initialLayout = defaultLayout.filter(l => 
        visiblePanelTypes.includes(l.i)
      );
      setLayouts(constrainLayoutToCanvas(initialLayout));
    }
    
    prevVisiblePanelsRef.current = visiblePanelTypes;
    setIsInitialized(true);
  }, [visiblePanels, constrainLayoutToCanvas, isInitialized]);

  // Handle container resize with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Check if two items overlap vertically (share row space)
  const itemsOverlapVertically = (a: Layout, b: Layout): boolean => {
    return !(a.y + a.h <= b.y || b.y + b.h <= a.y);
  };

  // Check if two items overlap horizontally (share column space)
  const itemsOverlapHorizontally = (a: Layout, b: Layout): boolean => {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x);
  };

  // Smart resize handler - shrinks adjacent items instead of pushing them
  const adjustLayoutForResize = useCallback((
    layout: Layout[],
    resizingItemId: string
  ): Layout[] => {
    const resizingItem = layout.find(item => item.i === resizingItemId);
    if (!resizingItem) return layout;

    const adjustedLayout = layout.map(item => {
      if (item.i === resizingItemId) return item;
      
      const size = DEFAULT_SIZES[item.i as PanelType];
      if (!size) return item;

      let { x, y, w, h } = item;
      const resizingRight = resizingItem.x + resizingItem.w;
      const resizingBottom = resizingItem.y + resizingItem.h;
      const itemRight = x + w;
      const itemBottom = y + h;

      // Check if items share vertical space (same row range)
      const sharesVerticalSpace = itemsOverlapVertically(item, resizingItem);
      
      // Check if items share horizontal space (same column range)
      const sharesHorizontalSpace = itemsOverlapHorizontally(item, resizingItem);

      // HORIZONTAL COLLISION: Resizing item expanding into this item's horizontal space
      if (sharesVerticalSpace) {
        // Case 1: Resizing item is expanding to the right into this item
        if (resizingItem.x < x && resizingRight > x) {
          // This item is to the right of the resizing item
          // Move this item's left edge to the right and shrink its width
          const newX = resizingRight;
          const newW = Math.max(size.minW, itemRight - newX);
          
          // Only adjust if we have room
          if (newX + newW <= COLS) {
            x = newX;
            w = newW;
          } else {
            // Push to the edge and shrink to fit
            x = Math.max(resizingRight, COLS - size.minW);
            w = Math.max(size.minW, COLS - x);
          }
        }
        
        // Case 2: Resizing item is expanding to the left into this item
        if (resizingItem.x < itemRight && x < resizingItem.x) {
          // This item is to the left of the resizing item
          // Shrink this item's width from the right
          const newW = Math.max(size.minW, resizingItem.x - x);
          w = newW;
        }
      }

      // VERTICAL COLLISION: Resizing item expanding into this item's vertical space
      if (sharesHorizontalSpace) {
        // Case 3: Resizing item is expanding downward into this item
        if (resizingItem.y < y && resizingBottom > y) {
          // This item is below the resizing item
          // Move this item down and shrink its height to fit
          const newY = resizingBottom;
          const availableHeight = MAX_ROWS - newY;
          const newH = Math.max(size.minH, Math.min(h, availableHeight));
          
          if (newY + newH <= MAX_ROWS) {
            y = newY;
            h = newH;
          } else {
            // Force fit at minimum height
            y = Math.max(resizingBottom, MAX_ROWS - size.minH);
            h = size.minH;
          }
        }
        
        // Case 4: Resizing item is expanding upward into this item
        if (resizingItem.y < itemBottom && y < resizingItem.y) {
          // This item is above the resizing item
          // Shrink this item's height from the bottom
          const newH = Math.max(size.minH, resizingItem.y - y);
          h = newH;
        }
      }

      // Final bounds check
      if (x + w > COLS) {
        w = Math.max(size.minW, COLS - x);
      }
      if (y + h > MAX_ROWS) {
        h = Math.max(size.minH, MAX_ROWS - y);
      }
      if (x < 0) x = 0;
      if (y < 0) y = 0;

      return { ...item, x, y, w, h };
    });

    return adjustedLayout;
  }, []);

  // Smart layout update when panels are added/removed
  const updateLayoutForVisiblePanels = useCallback((currentLayouts: Layout[], visiblePanelTypes: string[]): Layout[] => {
    const defaultLayout = generateDefaultLayout();
    
    // Remove layouts for panels that are no longer visible
    let newLayouts = currentLayouts.filter(l => visiblePanelTypes.includes(l.i));
    
    // Add layouts for newly visible panels
    visiblePanelTypes.forEach(panelType => {
      if (!newLayouts.find(l => l.i === panelType)) {
        // This panel needs to be added
        const defaultForPanel = defaultLayout.find(l => l.i === panelType);
        const size = DEFAULT_SIZES[panelType as PanelType];
        
        if (defaultForPanel && size) {
          // Use default position with reasonable size
          const newPanel: Layout = {
            i: panelType,
            x: defaultForPanel.x,
            y: defaultForPanel.y,
            w: size.w,
            h: size.h,
            minW: size.minW,
            minH: size.minH,
          };
          
          // Add the new panel and use adjustLayoutForResize to shrink others
          newLayouts.push(newPanel);
          newLayouts = adjustLayoutForResize(newLayouts, panelType);
        }
      }
    });
    
    return constrainLayoutToCanvas(newLayouts);
  }, [adjustLayoutForResize, constrainLayoutToCanvas]);

  // Handle panel visibility changes AFTER initial load
  useEffect(() => {
    if (!isInitialized) return;
    
    const currentVisibleTypes: string[] = visiblePanels.map(p => p.type);
    const prevVisibleTypes = prevVisiblePanelsRef.current;
    
    // Check if visibility actually changed
    const added = currentVisibleTypes.filter(t => !prevVisibleTypes.includes(t));
    const removed = prevVisibleTypes.filter(t => !currentVisibleTypes.includes(t));
    
    if (added.length > 0 || removed.length > 0) {
      const updatedLayouts = updateLayoutForVisiblePanels(layouts, currentVisibleTypes);
      setLayouts(updatedLayouts);
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(updatedLayouts));
    }
    
    prevVisiblePanelsRef.current = currentVisibleTypes;
  }, [visiblePanels, isInitialized, layouts, updateLayoutForVisiblePanels]);

  // Calculate row height to fill available height with 24 rows
  // MUST be defined before custom resize useEffect that uses it
  const rowHeight = useMemo(() => {
    return Math.max(20, Math.floor((containerSize.height - 32) / 24));
  }, [containerSize.height]);

  // ============ CUSTOM RESIZE HANDLING ============
  // We implement our own resize to have full control over shrinking behavior
  
  const [resizeState, setResizeState] = useState<{
    itemId: string;
    direction: string;
    startX: number;
    startY: number;
    startLayout: Layout[];
  } | null>(null);

  // Start custom resize
  const handleCustomResizeStart = useCallback((
    itemId: string,
    e: ReactMouseEvent,
    direction: string
  ) => {
    setResizeState({
      itemId,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startLayout: layouts.map(l => ({ ...l })),
    });
  }, [layouts]);

  // Handle mouse move during custom resize
  useEffect(() => {
    if (!resizeState) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const deltaX = e.clientX - resizeState.startX;
      const deltaY = e.clientY - resizeState.startY;
      
      // Convert pixel delta to grid units
      const colWidth = (containerSize.width - 12 - (COLS - 1) * 6) / COLS;
      const deltaW = Math.round(deltaX / colWidth);
      const deltaH = Math.round(deltaY / rowHeight);
      
      // Find the item being resized
      const originalItem = resizeState.startLayout.find(l => l.i === resizeState.itemId);
      if (!originalItem) return;
      
      const size = DEFAULT_SIZES[originalItem.i as PanelType];
      if (!size) return;
      
      // Calculate new dimensions based on resize direction
      let newX = originalItem.x;
      let newY = originalItem.y;
      let newW = originalItem.w;
      let newH = originalItem.h;
      
      if (resizeState.direction.includes('e')) {
        // Expanding right: increase width
        newW = Math.max(size.minW, Math.min(originalItem.w + deltaW, COLS - originalItem.x));
      }
      if (resizeState.direction.includes('w')) {
        // Expanding left: move x left and increase width
        const xChange = deltaW;
        const potentialNewX = originalItem.x + xChange;
        newX = Math.max(0, potentialNewX);
        const actualXChange = originalItem.x - newX;
        newW = Math.max(size.minW, originalItem.w + actualXChange);
      }
      if (resizeState.direction.includes('s')) {
        // Expanding down: increase height
        newH = Math.max(size.minH, Math.min(originalItem.h + deltaH, MAX_ROWS - originalItem.y));
      }
      if (resizeState.direction.includes('n')) {
        // Expanding up: move y up and increase height
        const yChange = deltaH;
        const potentialNewY = originalItem.y + yChange;
        newY = Math.max(0, potentialNewY);
        const actualYChange = originalItem.y - newY;
        newH = Math.max(size.minH, originalItem.h + actualYChange);
      }
      
      // Build new layout with resized item
      const baseLayout = resizeState.startLayout.map(item => {
        if (item.i === resizeState.itemId) {
          return { ...item, x: newX, y: newY, w: newW, h: newH };
        }
        return { ...item };
      });
      
      // Apply shrinking logic to other items
      const adjustedLayout = adjustLayoutForResize(baseLayout, resizeState.itemId);
      setLayouts(adjustedLayout);
    };

    const handleMouseUp = () => {
      // Finalize and save
      const constrainedLayout = constrainLayoutToCanvas(layouts);
      setLayouts(constrainedLayout);
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(constrainedLayout));
      setResizeState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeState, containerSize.width, rowHeight, adjustLayoutForResize, constrainLayoutToCanvas, layouts]);

  // Handle layout changes from GridLayout (only for dragging now)
  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    // Don't update during custom resize
    if (resizeState) return;
    const constrained = constrainLayoutToCanvas(newLayout);
    setLayouts(constrained);
  }, [resizeState, constrainLayoutToCanvas]);

  // Handle drag stop
  const handleDragStop = useCallback((layout: Layout[]) => {
    const constrainedLayout = constrainLayoutToCanvas(layout);
    setLayouts(constrainedLayout);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(constrainedLayout));
  }, [constrainLayoutToCanvas]);

  // Render panel content based on type
  const renderPanelContent = useCallback((type: PanelType) => {
    switch (type) {
      case 'scanner':
        return <MarketScanner isCollapsed={false} />;
      case 'chart':
        return <PriceDiscovery market={activeGroupedMarket} activePlatform={activePlatform} />;
      case 'comparison':
        return <ComparisonView />;
      case 'glassbox':
        return <GlassBox isCollapsed={false} />;
      case 'cockpit':
        return <AgentCockpit />;
      default:
        return <div>Unknown panel type</div>;
    }
  }, [activeGroupedMarket, activePlatform]);

  if (visiblePanels.length === 0) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <p className="text-muted-foreground">No panels visible. Use the Panels menu to show panels.</p>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <p className="text-muted-foreground">Loading layout...</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn("h-full w-full overflow-hidden grid-layout-container", className)}
    >
      <GridLayout
        className="layout"
        layout={layouts}
        cols={COLS}
        maxRows={MAX_ROWS}
        rowHeight={rowHeight}
        width={containerSize.width}
        onLayoutChange={handleLayoutChange}
        onDragStop={handleDragStop}
        draggableHandle=".drag-handle"
        resizeHandles={[]}
        margin={[6, 6]}
        containerPadding={[6, 6]}
        useCSSTransforms={true}
        compactType={null}
        preventCollision={false}
        isResizable={false}
        isDraggable={true}
        isBounded={true}
      >
        {visiblePanels.map((panel) => (
          <div 
            key={panel.type}
            className="grid-panel bg-card/50 backdrop-blur-sm border border-border rounded-lg overflow-hidden flex flex-col relative"
          >
            {/* Panel Header - Drag Handle */}
            <div className="drag-handle flex items-center gap-2 px-3 py-2 bg-card/80 border-b border-border cursor-grab active:cursor-grabbing select-none shrink-0">
              <GripHorizontal className="h-4 w-4 text-muted-foreground/50" />
              <span className="text-muted-foreground">
                {PANEL_ICONS[panel.type]}
              </span>
              <span className="text-sm font-medium flex-1 truncate">{PANEL_TITLES[panel.type]}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setPanelVisible(panel.type, false);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Hide panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            
            {/* Panel Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {renderPanelContent(panel.type)}
            </div>

            {/* Custom Resize Handles - All directions */}
            <CustomResizeHandle 
              direction="n" 
              onResizeStart={(e, dir) => handleCustomResizeStart(panel.type, e, dir)} 
            />
            <CustomResizeHandle 
              direction="s" 
              onResizeStart={(e, dir) => handleCustomResizeStart(panel.type, e, dir)} 
            />
            <CustomResizeHandle 
              direction="e" 
              onResizeStart={(e, dir) => handleCustomResizeStart(panel.type, e, dir)} 
            />
            <CustomResizeHandle 
              direction="w" 
              onResizeStart={(e, dir) => handleCustomResizeStart(panel.type, e, dir)} 
            />
            <CustomResizeHandle 
              direction="ne" 
              onResizeStart={(e, dir) => handleCustomResizeStart(panel.type, e, dir)} 
            />
            <CustomResizeHandle 
              direction="nw" 
              onResizeStart={(e, dir) => handleCustomResizeStart(panel.type, e, dir)} 
            />
            <CustomResizeHandle 
              direction="se" 
              onResizeStart={(e, dir) => handleCustomResizeStart(panel.type, e, dir)} 
            />
            <CustomResizeHandle 
              direction="sw" 
              onResizeStart={(e, dir) => handleCustomResizeStart(panel.type, e, dir)} 
            />
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
