'use client';

import { useState } from 'react';
import { ChevronDown, Filter, X, TrendingUp, Clock, Timer, Droplets, SortAsc } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarketPlatform } from '@/lib/types';

// Main categories that match Polymarket's structure
export const MARKET_CATEGORIES = [
  { slug: 'all', label: 'All Markets', icon: '🌐' },
  { slug: 'politics', label: 'Politics', icon: '🏛️' },
  { slug: 'crypto', label: 'Crypto', icon: '₿' },
  { slug: 'sports', label: 'Sports', icon: '⚽' },
  { slug: 'ai', label: 'AI', icon: '🤖' },
  { slug: 'business', label: 'Business', icon: '💼' },
  { slug: 'finance', label: 'Finance', icon: '📈' },
  { slug: 'science', label: 'Science', icon: '🔬' },
  { slug: 'pop-culture', label: 'Culture', icon: '🎬' },
  { slug: 'geopolitics', label: 'World', icon: '🌍' },
] as const;

// Sort options
export const SORT_OPTIONS = [
  { value: 'trending', label: 'Trending', icon: TrendingUp, description: 'Most active (24h volume)' },
  { value: 'newest', label: 'Newest', icon: Clock, description: 'Recently created' },
  { value: 'ending-soon', label: 'Ending Soon', icon: Timer, description: 'Closing soonest' },
  { value: 'liquidity', label: 'Liquidity', icon: Droplets, description: 'Most liquid markets' },
  { value: 'alphabetical', label: 'A-Z', icon: SortAsc, description: 'Alphabetical order' },
] as const;

// Available platforms for multi-select
export const AVAILABLE_PLATFORMS: { value: MarketPlatform; label: string; color: string }[] = [
  { value: 'polymarket', label: 'Polymarket', color: 'bg-blue-500' },
  { value: 'kalshi', label: 'Kalshi', color: 'bg-emerald-500' },
  // Future platforms can be added here:
  // { value: 'predictit', label: 'PredictIt', color: 'bg-orange-500' },
  // { value: 'metaculus', label: 'Metaculus', color: 'bg-cyan-500' },
  // { value: 'manifold', label: 'Manifold', color: 'bg-pink-500' },
];

export type CategorySlug = typeof MARKET_CATEGORIES[number]['slug'];
export type SortOption = typeof SORT_OPTIONS[number]['value'];

export interface MarketFilters {
  showResolved: boolean;
  category: CategorySlug;
  sortBy: SortOption;
  selectedPlatforms: MarketPlatform[]; // Empty array = all platforms
  crossPlatformOnly: boolean; // Only show markets available on multiple selected platforms
}

interface FilterPanelProps {
  filters: MarketFilters;
  onFiltersChange: (filters: MarketFilters) => void;
  totalCount: number;
  filteredCount: number;
}

