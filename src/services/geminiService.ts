import { SkinConditionCategory, ProductRecommendation, SkincareRoutine, HairProfileData } from '../types';

const API_BASE_URL = import.meta.env?.VITE_API_URL || '';

export interface AnalysisResponse {
    analysis: SkinConditionCategory[] | null;
    error?: 'irrelevant_image' | string | null;
    message?: string | null;
}

// --- Skin Analysis (Face) ---
export const analyzeSkin = async (
    imagesBase64: string[],
    sessionContext?: { sessionId: string; email: string; phone: string }
): Promise<SkinConditionCategory[]> => {
    console.log(`Starting skin analysis via backend...`);
    try {
        const response = await fetch(`${API_BASE_URL}/api/analyze-skin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                images: imagesBase64,
                ...(sessionContext || {})
            })
        });
        if (!response.ok) throw new Error('Backend analysis failed');
        return await response.json();
    } catch (error) {
        console.error("Error in analyzeSkin bridge:", error);
        return [];
    }
};

// --- Hair Analysis (AI Trichologist) ---
export const analyzeHair = async (
    imagesBase64: string[],
    sessionContext?: { sessionId: string; email: string; phone: string }
): Promise<AnalysisResponse> => {
    console.log(`Starting hair analysis via backend...`);
    try {
        const response = await fetch(`${API_BASE_URL}/api/analyze-hair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                images: imagesBase64,
                ...(sessionContext || {})
            })
        });
        if (!response.ok) throw new Error('Backend hair analysis failed');
        return await response.json();
    } catch (error) {
        console.error("Error in analyzeHair bridge:", error);
        throw new Error("Failed to analyze hair & scalp image via backend.");
    }
};

// --- Skin Recommendation ---
export const getSkincareRoutine = async (analysis: SkinConditionCategory[], goals: string[]): Promise<ProductRecommendation[]> => {
    console.log(`Fetching skincare routine from backend...`);
    try {
        const response = await fetch(`${API_BASE_URL}/api/recommend-skin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analysis, goals })
        });
        if (!response.ok) throw new Error('Backend recommendation failed');
        return await response.json();
    } catch (error) {
        console.error("Error in getSkincareRoutine bridge:", error);
        return [];
    }
};

// --- Hair Recommendation ---
export const getHairCareRoutine = async (
    hairProfile: Partial<HairProfileData>,
    analysis: SkinConditionCategory[],
    goals: string[]
): Promise<ProductRecommendation[]> => {
    console.log(`Fetching haircare routine from backend...`);
    try {
        const response = await fetch(`${API_BASE_URL}/api/recommend-hair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hairProfile, analysis, goals })
        });
        if (!response.ok) throw new Error('Backend hair recommendation failed');
        return await response.json();
    } catch (error) {
        console.error("Error in getHairCareRoutine bridge:", error);
        throw new Error("Failed to generate haircare routine via backend.");
    }
};

// --- Chat with AI ---
export const chatWithAI = async (query: string, context: { analysis: any, recommendations: any }): Promise<string> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, context })
        });
        if (!response.ok) throw new Error('Backend chat failed');
        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error("Error in chatWithAI bridge:", error);
        return "I'm sorry, I'm having trouble answering that right now.";
    }
};

// --- Doctor Report (returns HTML string now instead of URL) ---
export const getDoctorReport = async (
    analysis: SkinConditionCategory[],
    recommendations: ProductRecommendation[],
    type: 'skin' | 'hair',
    goals: string[] = [],
    userImage?: string,
    userInfo?: any
): Promise<string> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/doctor-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analysis, recommendations, goals, type, userImage, userInfo })
        });
        if (!response.ok) throw new Error('Backend report generation failed');
        const data = await response.json();

        // Open report HTML in a new tab for printing
        if (data.reportHtml) {
            const blob = new Blob([data.reportHtml], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        }

        return data.summary || data.text || "Report generated successfully.";
    } catch (error) {
        console.error("Error in getDoctorReport bridge:", error);
        return "Failed to generate doctor report via backend.";
    }
};

// --- User Tracking ---
export const trackUserSession = async (data: any): Promise<any> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            console.warn('Backend tracking failed. This does not affect user experience.');
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error("Error in trackUserSession bridge:", error);
        return null;
    }
};
