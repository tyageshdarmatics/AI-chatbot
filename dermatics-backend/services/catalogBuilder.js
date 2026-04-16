
/**
 * Product category filters.
 * Centralized logic for splitting the catalog.
 */

export const isSkinProduct = (p) => {
    const name = p.name.toLowerCase();
    const type = p.productType.toLowerCase();
    const tags = p.tags.map(t => t.toLowerCase());

    const isHair = name.includes('hair') || name.includes('scalp') || name.includes('shampoo') || name.includes('conditioner') || type.includes('hair') || tags.includes('hair');
    const isFace = name.includes('face') || name.includes('skin') || name.includes('acne') || name.includes('serum') || type.includes('skin') || tags.includes('skin');
    
    // Explicit exclusions from skincare (common hair terms)
    const hairExclusions = ['shampoo', 'conditioner', 'minoxidil', 'follihair', 'mintop', 'anaboom'];
    const hasHairExclusion = hairExclusions.some(term => name.includes(term));

    return (isFace || (!isHair && !hasHairExclusion)) && !hasHairExclusion;
};

export const isHairProduct = (p) => {
    const name = p.name.toLowerCase();
    const type = p.productType.toLowerCase();
    const tags = p.tags.map(t => t.toLowerCase());

    return name.includes('hair') || name.includes('scalp') || name.includes('shampoo') || name.includes('conditioner') || type.includes('hair') || tags.includes('hair');
};

/**
 * Builds specialized catalogs from the raw product list.
 * @param {Array} products 
 * @returns {Record<string, any>}
 */
export function buildPreparedCatalogs(products) {
    const skin = products.filter(isSkinProduct);
    const hair = products.filter(isHairProduct);

    return {
        all: products,
        skin,
        hair,
        meta: {
            syncedAt: new Date().toISOString(),
            total: products.length,
            skinCount: skin.length,
            hairCount: hair.length
        }
    };
}
