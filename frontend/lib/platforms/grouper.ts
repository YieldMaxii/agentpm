/**
 * Market Grouper
 * 
 * Provides hierarchical grouping of markets from multiple platforms.
 * Groups outcomes under events, optionally under series.
 */

import {
  RawMarket,
  MarketPlatform,
  GroupedMarketResult,
  GroupedOutcome,
} from './types';
import { createCategoryTag } from './category-mapper';

// ============================================================
// Types
// ============================================================

interface EventGroup {
  eventId: string;
  eventTitle: string;
  seriesId?: string;
  seriesTitle?: string;
  description?: string;
  category?: string;
  endDate?: string;
  outcomes: RawMarket[];
  platforms: Set<MarketPlatform>;
}

// ============================================================
// Grouping Functions
// ============================================================

/**
 * Group raw markets hierarchically by event.
 * Markets with the same eventId are grouped together as outcomes.
 */
export function groupMarketsByEvent(markets: RawMarket[]): GroupedMarketResult[] {
  // Group by eventId
  const eventGroups = new Map<string, EventGroup>();
  
  for (const market of markets) {
    const key = `${market.platform}:${market.eventId}`;
    
    if (!eventGroups.has(key)) {
      eventGroups.set(key, {
        eventId: market.eventId,
        eventTitle: market.eventTitle,
        seriesId: market.seriesId,
        seriesTitle: market.seriesTitle,
        description: market.description,
        category: market.category,
        endDate: market.endDate,
        outcomes: [],
        platforms: new Set(),
      });
    }
    
    const group = eventGroups.get(key)!;
    group.outcomes.push(market);
    group.platforms.add(market.platform);
    
    // Use the most recent/best description
    if (!group.description && market.description) {
      group.description = market.description;
    }
  }
  
  // Convert groups to GroupedMarketResult
  const results: GroupedMarketResult[] = [];
  
  for (const group of Array.from(eventGroups.values())) {
    // Skip events with no outcomes
    if (group.outcomes.length === 0) continue;
    
    // Sort outcomes by odds (highest first)
    group.outcomes.sort((a: RawMarket, b: RawMarket) => b.odds - a.odds);
    
    // Create grouped outcomes
    const outcomes: GroupedOutcome[] = group.outcomes.map((market: RawMarket) => ({
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
    }));
    
    // Aggregate volumes
    const totalVolume24h = group.outcomes.reduce((sum: number, m: RawMarket) => sum + m.volume24h, 0);
    const totalVolume1wk = group.outcomes.reduce((sum: number, m: RawMarket) => sum + (m.volume1wk || 0), 0);
    const totalVolume1mo = group.outcomes.reduce((sum: number, m: RawMarket) => sum + (m.volume1mo || 0), 0);
    const totalVolumeTotal = group.outcomes.reduce((sum: number, m: RawMarket) => sum + m.volumeTotal, 0);
    const totalLiquidity = group.outcomes.reduce((sum: number, m: RawMarket) => sum + m.liquidity, 0);
    
    // Create category tag
    const categoryTag = createCategoryTag(group.category);
    const tags = categoryTag ? [categoryTag] : [];
    
    // Generate slug
    const slug = generateSlug(group.eventTitle);
    
    // Check if all outcomes are resolved
    const allResolved = group.outcomes.every((m: RawMarket) => m.status === 'resolved');
    
    results.push({
      eventId: group.eventId,
      eventTitle: group.eventTitle,
      slug,
      seriesId: group.seriesId,
      seriesTitle: group.seriesTitle,
      description: group.description,
      category: group.category,
      endDate: group.endDate || '',
      outcomes,
      totalVolume24h,
      totalVolume1wk: totalVolume1wk || undefined,
      totalVolume1mo: totalVolume1mo || undefined,
      totalVolumeTotal,
      totalLiquidity,
      platforms: Array.from(group.platforms),
      hasArbitrage: false, // Will be set during cross-platform merge
      resolved: allResolved,
      tags,
    });
  }
  
  // Sort by 24h volume (most active first)
  results.sort((a, b) => b.totalVolume24h - a.totalVolume24h);
  
  return results;
}

/**
 * Identify cross-platform markets (same event on multiple platforms).
 * Does NOT merge them - keeps them separate but marks them as cross-platform.
 * 
 * This allows users to see each platform's outcomes independently while
 * knowing when the same event exists on multiple platforms.
 */
