import { Router } from 'express';
import { getCatalogFast, refreshCatalogInBackground } from '../services/catalogHelper.js';

const router = Router();

router.get('/catalog-status', async (req, res) => {
    try {
        const all = await getCatalogFast('all');
        const skin = await getCatalogFast('skin');
        const hair = await getCatalogFast('hair');
        res.json({
            status: "ok",
            catalog: { total: all.length, skin: skin.length, hair: hair.length },
            env: {
                hasGeminiKey: !!(process.env.GEMINI_API_KEY || process.env.VITE_API_KEY),
                hasShopifyDomain: !!process.env.SHOPIFY_DOMAIN,
                hasShopifyToken: !!process.env.SHOPIFY_ACCESS_TOKEN,
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/refresh-shopify-catalog', async (req, res) => {
    const secret = req.headers['x-refresh-secret'];
    const INTERNAL_SECRET = process.env.INTERNAL_REFRESH_SECRET || 'sync-secret-123';

    if (secret !== INTERNAL_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const result = await refreshCatalogInBackground();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/webhooks/shopify', (req, res) => {
    console.log("- WEBHOOK: Received product update. Triggering background sync...");
    refreshCatalogInBackground().catch(e => console.error("- WEBHOOK SYNC ERR:", e.message));
    res.status(200).send('OK');
});

export default router;
