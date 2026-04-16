import { GoogleGenAI } from '@google/genai';

const rawApiKeys = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY;

if (!rawApiKeys) {
    console.error("--- DEPLOYMENT ERROR ---");
    console.error("Missing AI API Key! Set GEMINI_API_KEY in environment.");
}

const apiKeys = (rawApiKeys || '').split(',').map(key => key.trim()).filter(key => key);
const aiInstances = apiKeys.map(apiKey => new GoogleGenAI({ apiKey }));

export const SchemaType = {
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    OBJECT: 'object',
    ARRAY: 'array'
};

/**
 * Attempts to generate content using a pool of AI instances with failover.
 */
export async function generateContentWithFailover(params) {
    let lastError = null;
    for (let i = 0; i < aiInstances.length; i++) {
        const ai = aiInstances[i];
        try {
            return await ai.models.generateContent(params);
        } catch (error) {
            lastError = error;
            console.warn(`API key ${i + 1}/${aiInstances.length} failed: ${lastError.message}`);
            const errorMessage = lastError.message.toLowerCase();
            const isRetriable =
                errorMessage.includes('api key not valid') ||
                errorMessage.includes('quota') ||
                errorMessage.includes('internal error') ||
                errorMessage.includes('500') ||
                errorMessage.includes('503');
            if (!isRetriable) throw lastError;
        }
    }
    throw new Error(`All ${aiInstances.length} API keys failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

export const base64ToPart = (base64String, mimeType = 'image/jpeg') => ({
    inlineData: { mimeType, data: base64String }
});