export function mergeCrossPlatformMarkets(
  markets: GroupedMarketResult[],
  similarityThreshold = 0.85
): GroupedMarketResult[] {
  // OPTIMIZATION: Split markets by platform first
  const marketsByPlatform = new Map<MarketPlatform, { index: number; market: GroupedMarketResult; normalized: string; year: string | null }[]>();
  
  // Pre-process: normalize titles and extract years (do this once, not in every comparison)
  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    const platform = market.platforms[0];
    const normalized = normalizeTitle(market.eventTitle);
    const yearMatch = market.eventTitle.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : null;
    
    if (!marketsByPlatform.has(platform)) {
      marketsByPlatform.set(platform, []);
    }
    marketsByPlatform.get(platform)!.push({ index: i, market, normalized, year });
  }
  
  const platforms = Array.from(marketsByPlatform.keys());
  if (platforms.length < 2) {
    // Only one platform, no cross-platform matches possible
    return markets;
  }
  
  // Find matches only between different platforms
  const crossPlatformGroups = new Map<number, number[]>();
  
  // Compare first platform against all others
  const basePlatform = platforms[0];
  const baseMarkets = marketsByPlatform.get(basePlatform) || [];
  
  for (const baseEntry of baseMarkets) {
    const matches: number[] = [];
    
    for (let p = 1; p < platforms.length; p++) {
      const otherPlatform = platforms[p];
      const otherMarkets = marketsByPlatform.get(otherPlatform) || [];
      
      for (const otherEntry of otherMarkets) {
        // FAST FILTER: If both have years, they must match
        if (baseEntry.year && otherEntry.year && baseEntry.year !== otherEntry.year) {
          continue;
        }
        
        // Quick normalized string check before expensive similarity
        if (baseEntry.normalized === otherEntry.normalized) {
          matches.push(otherEntry.index);
          continue;
        }
        
        // Only do expensive similarity for titles of similar length
        const lenRatio = baseEntry.normalized.length / otherEntry.normalized.length;
        if (lenRatio < 0.5 || lenRatio > 2) {
          continue;
        }
        
        const score = titleSimilarityFast(baseEntry.normalized, otherEntry.normalized, baseEntry.year);
        if (score >= similarityThreshold) {
          matches.push(otherEntry.index);
        }
      }
    }
    
    if (matches.length > 0) {
      crossPlatformGroups.set(baseEntry.index, matches);
      // Also add reverse mappings
      for (const matchIdx of matches) {
        if (!crossPlatformGroups.has(matchIdx)) {
          crossPlatformGroups.set(matchIdx, []);
        }
        crossPlatformGroups.get(matchIdx)!.push(baseEntry.index);
      }
    }
  }
  
  // Build result
  const result: GroupedMarketResult[] = [];
  
  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    const matches = crossPlatformGroups.get(i) || [];
    
    if (matches.length > 0) {
      const crossPlatformOdds: Partial<Record<MarketPlatform, number>> = {};
      
      if (market.outcomes.length > 0) {
        crossPlatformOdds[market.platforms[0]] = market.outcomes[0].odds;
      }
      
      for (const matchIdx of matches) {
        const matched = markets[matchIdx];
        if (matched.outcomes.length > 0) {
          crossPlatformOdds[matched.platforms[0]] = matched.outcomes[0].odds;
        }
      }
      
      const oddsValues = Object.values(crossPlatformOdds).filter(v => v !== undefined) as number[];
      const hasArbitrage = oddsValues.length > 1 &&
        Math.max(...oddsValues) - Math.min(...oddsValues) > 0.05;
      
      result.push({
        ...market,
        hasArbitrage,
        crossPlatformOdds,
      });
    } else {
      result.push(market);
    }
  }
  
  result.sort((a, b) => b.totalVolume24h - a.totalVolume24h);
  
  return result;
}

/**
 * Fast title similarity - uses pre-normalized strings.
 */
function titleSimilarityFast(norm1: string, norm2: string, year: string | null): number {
  if (norm1 === norm2) return 1;
  
  // Get meaningful words
  const words1 = norm1.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const words2 = norm2.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Simple word overlap with synonym expansion
  let matchCount = 0;
  for (const w1 of words1) {
    const syns1 = getSynonyms(w1);
    for (const w2 of words2) {
      const syns2 = getSynonyms(w2);
      if (syns1.some(s => syns2.includes(s))) {
        matchCount++;
        break;
      }
    }
  }
  
  const maxWords = Math.max(words1.length, words2.length);
  return matchCount / maxWords;
}

// ============================================================
// Helper Functions
// ============================================================

// Stop words to ignore in matching (too common to be meaningful)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'do', 'does',
  'did', 'has', 'have', 'had', 'this', 'that', 'these', 'those', 'it',
  'its', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once',
  'before', 'after', 'above', 'below', 'between', 'under', 'over', 'again',
  'next', 'any', 'win', 'winner', 'champion', 'championship'
]);

// Synonym mappings for cross-platform matching
const SYNONYMS: Record<string, string[]> = {
  'super bowl': ['pro football championship', 'nfl championship', 'super bowl'],
  'world series': ['mlb championship', 'baseball championship', 'world series'],
  'nba finals': ['nba championship', 'basketball championship', 'nba finals'],
  'stanley cup': ['nhl championship', 'hockey championship', 'stanley cup'],
  'president': ['presidential', 'potus', 'president'],
  'presidential': ['president', 'potus', 'presidential'],
  'nominee': ['nomination', 'nominate', 'nominee'],
  'nomination': ['nominee', 'nominate', 'nomination'],
  'democratic': ['democrat', 'dem', 'democratic'],
  'republican': ['gop', 'rep', 'republican'],
  'fed': ['federal reserve', 'fomc', 'fed'],
  'federal reserve': ['fed', 'fomc', 'federal reserve'],
  'bitcoin': ['btc', 'bitcoin'],
  'ethereum': ['eth', 'ethereum'],
};

