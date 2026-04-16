
const REDIS_URL = process.env.REDIS_URL;
let redis = null;

async function initRedis() {
    if (redis || !REDIS_URL) return;
    try {
        const { default: Redis } = await import('ioredis');
        redis = new Redis(REDIS_URL);
        console.log("- CACHE: Redis connected");
    } catch (e) {
        console.warn("- CACHE: Redis connection failed or 'ioredis' package not found. Using in-memory fallback.");
    }
}

// In-memory fallback for local dev or if Redis is down
const memoryCache = new Map();

const KEYS = {
    ALL: 'shopify:catalog:all:v1',
    SKIN: 'shopify:catalog:skin:v1',
    HAIR: 'shopify:catalog:hair:v1',
    META: 'shopify:catalog:meta:v1'
};

const TTL = 24 * 60 * 60; // 24 hours in seconds

/**
 * Save all prepared catalogs to the shared cache.
 * @param {object} catalogs 
 */
export async function saveCatalogsToCache(catalogs) {
    await initRedis();
    const entries = [
        [KEYS.ALL, JSON.stringify(catalogs.all)],
        [KEYS.SKIN, JSON.stringify(catalogs.skin)],
        [KEYS.HAIR, JSON.stringify(catalogs.hair)],
        [KEYS.META, JSON.stringify(catalogs.meta)]
    ];

    for (const [key, value] of entries) {
        if (redis) {
            await redis.set(key, value, 'EX', TTL);
        }
        memoryCache.set(key, value);
    }
    console.log("- CACHE: Saved catalogs to storage");
}

/**
 * Get a specific catalog from the cache.
 * @param {string} type - 'all' | 'skin' | 'hair' | 'meta'
 * @returns {Promise<Array|object|null>}
 */
export async function getCachedCatalog(type) {
    await initRedis();
    const key = KEYS[type.toUpperCase()];
    if (!key) return null;

    let data = null;
    if (redis) {
        data = await redis.get(key);
    }
    
    if (!data) {
        data = memoryCache.get(key);
    }

    return data ? JSON.parse(data) : null;
}
