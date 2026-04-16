
export interface ProductData {
  id: string;
  name: string;
  url: string;
  imageUrl: string;
  description: string;
  suitableFor: string[];
  keyIngredients: string[];
  variantId: string;
  price: string;
  originalPrice?: string;
  productType?: string;
}

// Shopify Config
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_DOMAIN || !ACCESS_TOKEN) {
  console.warn("WARNING: SHOPIFY_DOMAIN or SHOPIFY_ACCESS_TOKEN is missing in environment variables. Product catalog will not work.");
}

let cachedProducts: ProductData[] | null = null;
const CACHE_KEY = "dermatics_products_cache";
const TIMESTAMP_KEY = "dermatics_products_timestamp";
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export async function getAllProducts(): Promise<ProductData[]> {
  if (cachedProducts) return cachedProducts;

  // Try loading from localStorage
  try {
    const localCache = localStorage.getItem(CACHE_KEY);
    const localTimestamp = localStorage.getItem(TIMESTAMP_KEY);
    const now = Date.now();

    if (localCache && localTimestamp) {
      const timestamp = parseInt(localTimestamp, 10);
      if (now - timestamp < CACHE_EXPIRY) {
        console.log("✅ Using 24h localStorage cache for products");
        cachedProducts = JSON.parse(localCache);
        return cachedProducts || [];
      }
    }
  } catch (e) {
    console.warn("Failed to read from localStorage cache", e);
  }

  const allEdges: any[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  try {
    while (hasNextPage) {
      const query = `
            {
              products(first: 250${endCursor ? `, after: "${endCursor}"` : ''}) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                    id
                    title
                    description
                    productType
                    handle
                    onlineStoreUrl
                    images(first: 1) {
                      edges {
                        node {
                          url
                        }
                      }
                    }
                    variants(first: 1) {
                      edges {
                        node {
                          id
                          price {
                            amount
                            currencyCode
                          }
                          compareAtPrice {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                    tags
                  }
                }
              }
            }
            `;

      const response = await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': ACCESS_TOKEN,
        },
        body: JSON.stringify({ query }),
      });

      const json = await response.json();

      if (json.errors) {
        console.error("Shopify GraphQL Errors:", json.errors);
        break;
      }

      const pageInfo = json.data?.products?.pageInfo || {};
      const edges = json.data?.products?.edges || [];

      allEdges.push(...edges);
      hasNextPage = pageInfo.hasNextPage || false;
      endCursor = pageInfo.endCursor || null;

      console.log(`Fetched ${edges.length} products. Total so far: ${allEdges.length}. Has next: ${hasNextPage}`);
    }

    cachedProducts = allEdges.map((edge: any) => {
      const node = edge.node;
      const price = node.variants.edges[0]?.node?.price;
      const compareAtPrice = node.variants.edges[0]?.node?.compareAtPrice;
      const image = node.images.edges[0]?.node?.url;

      return {
        id: node.id,
        name: node.title,
        url: node.onlineStoreUrl || `https://${SHOPIFY_DOMAIN}/products/${node.handle}`,
        imageUrl: image || 'https://placehold.co/200x200?text=No+Image',
        description: node.description,
        suitableFor: node.tags || [],
        keyIngredients: [],
        variantId: node.variants.edges[0]?.node?.id,
        price: price ? `${price.currencyCode} ${parseFloat(price.amount).toFixed(2)}` : 'N/A',
        originalPrice: compareAtPrice ? `${compareAtPrice.currencyCode} ${parseFloat(compareAtPrice.amount).toFixed(2)}` : undefined,
        productType: node.productType
      };
    });

    console.log(`✅ Fetched total ${cachedProducts.length} products from Shopify`);

    // Save to localStorage
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cachedProducts));
      localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      console.warn("Failed to save to localStorage cache", e);
    }

    return cachedProducts || [];
  } catch (error) {
    console.error("Failed to fetch products from Shopify:", error);
    return [];
  }
}