/**
 * Calculate similarity score between two titles (0-1).
 * Uses strict matching requiring key entities to match.
 */
function titleSimilarity(title1: string, title2: string): number {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  
  // Exact match after normalization
  if (norm1 === norm2) return 1;
  
  // Apply synonyms
  const syn1 = applySynonyms(norm1);
  const syn2 = applySynonyms(norm2);
  
  if (syn1 === syn2) return 0.95;
  
  // Extract meaningful words (excluding stop words)
  const words1 = extractMeaningfulWords(norm1);
  const words2 = extractMeaningfulWords(norm2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Extract key entities: years, proper nouns, numbers
  const entities1 = extractKeyEntities(title1);
  const entities2 = extractKeyEntities(title2);
  
  // If both have years, they MUST match
  if (entities1.years.length > 0 && entities2.years.length > 0) {
    const yearsMatch = entities1.years.some(y => entities2.years.includes(y));
    if (!yearsMatch) return 0; // Different years = definitely different markets
  }
  
  // Calculate word overlap with synonyms
  const synWords1 = new Set(words1.flatMap(w => getSynonyms(w)));
  const synWords2 = new Set(words2.flatMap(w => getSynonyms(w)));
  
  const intersection = Array.from(synWords1).filter(x => synWords2.has(x));
  const union = new Set([...Array.from(synWords1), ...Array.from(synWords2)]);
  
  const jaccardScore = intersection.length / union.size;
  
  // Require high overlap for a match
  if (jaccardScore < 0.5) return 0;
  
  // Boost score if key entities match
  let entityBonus = 0;
  
  // Check if main subject matches (first significant word often indicates topic)
  const mainWord1 = words1[0];
  const mainWord2 = words2[0];
  if (mainWord1 && mainWord2) {
    const mainSyns1 = getSynonyms(mainWord1);
    const mainSyns2 = getSynonyms(mainWord2);
    if (mainSyns1.some(s => mainSyns2.includes(s))) {
      entityBonus += 0.1;
    }
  }
  
  // Check proper noun overlap (names, places)
  const nameOverlap = entities1.properNouns.filter(n => 
    entities2.properNouns.some(n2 => n.includes(n2) || n2.includes(n))
  );
  if (nameOverlap.length > 0) {
    entityBonus += 0.15;
  }
  
  return Math.min(jaccardScore + entityBonus, 1);
}

/**
 * Extract meaningful words, excluding stop words.
 */
function extractMeaningfulWords(text: string): string[] {
  return text
    .split(' ')
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Get all synonyms for a word, including the word itself.
 */
function getSynonyms(word: string): string[] {
  const result = [word];
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (key.includes(word) || syns.some(s => s.includes(word))) {
      result.push(...syns, key);
    }
  }
  return Array.from(new Set(result));
}

/**
 * Apply synonym normalization to a title.
 */
function applySynonyms(text: string): string {
  let result = text;
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    for (const syn of syns) {
      if (result.includes(syn) && syn !== key) {
        result = result.replace(syn, key);
      }
    }
  }
  return result;
}

/**
 * Extract key entities from a title.
 */
function extractKeyEntities(title: string): { years: string[]; properNouns: string[]; numbers: string[] } {
  // Find years (4-digit numbers starting with 19 or 20)
  const years = title.match(/\b(19|20)\d{2}\b/g) || [];
  
  // Find proper nouns (capitalized words that aren't at start of sentence)
  const words = title.split(/\s+/);
  const properNouns: string[] = [];
  for (let i = 1; i < words.length; i++) {
    if (/^[A-Z][a-z]+/.test(words[i])) {
      properNouns.push(words[i].toLowerCase());
    }
  }
  
  // Find other numbers
  const numbers = title.match(/\b\d+\b/g)?.filter(n => n.length < 4) || [];
  
  return { years, properNouns, numbers };
}

/**
 * Normalize a title for comparison.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a URL-safe slug from a string.
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ============================================================
// Main Export
// ============================================================

/**
 * Process raw markets from all platforms:
 * 1. Group by event (outcomes under same event)
 * 2. Merge cross-platform matches
 * 3. Return sorted, grouped results
 */
export function processMarkets(rawMarkets: RawMarket[]): GroupedMarketResult[] {
  // Step 1: Group by event
  const grouped = groupMarketsByEvent(rawMarkets);
  
  // Step 2: Merge cross-platform matches
  const merged = mergeCrossPlatformMarkets(grouped);
  
  return merged;
}
