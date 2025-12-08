/**
 * Base Platform Adapter
 * 
 * Abstract base class providing shared functionality for all platform adapters.
 * Platform-specific adapters should extend this class.
 */

import {
  PlatformAdapter,
  MarketPlatform,
  RawMarket,
  AdapterConfig,
  DEFAULT_ADAPTER_CONFIG,
  GroupedOutcome,
} from './types';
import { mapCategory } from './category-mapper';

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly platform: MarketPlatform;
  abstract readonly displayName: string;
  
  readonly enabled: boolean = true;
  protected config: AdapterConfig;
  
  constructor(config: Partial<AdapterConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTER_CONFIG, ...config };
  }
  
  // ============================================================
  // Abstract methods (must be implemented by subclasses)
  // ============================================================
  
  abstract fetchMarkets(): Promise<RawMarket[]>;
  abstract isActiveMarket(market: unknown): boolean;
  abstract normalizePrice(price: number | undefined): number;
  
  // ============================================================
  // Shared utility methods
  // ============================================================
  
  /**
   * Normalize a category string to our standard category slugs.
   */
  protected normalizeCategory(category?: string): string {
    return mapCategory(category);
  }
  
  /**
   * Create a GroupedOutcome from a RawMarket.
   */
  protected createOutcome(market: RawMarket): GroupedOutcome {
    return {
      id: market.id,
      title: market.title,
      odds: market.odds,
      volume24h: market.volume24h,
      volume1wk: market.volume1wk,
      volume1mo: market.volume1mo,
      volumeTotal: market.volumeTotal,
      liquidity: market.liquidity,
      platform: market.platform,
      resolved: market.status === 'resolved',
      metadata: market.metadata,
    };
  }
  
  /**
   * Generate a URL-safe slug from a string.
   */
  protected generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  
  /**
   * Parse a date string to ISO format, handling various input formats.
   */
  protected parseEndDate(date?: string | number): string {
    if (!date) return '';
    
    try {
      if (typeof date === 'number') {
        return new Date(date).toISOString();
      }
      return new Date(date).toISOString();
    } catch {
      return '';
    }
  }
  
  /**
   * Log debug information if debug mode is enabled.
   */
  protected log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[${this.displayName}] ${message}`, data ?? '');
    }
  }
  
  /**
   * Make a fetch request with timeout and error handling.
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AgentPM/1.0',
          ...options.headers,
        },
      });
      
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  /**
   * Fetch JSON with error handling.
   */
  protected async fetchJSON<T>(url: string): Promise<T | null> {
    try {
      const response = await this.fetchWithTimeout(url, {
        cache: 'no-store',
      });
      
      if (!response.ok) {
        this.log(`API error: ${response.status}`, url);
        return null;
      }
      
      return await response.json() as T;
    } catch (error) {
      this.log(`Fetch error`, error);
      return null;
    }
  }
}
