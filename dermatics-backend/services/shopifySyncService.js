
import { fetchWithTimeout } from '../utils/fetchWithTimeout.js';

/**
 * Sync all products from Shopify using paginated GraphQL with variables.
 * @param {string} domain 
 * @param {string} accessToken 
 * @returns {Promise<Array>}
 */
export async function syncAllProductsFromShopify(domain, accessToken) {
    const allProducts = [];
    let hasNextPage = true;
    let endCursor = null;

    const query = `
    query GetProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        pageInfo { hasNextPage, endCursor }
        edges {
          node {
            id, title, handle, productType, onlineStoreUrl,
            images(first: 1) { edges { node { url } } }
            variants(first: 1) { edges { node { id, price { amount, currencyCode }, compareAtPrice { amount, currencyCode } } } }
            tags
          }
        }
      }
    }
    `;

    try {
        while (hasNextPage) {
            const response = await fetchWithTimeout(`https://${domain}/api/2024-01/graphql.json`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Storefront-Access-Token': accessToken,
                },
                body: JSON.stringify({
                    query,
                    variables: { first: 250, after: endCursor }
                }),
            }, 10000); // 10s timeout per page

            const json = await response.json();
            if (json.errors) throw new Error(`Shopify GraphQL Error: ${JSON.stringify(json.errors)}`);
            
            const data = json.data?.products;
            if (!data) break;

            const edges = data.edges || [];
            const normalized = edges.map(({ node }) => {
                const price = node.variants.edges[0]?.node?.price;
                const compareAtPrice = node.variants.edges[0]?.node?.compareAtPrice;
                return {
                    productId: node.id,
                    name: node.title,
                    handle: node.handle,
                    url: node.onlineStoreUrl || `https://${domain}/products/${node.handle}`,
                    imageUrl: node.images.edges[0]?.node?.url || 'https://placehold.co/200x200?text=No+Image',
                    variantId: node.variants.edges[0]?.node?.id,
                    price: price ? `${price.currencyCode} ${parseFloat(price.amount).toFixed(2)}` : 'N/A',
                    compareAtPrice: compareAtPrice ? `${compareAtPrice.currencyCode} ${parseFloat(compareAtPrice.amount).toFixed(2)}` : 'N/A',
                    tags: node.tags || [],
                    productType: node.productType || ''
                };
            });

            allProducts.push(...normalized);
            hasNextPage = data.pageInfo.hasNextPage;
            endCursor = data.pageInfo.endCursor;

            console.log(`- SYNC: Fetched ${normalized.length} products. Total so far: ${allProducts.length}`);
        }
        return allProducts;
    } catch (error) {
        console.error("- SYNC ERROR:", error.message);
        throw error;
    }
}
