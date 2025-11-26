import { NormalizedMarket, MarketsResponse } from './types';

const API_BASE = '/api/markets';
const POLL_INTERVAL = 10000; // 10 seconds

export class PolymarketClient {
  private pollInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(markets: NormalizedMarket[]) => void> = new Set();

  async fetchMarkets(limit = 20): Promise<NormalizedMarket[]> {
    try {
      const response = await fetch(`${API_BASE}?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch markets: ${response.status}`);
      }
      const data: MarketsResponse = await response.json();
      return data.markets;
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw error;
    }
  }

  startPolling(callback: (markets: NormalizedMarket[]) => void) {
    this.listeners.add(callback);
    
    // Initial fetch
    this.fetchMarkets().then(callback).catch(console.error);
    
    // Start polling if not already
    if (!this.pollInterval) {
      this.pollInterval = setInterval(async () => {
        try {
          const markets = await this.fetchMarkets();
          this.listeners.forEach(listener => listener(markets));
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, POLL_INTERVAL);
    }
  }

  stopPolling(callback?: (markets: NormalizedMarket[]) => void) {
    if (callback) {
      this.listeners.delete(callback);
    }
    
    if (this.listeners.size === 0 && this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  destroy() {
    this.listeners.clear();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

// Singleton instance
export const polymarketClient = new PolymarketClient();

