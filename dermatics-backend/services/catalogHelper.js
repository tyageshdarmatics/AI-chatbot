import { syncAllProductsFromShopify } from './shopifySyncService.js';
import { buildPreparedCatalogs } from './catalogBuilder.js';
import { saveCatalogsToCache, getCachedCatalog } from './catalogCacheService.js';

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

let isSyncing = false;

export async function refreshCatalogInBackground() {
    if (isSyncing) return { status: "already_syncing" };
    isSyncing = true;
    console.log("- SYNC: Starting background refresh...");

    try {
        const rawProducts = await syncAllProductsFromShopify(SHOPIFY_DOMAIN, ACCESS_TOKEN);
        const catalogs = buildPreparedCatalogs(rawProducts);
        await saveCatalogsToCache(catalogs);

        console.log(`- SYNC SUCCESS: ${rawProducts.length} total products synced.`);
        isSyncing = false;
        return { status: "success", count: rawProducts.length };
    } catch (error) {
        console.error("- SYNC FAILED:", error.message);
        isSyncing = false;
        throw error;
    }
}

export async function getCatalogFast(type = 'all') {
    let catalog = await getCachedCatalog(type);

    if (!catalog) {
        console.log(`- CACHE MISS: ${type} catalog not found. Triggering emergency sync...`);
        try {
            await refreshCatalogInBackground();
            catalog = await getCachedCatalog(type);
        } catch (e) {
            console.error("- EMERGENCY SYNC FAILED:", e.message);
        }
    }

    return catalog || [];
}
