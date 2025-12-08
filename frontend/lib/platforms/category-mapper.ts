/**
 * Category Mapper
 * 
 * Unified category normalization for all prediction market platforms.
 * Maps platform-specific categories to our standard category slugs.
 */

// ============================================================
// Standard Categories
// ============================================================

export const STANDARD_CATEGORIES = [
  { slug: 'politics', label: 'Politics' },
  { slug: 'crypto', label: 'Crypto' },
  { slug: 'sports', label: 'Sports' },
  { slug: 'ai', label: 'AI' },
  { slug: 'business', label: 'Business' },
  { slug: 'finance', label: 'Finance' },
  { slug: 'science', label: 'Science' },
  { slug: 'pop-culture', label: 'Culture' },
  { slug: 'geopolitics', label: 'World' },
  { slug: 'other', label: 'Other' },
] as const;

export type CategorySlug = typeof STANDARD_CATEGORIES[number]['slug'];

// ============================================================
// Category Mapping Rules
// ============================================================

/**
 * Maps various category strings to our standard slugs.
 * Keys are lowercase patterns to match against.
 */
const CATEGORY_MAP: Record<string, CategorySlug> = {
  // Politics
  'politics': 'politics',
  'political': 'politics',
  'election': 'politics',
  'elections': 'politics',
  'government': 'politics',
  'congress': 'politics',
  'senate': 'politics',
  'president': 'politics',
  'presidential': 'politics',
  'democrat': 'politics',
  'republican': 'politics',
  'gop': 'politics',
  'trump': 'politics',
  'biden': 'politics',
  
  // Finance & Economics
  'finance': 'finance',
  'financial': 'finance',
  'financials': 'finance',
  'economics': 'finance',
  'economic': 'finance',
  'economy': 'finance',
  'fed': 'finance',
  'federal reserve': 'finance',
  'interest rate': 'finance',
  'inflation': 'finance',
  'gdp': 'finance',
  'unemployment': 'finance',
  'stock': 'finance',
  'stocks': 'finance',
  'market': 'finance',
  'markets': 'finance',
  'treasury': 'finance',
  'bond': 'finance',
  'bonds': 'finance',
  'forex': 'finance',
  'currency': 'finance',
  
  // Crypto
  'crypto': 'crypto',
  'cryptocurrency': 'crypto',
  'bitcoin': 'crypto',
  'btc': 'crypto',
  'ethereum': 'crypto',
  'eth': 'crypto',
  'defi': 'crypto',
  'nft': 'crypto',
  'blockchain': 'crypto',
  'web3': 'crypto',
  
  // AI & Technology
  'ai': 'ai',
  'artificial intelligence': 'ai',
  'tech': 'ai',
  'technology': 'ai',
  'openai': 'ai',
  'chatgpt': 'ai',
  'gpt': 'ai',
  'llm': 'ai',
  'machine learning': 'ai',
  'ml': 'ai',
  'software': 'ai',
  'apple': 'ai',
  'google': 'ai',
  'microsoft': 'ai',
  'meta': 'ai',
  
  // Sports
  'sports': 'sports',
  'sport': 'sports',
  'nfl': 'sports',
  'football': 'sports',
  'nba': 'sports',
  'basketball': 'sports',
  'mlb': 'sports',
  'baseball': 'sports',
  'nhl': 'sports',
  'hockey': 'sports',
  'soccer': 'sports',
  'mls': 'sports',
  'tennis': 'sports',
  'golf': 'sports',
  'ufc': 'sports',
  'mma': 'sports',
  'boxing': 'sports',
  'olympics': 'sports',
  'f1': 'sports',
  'formula 1': 'sports',
  'racing': 'sports',
  'esports': 'sports',
  
  // Science & Climate
  'science': 'science',
  'scientific': 'science',
  'climate': 'science',
  'weather': 'science',
  'environment': 'science',
  'space': 'science',
  'nasa': 'science',
  'spacex': 'science',
  'health': 'science',
  'medical': 'science',
  'medicine': 'science',
  'covid': 'science',
  'pandemic': 'science',
  'vaccine': 'science',
  
  // Business & Companies
  'business': 'business',
  'companies': 'business',
  'company': 'business',
  'corporate': 'business',
  'earnings': 'business',
  'ipo': 'business',
  'merger': 'business',
  'acquisition': 'business',
  'startup': 'business',
  'startups': 'business',
  'ceo': 'business',
  'layoffs': 'business',
  
  // Pop Culture & Entertainment
  'pop-culture': 'pop-culture',
  'culture': 'pop-culture',
  'entertainment': 'pop-culture',
  'celebrity': 'pop-culture',
  'celebrities': 'pop-culture',
  'movie': 'pop-culture',
  'movies': 'pop-culture',
  'film': 'pop-culture',
  'tv': 'pop-culture',
  'television': 'pop-culture',
  'streaming': 'pop-culture',
  'netflix': 'pop-culture',
  'music': 'pop-culture',
  'awards': 'pop-culture',
  'oscar': 'pop-culture',
  'grammy': 'pop-culture',
  'emmy': 'pop-culture',
  
  // Geopolitics & World
  'geopolitics': 'geopolitics',
  'world': 'geopolitics',
  'international': 'geopolitics',
  'global': 'geopolitics',
  'war': 'geopolitics',
  'conflict': 'geopolitics',
  'military': 'geopolitics',
  'nato': 'geopolitics',
  'un': 'geopolitics',
  'united nations': 'geopolitics',
  'china': 'geopolitics',
  'russia': 'geopolitics',
  'ukraine': 'geopolitics',
  'europe': 'geopolitics',
  'asia': 'geopolitics',
  'middle east': 'geopolitics',
  'africa': 'geopolitics',
  'immigration': 'geopolitics',
  'trade': 'geopolitics',
  'tariff': 'geopolitics',
};

// ============================================================
// Mapping Functions
// ============================================================

/**
 * Map a category string to our standard category slug.
 * Handles various input formats from different platforms.
 */
export function mapCategory(category?: string): CategorySlug {
  if (!category) return 'other';
  
  const lower = category.toLowerCase().trim();
  
  // Direct match
  if (CATEGORY_MAP[lower]) {
    return CATEGORY_MAP[lower];
  }
  
  // Partial match - check if any keyword is contained in the category
  for (const [keyword, slug] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(keyword) || keyword.includes(lower)) {
      return slug;
    }
  }
  
  return 'other';
}

/**
 * Get the display label for a category slug.
 */
export function getCategoryLabel(slug: CategorySlug): string {
  const category = STANDARD_CATEGORIES.find(c => c.slug === slug);
  return category?.label ?? 'Other';
}

/**
 * Create a tag object from a category.
 */
export function createCategoryTag(category?: string): { slug: string; label: string } | null {
  const slug = mapCategory(category);
  if (slug === 'other') return null;
  
  return {
    slug,
    label: getCategoryLabel(slug),
  };
}

/**
 * Map multiple categories/tags to standard format.
 */
export function mapCategories(categories: string[]): { slug: string; label: string }[] {
  const tags: { slug: string; label: string }[] = [];
  const seen = new Set<string>();
  
  for (const category of categories) {
    const slug = mapCategory(category);
    if (slug !== 'other' && !seen.has(slug)) {
      seen.add(slug);
      tags.push({
        slug,
        label: getCategoryLabel(slug),
      });
    }
  }
  
  return tags;
}
