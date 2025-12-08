'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { EventGroup } from './EventGroup';
import { FilterPanel } from './FilterPanel';
import { useAgentStore } from '@/stores/agent-store';
import { Search, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { cn } from '@/lib/utils';

interface MarketScannerProps {
  isCollapsed?: boolean;
}

export function MarketScanner({ isCollapsed = false }: MarketScannerProps) {
  const { 
    groupedMarkets,
    allGroupedMarkets,
    activeGroupedMarket,
    setActiveGroupedMarket,
    activePlatform,
    setActivePlatform,
    isSearching,
    searchMarkets,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters
  } = useAgentStore();
  
  // Calculate platform stats
  const platformStats = useMemo(() => {
    const polymarket = groupedMarkets.filter(m => m.platforms?.includes('polymarket')).length;
    const kalshi = groupedMarkets.filter(m => m.platforms?.includes('kalshi')).length;
    const crossPlatform = groupedMarkets.filter(m => (m.platforms?.length || 0) > 1).length;
    return { polymarket, kalshi, crossPlatform };
  }, [groupedMarkets]);
  
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounced search function
  const debouncedSearch = useDebouncedCallback(
    (query: string) => {
      setSearchQuery(query);
      searchMarkets(query);
      setHasSearched(true);
    },
    300 // Reduced from 500ms for faster response
  );

  // Handle input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalQuery(value);
    debouncedSearch(value);
  };

  // Manual refresh
  const handleRefresh = () => {
    searchMarkets(localQuery);
    setHasSearched(true);
  };

  // Handle filter changes
  const handleFiltersChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    // Re-fetch if we're toggling resolved markets and have no search query
    if (newFilters.showResolved !== filters.showResolved && !localQuery) {
      searchMarkets('');
    }
  };

  // Initial load - fetch trending markets
  useEffect(() => {
    if (!hasSearched && groupedMarkets.length === 0) {
      searchMarkets('');
      setHasSearched(true);
    }
  }, [hasSearched, groupedMarkets.length, searchMarkets]);

  // Collapsed state - show minimal UI
  // Collapsed state (kept for compatibility)
  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-4">
        <div className="text-[10px] text-muted-foreground font-mono">
          {groupedMarkets.length}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Scanner Search & Stats */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground font-mono">
            {isSearching ? (
              <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
            ) : null}
            {groupedMarkets.length} events
          </span>
          {platformStats.crossPlatform > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
              {platformStats.crossPlatform} cross-platform
            </span>
          )}
        </div>
        
        {/* Search Input */}
        <div className="relative flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search markets..."
              value={localQuery}
              onChange={handleSearchChange}
              className="w-full h-8 pl-8 pr-3 text-xs bg-secondary/50 border border-border rounded-md 
                         placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={isSearching}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border 
                       hover:bg-secondary/50 disabled:opacity-50 transition-colors"
            title="Refresh markets"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${isSearching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {/* Filter Panel */}
        <FilterPanel
          filters={filters}
          onFiltersChange={handleFiltersChange}
          totalCount={allGroupedMarkets.length}
          filteredCount={groupedMarkets.length}
        />
      </div>

      {/* Column Headers */}
      <div className={cn(
        "grid gap-1 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50",
        "grid-cols-[16px_1fr_36px_48px]"
      )}>
        <span></span>
        <span>Event</span>
        <span className="text-right">Odds</span>
        <span className="text-right">Vol</span>
      </div>

      {/* Market List */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {isSearching ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
              <p className="text-xs text-muted-foreground">Searching Polymarket & Kalshi...</p>
            </div>
          ) : groupedMarkets.length > 0 ? (
            groupedMarkets.map((event) => (
              <EventGroup
                key={event.eventId}
                event={event}
                isActive={activeGroupedMarket?.eventId === event.eventId}
                activePlatform={activeGroupedMarket?.eventId === event.eventId ? activePlatform : null}
                onSelectEvent={setActiveGroupedMarket}
                onSelectPlatform={setActivePlatform}
              />
            ))
          ) : hasSearched ? (
            <div className="p-8 text-center">
              <Search className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground mb-1">
                {localQuery ? `No markets found for "${localQuery}"` : 'No markets available'}
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Try a different search term
              </p>
            </div>
          ) : (
            <div className="p-8 text-center">
              <Search className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">
                Search for prediction markets
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Scanner Footer */}
      <div className="p-3 border-t border-border bg-card/50">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span>PM: {platformStats.polymarket}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>KL: {platformStats.kalshi}</span>
            </span>
            {platformStats.crossPlatform > 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Both: {platformStats.crossPlatform}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-live" />
            <span>LIVE</span>
          </div>
        </div>
        <div className="text-[9px] text-muted-foreground/60">
          Sources: Polymarket + Kalshi
        </div>
      </div>
    </div>
  );
}