export function FilterPanel({ filters, onFiltersChange, totalCount, filteredCount }: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const activeCategory = MARKET_CATEGORIES.find(c => c.slug === filters.category) || MARKET_CATEGORIES[0];
  const activeSort = SORT_OPTIONS.find(s => s.value === filters.sortBy) || SORT_OPTIONS[0];
  
  // Determine platform filter state
  const selectedPlatforms = filters.selectedPlatforms || [];
  const allPlatformsSelected = selectedPlatforms.length === 0;
  const hasActiveFilters = filters.showResolved || 
    filters.category !== 'all' || 
    filters.sortBy !== 'trending' || 
    selectedPlatforms.length > 0 ||
    filters.crossPlatformOnly;

  // Toggle a platform in the selection
  const togglePlatform = (platform: MarketPlatform) => {
    const current = selectedPlatforms;
    const isSelected = current.includes(platform);
    
    let newSelected: MarketPlatform[];
    if (isSelected) {
      // Remove platform
      newSelected = current.filter(p => p !== platform);
    } else {
      // Add platform
      newSelected = [...current, platform];
    }
    
    // If all platforms are selected, treat as "all" (empty array)
    if (newSelected.length === AVAILABLE_PLATFORMS.length) {
      newSelected = [];
    }
    
    onFiltersChange({ 
      ...filters, 
      selectedPlatforms: newSelected,
      // Disable crossPlatformOnly if less than 2 platforms selected
      crossPlatformOnly: newSelected.length >= 2 ? filters.crossPlatformOnly : false
    });
  };

  // Get platform label for display
  const getPlatformLabel = () => {
    if (filters.crossPlatformOnly) {
      return 'Cross-Platform';
    }
    if (allPlatformsSelected) {
      return null;
    }
    if (selectedPlatforms.length === 1) {
      const platform = AVAILABLE_PLATFORMS.find(p => p.value === selectedPlatforms[0]);
      return platform?.label || selectedPlatforms[0];
    }
    return `${selectedPlatforms.length} Platforms`;
  };

  const platformLabel = getPlatformLabel();

  return (
    <div className="relative">
      {/* Filter Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors',
          'border border-border hover:bg-secondary/50',
          hasActiveFilters && 'border-primary/50 bg-primary/10',
          isOpen && 'bg-secondary'
        )}
      >
        <Filter className="h-3 w-3" />
        <span className="font-medium">{activeCategory.icon} {activeCategory.label}</span>
        {platformLabel && (
          <span className={cn(
            'ml-1 px-1 py-0.5 text-[9px] rounded',
            filters.crossPlatformOnly && 'bg-purple-500/20 text-purple-400',
            !filters.crossPlatformOnly && selectedPlatforms.length === 1 && selectedPlatforms[0] === 'polymarket' && 'bg-blue-500/20 text-blue-400',
            !filters.crossPlatformOnly && selectedPlatforms.length === 1 && selectedPlatforms[0] === 'kalshi' && 'bg-emerald-500/20 text-emerald-400',
            !filters.crossPlatformOnly && selectedPlatforms.length > 1 && 'bg-gray-500/20 text-gray-400'
          )}>
            {platformLabel}
          </span>
        )}
        {filters.sortBy !== 'trending' && (
          <span className="ml-1 px-1 py-0.5 text-[9px] bg-secondary text-muted-foreground rounded">
            {activeSort.label}
          </span>
        )}
        {filters.showResolved && (
          <span className="ml-1 px-1 py-0.5 text-[9px] bg-amber-500/20 text-amber-400 rounded">
            +Resolved
          </span>
        )}
        <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Filter Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
              <span className="text-xs font-semibold">Filter & Sort Markets</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-0.5 hover:bg-secondary rounded"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* Platform Filter */}
            <div className="p-2">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                Platforms
              </div>
              <div className="space-y-1">
                {/* All Platforms toggle */}
                <button
                  onClick={() => onFiltersChange({ ...filters, selectedPlatforms: [], crossPlatformOnly: false })}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                    'hover:bg-secondary/70',
                    allPlatformsSelected && !filters.crossPlatformOnly
                      ? 'bg-primary/20 text-primary font-medium' 
                      : 'text-muted-foreground'
                  )}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-500" />
                  <span>All Platforms</span>
                </button>
                
                {/* Individual platform toggles */}
                {AVAILABLE_PLATFORMS.map((platform) => {
                  const isSelected = allPlatformsSelected || selectedPlatforms.includes(platform.value);
                  return (
                    <button
                      key={platform.value}
                      onClick={() => togglePlatform(platform.value)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                        'hover:bg-secondary/70',
                        isSelected && !allPlatformsSelected
                          ? 'bg-primary/20 text-primary font-medium' 
                          : 'text-muted-foreground'
                      )}
                    >
                      <span className={cn(
                        'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                        isSelected && !allPlatformsSelected
                          ? 'border-primary bg-primary' 
                          : 'border-muted-foreground/50'
                      )}>
                        {isSelected && !allPlatformsSelected && (
                          <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className={cn('w-2 h-2 rounded-full', platform.color)} />
                      <span>{platform.label}</span>
                    </button>
                  );
                })}

                {/* Cross-Platform Only toggle - only show when 2+ platforms selected */}
                {(allPlatformsSelected || selectedPlatforms.length >= 2) && (
                  <button
                    onClick={() => onFiltersChange({ ...filters, crossPlatformOnly: !filters.crossPlatformOnly })}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors mt-2 border-t border-border/50 pt-2',
                      'hover:bg-secondary/70',
                      filters.crossPlatformOnly
                        ? 'bg-purple-500/20 text-purple-400 font-medium' 
                        : 'text-muted-foreground'
                    )}
                  >
                    <span className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      filters.crossPlatformOnly
                        ? 'border-purple-400 bg-purple-400' 
                        : 'border-muted-foreground/50'
                    )}>
                      {filters.crossPlatformOnly && (
                        <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>Cross-Platform Only</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sort By */}
            <div className="p-2 pt-0 border-t border-border/50 mt-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1 pt-2">
                Sort By
              </div>
              <div className="space-y-0.5">
                {SORT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => onFiltersChange({ ...filters, sortBy: option.value })}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left',
                        'hover:bg-secondary/70',
                        filters.sortBy === option.value 
                          ? 'bg-primary/20 text-primary font-medium' 
                          : 'text-muted-foreground'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="block">{option.label}</span>
                        <span className="block text-[10px] opacity-60">{option.description}</span>
                      </div>
                      {option.value === 'trending' && filters.sortBy !== 'trending' && (
                        <span className="text-[9px] text-primary">Default</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Categories */}
            <div className="p-2 pt-0 border-t border-border/50 mt-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1 pt-2">
                Category
              </div>
              <div className="grid grid-cols-2 gap-1">
                {MARKET_CATEGORIES.map((cat) => (
                  <button
                    key={cat.slug}
                    onClick={() => onFiltersChange({ ...filters, category: cat.slug })}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors text-left',
                      'hover:bg-secondary/70',
                      filters.category === cat.slug 
                        ? 'bg-primary/20 text-primary font-medium' 
                        : 'text-muted-foreground'
                    )}
                  >
                    <span>{cat.icon}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Resolved Toggle */}
            <div className="p-2 pt-0 border-t border-border/50 mt-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1 pt-2">
                Status
              </div>
              <button
                onClick={() => onFiltersChange({ ...filters, showResolved: !filters.showResolved })}
                className={cn(
                  'w-full flex items-center justify-between px-2 py-2 rounded text-xs transition-colors',
                  'hover:bg-secondary/70',
                  filters.showResolved 
                    ? 'bg-amber-500/10 text-amber-400' 
                    : 'text-muted-foreground'
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                    filters.showResolved 
                      ? 'border-amber-400 bg-amber-400' 
                      : 'border-muted-foreground/50'
                  )}>
                    {filters.showResolved && (
                      <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span>Include Resolved Markets</span>
                </span>
              </button>
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-border bg-secondary/20">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}</span>
                {hasActiveFilters && (
                  <button
                    onClick={() => onFiltersChange({ 
                      showResolved: false, 
                      category: 'all', 
                      sortBy: 'trending', 
                      selectedPlatforms: [],
                      crossPlatformOnly: false
                    })}
                    className="text-primary hover:underline"
                  >
                    Reset to defaults
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
