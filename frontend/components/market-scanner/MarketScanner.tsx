'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { EventGroup } from './EventGroup';
import { FilterPanel } from './FilterPanel';
import { useAgentStore } from '@/stores/agent-store';
import { Search, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
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
    isSearching,
    searchMarkets,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters
  } = useAgentStore();
  
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounced search function
  const debouncedSearch = useDebouncedCallback(
    (query: string) => {
      setSearchQuery(query);
      searchMarkets(query);
      setHasSearched(true);
    },
    500
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
  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col items-center py-4">
        <TrendingUp className="h-5 w-5 text-primary mb-2" />
        <div className="writing-mode-vertical text-xs font-medium text-muted-foreground rotate-180" 
             style={{ writingMode: 'vertical-rl' }}>
          Market Scanner
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground font-mono">
          {groupedMarkets.length}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Scanner Header */}
      <div className="p-3 border-b border-border pr-12">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Market Scanner</h2>
          <span className="ml-auto text-xs text-muted-foreground font-mono">
            {isSearching ? (
              <Loader2 className="h-3 w-3 animate-spin inline" />
            ) : (
              `${groupedMarkets.length} EVENTS`
            )}
          </span>
        </div>
        
        {/* Search Input */}
        <div className="relative flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search Polymarket..."
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
              <p className="text-xs text-muted-foreground">Searching Polymarket...</p>
            </div>
          ) : groupedMarkets.length > 0 ? (
            groupedMarkets.map((event) => (
              <EventGroup
                key={event.eventId}
                event={event}
                isActive={activeGroupedMarket?.eventId === event.eventId}
                onSelectEvent={setActiveGroupedMarket}
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
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Source: Polymarket</span>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-live" />
            <span>LIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
