import { Router } from 'express';
import { generateContentWithFailover, SchemaType } from '../services/aiService.js';
import { getCatalogFast } from '../services/catalogHelper.js';
import { shortlistProductsForGemini } from '../services/productShortlistService.js';

const router = Router();

/**
 * POST /api/recommend-skin
 * Body: { analysis: [], goals: [] }
 */
router.post('/recommend-skin', async (req, res) => {
    try {
        const { analysis, goals } = req.body;

        const skinCatalog = await getCatalogFast('skin');
        const shortlisted = shortlistProductsForGemini(skinCatalog, { analysis, goals }, 30);
        console.log(`- INFO: Using ${shortlisted.length} shortlisted skin products for AI.`);

        const analysisString = JSON.stringify(analysis);
        const goalsString = (goals || []).join(", ");
        const productCatalogString = JSON.stringify(shortlisted.map(p => ({ id: p.variantId, name: p.name })));

        const prompt = `Create a highly effective, personalized skincare routine (Morning & Evening) based on the user's specific analysis and goals.
        
        **INPUT DATA:**
        - **USER ANALYSIS:** ${analysisString}
        - **USER GOALS:** ${goalsString}
        
        **PRODUCT CATALOG:** 
        ${productCatalogString}

        **MEDICAL LOGIC:**
        1. AM Routine: Focus on Gentle Cleansing + Antioxidants + Hydration + Sun Protection.
        2. PM Routine: Focus on Deep Cleansing + Treatments (Actives) + Repair/Moisturize.
        3. Match the single best product for each step using only the catalog.
        4. For each step, you can recommend one "Recommended" product and optionally one "Alternative" product if suitable.
        5. MANDATORY: For each product, provide:
           - "reason": a short explanation (max 10 words) why it's recommended for this specific user.

        **CONSTRAINTS:**
        - Return the exact 'productId' (which is the variantId in the catalog).
        - No hallucinations. If no product fits, skip that step.
        - Set 'recommendationType' to either "Recommended" or "Alternative".
        - Return JSON format only.`;

        const response = await generateContentWithFailover({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        am: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    productId: { type: SchemaType.STRING },
                                    name: { type: SchemaType.STRING },
                                    stepType: { type: SchemaType.STRING },
                                    reason: { type: SchemaType.STRING },
                                    recommendationType: { type: SchemaType.STRING },
                                },
                                required: ["productId", "name", "stepType", "reason", "recommendationType"]
                            }
                        },
                        pm: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    productId: { type: SchemaType.STRING },
                                    name: { type: SchemaType.STRING },
                                    stepType: { type: SchemaType.STRING },
                                    reason: { type: SchemaType.STRING },
                                    recommendationType: { type: SchemaType.STRING },
                                },
                                required: ["productId", "name", "stepType", "reason", "recommendationType"]
                            }
                        }
                    },
                    required: ["am", "pm"]
                }
            }
        });

        const recommendations = JSON.parse(response.text.trim());
        console.log("- INFO: AI skin response parsed successfully");

        const hydrate = (list) => (list || []).map(p => {
            const full = skinCatalog.find(prod => prod.variantId === p.productId || prod.name === p.name);
            if (!full) return null;
            return {
                name: full.name,
                productId: full.productId,
                price: full.price,
                compareAtPrice: full.compareAtPrice,
                image: full.imageUrl,
                url: full.url,
                variantId: full.variantId,
                recommendationType: p.recommendationType || 'Recommended',
                tags: [p.stepType],
                reason: p.reason,
            };
        }).filter(Boolean);

        const result = [];
        if (recommendations.am?.length > 0) {
            result.push({ category: "Morning Routine", products: hydrate(recommendations.am) });
        }
        if (recommendations.pm?.length > 0) {
            result.push({ category: "Evening Routine", products: hydrate(recommendations.pm) });
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/recommend-hair
 * Body: { analysis: [], profile: {}, goals: [] }
 */
router.post('/recommend-hair', async (req, res) => {
    try {
        const { analysis, profile, goals } = req.body;

        const hairCatalog = await getCatalogFast('hair');
        const shortlisted = shortlistProductsForGemini(hairCatalog, { analysis, goals }, 30);
        console.log(`- INFO: Using ${shortlisted.length} shortlisted hair products for AI.`);

        const prompt = `Create a clinical-grade hair care routine based on the provided analysis.

        **INPUT DATA:**
        - **ANALYSIS:** ${JSON.stringify(analysis)}
        - **PROFILE:** ${JSON.stringify(profile || {})}
        - **GOALS:** ${(goals || []).join(', ')}

        **PRODUCT CATALOG:** ${JSON.stringify(shortlisted.map(p => ({ id: p.variantId, name: p.name })))}

        **MEDICAL LOGIC:**
        1. Identify issues (e.g., Pattern Baldness, Dandruff, Damage).
        2. Match the most potent product for each step using only the catalog.
        3. For each step, you can recommend one "Recommended" product and optionally one "Alternative" product if suitable.
        4. MANDATORY: For each product, provide:
           - "reason": a short explanation (max 10 words) why it's recommended for this specific user.

        **CONSTRAINTS:**
        - Return the exact 'productId' (which is the variantId in the catalog).
        - No hallucinations. If no product fits, skip that step.
        - Set 'recommendationType' to either "Recommended" or "Alternative".
        - Return JSON format only.`;

        const response = await generateContentWithFailover({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        am: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    productId: { type: SchemaType.STRING },
                                    name: { type: SchemaType.STRING },
                                    stepType: { type: SchemaType.STRING },
                                    reason: { type: SchemaType.STRING },
                                    recommendationType: { type: SchemaType.STRING },
                                },
                                required: ["productId", "name", "stepType", "reason", "recommendationType"]
                            }
                        },
                        pm: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    productId: { type: SchemaType.STRING },
                                    name: { type: SchemaType.STRING },
                                    stepType: { type: SchemaType.STRING },
                                    reason: { type: SchemaType.STRING },
                                    recommendationType: { type: SchemaType.STRING },
                                },
                                required: ["productId", "name", "stepType", "reason", "recommendationType"]
                            }
                        }
                    },
                    required: ["am", "pm"]
                }
            }
        });

        const recommendations = JSON.parse(response.text.trim());
        console.log("- INFO: AI hair response parsed successfully");

        const hydrate = (list) => (list || []).map(item => {
            const full = hairCatalog.find(p => p.variantId === item.productId || p.name === item.name);
            if (!full) return null;
            return {
                name: full.name,
                productId: full.productId,
                price: full.price,
                compareAtPrice: full.compareAtPrice,
                image: full.imageUrl,
                url: full.url,
                variantId: full.variantId,
                recommendationType: item.recommendationType || 'Recommended',
                tags: [item.stepType],
                reason: item.reason,
            };
        }).filter(Boolean);

        const result = [];
        if (recommendations.am?.length > 0) {
            result.push({ category: "Morning Routine", products: hydrate(recommendations.am) });
        }
        if (recommendations.pm?.length > 0) {
            result.push({ category: "Evening Routine", products: hydrate(recommendations.pm) });
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
