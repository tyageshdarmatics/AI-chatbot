
/**
 * Simple keyword-based shortlisting to reduce catalog size before AI call.
 * This keeps tokens low and responses fast.
 */
export function shortlistProductsForGemini(catalog, context, maxItems = 40) {
    const { analysis, goals } = context;
    
    // 1. Extract searchable terms from context
    const terms = new Set();
    
    if (goals && Array.isArray(goals)) {
        goals.forEach(g => g.toLowerCase().split(/\s+/).forEach(word => word.length > 3 && terms.add(word)));
    }
    
    if (analysis && Array.isArray(analysis)) {
        analysis.forEach(cat => {
            if (!cat.conditions || !Array.isArray(cat.conditions)) return;
            cat.conditions.forEach(cond => {
                if (!cond.name) return;
                cond.name.toLowerCase().split(/\s+/).forEach(word => word.length > 3 && terms.add(word));
            });
        });
    }

    const termList = Array.from(terms);
    if (termList.length === 0) return catalog.slice(0, maxItems);

    // 2. Score products based on keyword matches in name and tags
    const scored = catalog.map(p => {
        let score = 0;
        const name = (p.name || '').toLowerCase();
        const tags = (p.tags || []).join(' ').toLowerCase();
        
        termList.forEach(term => {
            if (name.includes(term)) score += 5;
            if (tags.includes(term)) score += 2;
        });
        
        return { product: p, score };
    });

    // 3. Sort by score and return top results
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, maxItems)
        .map(s => s.product);
}
