/**
 * Platform Adapters Registry
 * 
 * Central registry for all prediction market platform adapters.
 * To add a new platform:
 * 1. Create a new adapter file (e.g., predictit.ts)
 * 2. Import and register it in this file
 */

// Re-export types
export * from './types';
export { mapCategory, getCategoryLabel, createCategoryTag, STANDARD_CATEGORIES } from './category-mapper';
export { processMarkets, groupMarketsByEvent, mergeCrossPlatformMarkets } from './grouper';

// Import adapters
import { polymarketAdapter, PolymarketAdapter } from './polymarket';
import { kalshiAdapter, KalshiAdapter } from './kalshi';
import { PlatformAdapter, MarketPlatform, RawMarket, GroupedMarketResult } from './types';
import { processMarkets } from './grouper';

// Export adapter classes for custom instantiation
export { PolymarketAdapter } from './polymarket';
export { KalshiAdapter } from './kalshi';
export { BasePlatformAdapter } from './base-adapter';

// ============================================================
// Adapter Registry
// ============================================================

/**
 * All registered platform adapters.
 * Add new adapters here when integrating new platforms.
 */
export const adapters: PlatformAdapter[] = [
  polymarketAdapter,
  kalshiAdapter,
];

/**
 * Get an adapter by platform name.
 */
export function getAdapter(platform: MarketPlatform): PlatformAdapter | undefined {
  return adapters.find(a => a.platform === platform);
}

/**
 * Get all enabled adapters.
 */
export function getEnabledAdapters(): PlatformAdapter[] {
  return adapters.filter(a => a.enabled);
}

// ============================================================
// Convenience Functions
// ============================================================

/**
 * Fetch markets from all enabled platforms in parallel.
 */
export async function fetchAllMarkets(): Promise<RawMarket[]> {
  const enabledAdapters = getEnabledAdapters();
  
  const results = await Promise.all(
    enabledAdapters.map(adapter => 
      adapter.fetchMarkets().catch(error => {
        console.error(`[${adapter.displayName}] Fetch error:`, error);
        return [] as RawMarket[];
      })
    )
  );
  
  // Flatten all results
  const allMarkets = results.flat();
  
  console.log(`[Platforms] Fetched ${allMarkets.length} total markets from ${enabledAdapters.length} platforms`);
  
  return allMarkets;
}

/**
 * Fetch and process markets from all platforms.
 * Returns grouped, merged results ready for display.
 */
export async function fetchAndProcessMarkets(): Promise<GroupedMarketResult[]> {
  const rawMarkets = await fetchAllMarkets();
  return processMarkets(rawMarkets);
}

/**
 * Fetch markets from a specific platform.
 */
export async function fetchMarketsFromPlatform(platform: MarketPlatform): Promise<RawMarket[]> {
  const adapter = getAdapter(platform);
  if (!adapter) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  return adapter.fetchMarkets();
}
