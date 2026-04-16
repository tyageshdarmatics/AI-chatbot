import { Router } from 'express';
import { generateContentWithFailover, base64ToPart, SchemaType } from '../services/aiService.js';
import { uploadMultipleImagesToS3 } from '../services/s3UploadService.js';
import User from '../models/User.js';

const router = Router();

/**
 * POST /api/analyze-skin
 * Body: { images: ["base64_string_1", ...], sessionId?, email?, phone? }
 */
router.post('/analyze-skin', async (req, res) => {
    try {
        const { images, sessionId, email, phone } = req.body;

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: "Please provide an array of base64 images in the 'images' field." });
        }

        // Upload images to S3 in parallel with analysis
        let s3ImagesMeta = [];
        const s3UploadPromise = (async () => {
            try {
                if (process.env.AWS_S3_BUCKET_NAME) {
                    s3ImagesMeta = await uploadMultipleImagesToS3(images, 'analysis-input');
                    console.log(`- S3: Uploaded ${s3ImagesMeta.length} skin analysis images`);
                }
            } catch (err) {
                console.error('- S3 UPLOAD ERROR (non-blocking):', err.message);
            }
        })();

        const imageParts = images.map(img => base64ToPart(img));

        const prompt = `You are an expert dermatologist. Analyze these facial images VERY CAREFULLY and detect ALL visible skin conditions.
    
        **CRITICAL INSTRUCTIONS:**
        1. Look at EVERY visible area of the skin - forehead, cheeks, nose, chin, temples, jaw.
        2. Detect EVERYTHING visible - even minor issues count.
        3. Do NOT skip or miss any visible skin problems.
        4. Provide accurate bounding boxes for EVERY condition you detect.
        
        **Conditions to look for (be thorough):**
        - Acne, pustules, comedones, whiteheads, blackheads, pimples
        - Redness, inflammation, irritation, rosacea
        - Wrinkles, fine lines, crow's feet, forehead lines
        - Dark circles, under-eye bags, puffiness
        - Dark spots, hyperpigmentation, sun spots, melasma
        - Texture issues, rough patches, bumps, enlarged pores
        - Dryness, flakiness, dehydration, dry patches
        - Oiliness, shine, sebum buildup
        - Scarring, post-acne marks, depressed scars
        - Uneven skin tone, patches of different color
        - Other visible conditions (BUT EXCLUDE normal facial hair)
    
        **EXCLUSIONS (Do NOT report these as conditions):**
        - Normal facial hair, beard, mustache, stubble.
        - Do NOT tag "Facial Hair" or "Stubble" as a skin condition unless it is specifically folliculitis or ingrown hairs.
        
        **Condition Extraction & Grouping (CRITICAL):**
        - Do NOT create duplicate condition entries! Group identical conditions found in the same location into a single JSON object.
        - For example: If you find 5 acne papules on the "Right Mid-Cheek", create ONLY ONE condition object named "Inflamed Acne Papule" for that location. Place ALL 5 bounding boxes inside that single object's 'boundingBoxes' array.
        
        **For EACH unique condition in a specific location:**
        1. Create a descriptive name (e.g., "Acne Pustules", "Deep Forehead Wrinkles", "Dark Spots on Cheeks")
        2. Rate confidence 0-100 (how sure are you)
        3. Specify exact location (Forehead, Left Cheek, Right Cheek, Nose, Chin, Under Eyes, Temple, Jaw, etc.)
        4. MANDATORY: A very short, one-sentence description of the problem.
        5. MANDATORY: Add bounding boxes for EVERY visible instance of this condition to the 'boundingBoxes' array using normalized coordinates (0.0-1.0):
           - x1, y1 = top-left corner
           - x2, y2 = bottom-right corner
           - Example: if acne is on left cheek, draw box around that area, if 5 acne papules are on the left cheek, the 'boundingBoxes' array MUST contain 5 separate boxes.
        
        **Grouping Strategy:**
        - Group similar conditions into categories (e.g., "Acne & Blemishes", "Signs of Aging", "Pigmentation Issues", "Texture & Pores")
        - Create new categories as needed based on what you see

        Provide output in JSON format. Do NOT return empty arrays for boundingBoxes - every condition MUST have visible boxes.`;

        const response = await generateContentWithFailover({
            model: 'gemini-2.5-flash',
            contents: { parts: [...imageParts, { text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            category: { type: SchemaType.STRING },
                            conditions: {
                                type: SchemaType.ARRAY,
                                items: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        name: { type: SchemaType.STRING },
                                        confidence: { type: SchemaType.NUMBER },
                                        location: { type: SchemaType.STRING },
                                        description: { type: SchemaType.STRING },
                                        boundingBoxes: {
                                            type: SchemaType.ARRAY,
                                            items: {
                                                type: SchemaType.OBJECT,
                                                properties: {
                                                    imageId: { type: SchemaType.NUMBER },
                                                    box: {
                                                        type: SchemaType.OBJECT,
                                                        properties: { x1: { type: SchemaType.NUMBER }, y1: { type: SchemaType.NUMBER }, x2: { type: SchemaType.NUMBER }, y2: { type: SchemaType.NUMBER } },
                                                        required: ["x1", "y1", "x2", "y2"]
                                                    }
                                                },
                                                required: ["imageId", "box"]
                                            }
                                        }
                                    },
                                    required: ["name", "confidence", "location", "description", "boundingBoxes"]
                                }
                            }
                        },
                        required: ["category", "conditions"]
                    }
                }
            }
        });

        let result = response.text ? JSON.parse(response.text.trim()) : [];

        // Deduplicate conditions
        if (Array.isArray(result)) {
            result = result.map(categoryItem => {
                if (!categoryItem.conditions) return categoryItem;
                const conditionMap = new Map();
                categoryItem.conditions.forEach(cond => {
                    const key = `${cond.name}_${cond.location}`.toLowerCase();
                    if (conditionMap.has(key)) {
                        const existing = conditionMap.get(key);
                        if (cond.boundingBoxes) {
                            existing.boundingBoxes.push(...cond.boundingBoxes);
                        }
                    } else {
                        conditionMap.set(key, { ...cond, boundingBoxes: cond.boundingBoxes ? [...cond.boundingBoxes] : [] });
                    }
                });
                return { ...categoryItem, conditions: Array.from(conditionMap.values()) };
            });
        }

        // Wait for S3 upload to complete and save image references to user session
        await s3UploadPromise;
        if (s3ImagesMeta.length > 0 && sessionId && email && phone) {
            try {
                const user = await User.findOne({ email, phone });
                if (user) {
                    const session = user.history.find(s => s.sessionId === sessionId);
                    if (session) {
                        session.images = [...(session.images || []), ...s3ImagesMeta];
                        session.lastUpdated = new Date();
                        user.markModified('history');
                        await user.save();
                        console.log(`- DB: Saved ${s3ImagesMeta.length} image refs to user session`);
                    }
                }
            } catch (dbErr) {
                console.error('- DB IMAGE SAVE ERROR (non-blocking):', dbErr.message);
            }
        }

        res.json(result);

    } catch (error) {
        console.error("Error analyzing skin:", error);
        res.status(500).json({ error: "Failed to analyze skin", details: error.message });
    }
});

/**
 * POST /api/analyze-hair
 * Body: { images: ["base64_string_1", ...], sessionId?, email?, phone? }
 */
router.post('/analyze-hair', async (req, res) => {
    try {
        const { images, sessionId, email, phone } = req.body;

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: "Please provide an array of base64 images in the 'images' field." });
        }

        // Upload images to S3 in parallel
        let s3ImagesMeta = [];
        const s3UploadPromise = (async () => {
            try {
                if (process.env.AWS_S3_BUCKET_NAME) {
                    s3ImagesMeta = await uploadMultipleImagesToS3(images, 'analysis-input');
                    console.log(`- S3: Uploaded ${s3ImagesMeta.length} hair analysis images`);
                }
            } catch (err) {
                console.error('- S3 UPLOAD ERROR (non-blocking):', err.message);
            }
        })();

        const imageParts = images.map(img => base64ToPart(img));

        const prompt = `You are an expert AI trichologist. Your task is to analyze images of a person's hair and scalp in detail.

        **Step 1: Image Validity Check**
        First, determine if the uploaded image(s) clearly show a human head, hair, or scalp. 
        - If images are NOT relevant (e.g., objects, flowers, blurry, unrecognizable), return a JSON object with "error": "irrelevant_image".
        - If images ARE relevant, proceed to Step 2.
        
        **Step 2: Detailed Analysis**
        Analyze the relevant images for specific hair and scalp conditions.
        
        **Reference List of Conditions to Detect:**
        Use these specific medical/cosmetic terms where applicable, but rely on your vision.
        
        1. **Hair Loss Types:**
           - **Androgenetic Alopecia:** Look for receding hairline (M-shape) or vertex thinning in men; widening part line or diffuse thinning in women.
           - **Telogen Effluvium:** General diffuse thinning without distinct bald patches.
           - **Alopecia Areata:** Distinct, round, smooth bald patches.
           - **Traction Alopecia:** Hair loss along the hairline due to tension.
           - **Cicatricial Alopecia:** Signs of scarring or inflammation associated with hair loss.
        
        2. **Scalp Conditions:**
           - **Seborrheic Dermatitis:** Redness, greasy yellow scales/flakes.
           - **Pityriasis Capitis (Dandruff):** Dry, white flakes, non-inflamed.
           - **Folliculitis:** Red, inflamed bumps around hair follicles.
           - **Psoriasis:** Thick, silvery scales on red patches.
        
        3. **Hair Shaft & Quality:**
           - **Trichorrhexis Nodosa / Breakage:** Visible snapping or white nodes on the hair shaft.
           - **Split Ends:** Fraying at the tips.
           - **Frizz / Dryness:** Lack of definition, rough texture.
        
        **Dynamic Categorization Strategy:**
        - Group your findings dynamically based on what you detect (e.g., "Hair Loss Patterns", "Scalp Health", "Hair Quality").
        - **Male vs Female:** Explicitly look for gender-specific patterns (e.g., Receding Hairline vs Widening Part) and name them accordingly.
        
        **Output Requirements for each Condition:**
        1. **Name:** Use specific terms from the reference list above (e.g., "Androgenetic Alopecia (Stage 2)", "Severe Dandruff", "Receding Hairline").
        2. **Confidence:** 0-100 score.
        3. **Location:** Specific area (e.g., "Left Temple", "Crown", "Nape", "Part Line").
        4. **Description:** A very short, one-sentence description of the problem.
        5. **Bounding Boxes:** 
           - **MANDATORY VISUALIZATION TASK:** If you detect any Hair Loss (including Receding Hairline, Thinning, or Alopecia), you **MUST** return a bounding box.
           - Draw the box around the entire receding area or bald spot.
           - Use normalized coordinates (0.0 - 1.0).
           - Do NOT return empty bounding boxes for visible conditions.
        
        Provide the output strictly in JSON format according to the provided schema.`;

        const response = await generateContentWithFailover({
            model: 'gemini-2.5-flash',
            contents: { parts: [...imageParts, { text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        analysis: {
                            type: SchemaType.ARRAY,
                            nullable: true,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    category: { type: SchemaType.STRING },
                                    conditions: {
                                        type: SchemaType.ARRAY,
                                        items: {
                                            type: SchemaType.OBJECT,
                                            properties: {
                                                name: { type: SchemaType.STRING },
                                                confidence: { type: SchemaType.NUMBER },
                                                location: { type: SchemaType.STRING },
                                                description: { type: SchemaType.STRING },
                                                boundingBoxes: {
                                                    type: SchemaType.ARRAY,
                                                    items: {
                                                        type: SchemaType.OBJECT,
                                                        properties: {
                                                            imageId: { type: SchemaType.NUMBER },
                                                            box: {
                                                                type: SchemaType.OBJECT,
                                                                properties: { x1: { type: SchemaType.NUMBER }, y1: { type: SchemaType.NUMBER }, x2: { type: SchemaType.NUMBER }, y2: { type: SchemaType.NUMBER } },
                                                                required: ["x1", "y1", "x2", "y2"]
                                                            }
                                                        },
                                                        required: ["imageId", "box"]
                                                    }
                                                }
                                            },
                                            required: ["name", "confidence", "location", "description", "boundingBoxes"]
                                        }
                                    }
                                },
                                required: ["category", "conditions"]
                            }
                        },
                        error: { type: SchemaType.STRING, nullable: true },
                        message: { type: SchemaType.STRING, nullable: true }
                    },
                    required: ["analysis"]
                }
            }
        });

        const result = response.text ? JSON.parse(response.text.trim()) : {};

        // Save S3 image refs to user session
        await s3UploadPromise;
        if (s3ImagesMeta.length > 0 && sessionId && email && phone) {
            try {
                const user = await User.findOne({ email, phone });
                if (user) {
                    const session = user.history.find(s => s.sessionId === sessionId);
                    if (session) {
                        session.images = [...(session.images || []), ...s3ImagesMeta];
                        session.lastUpdated = new Date();
                        user.markModified('history');
                        await user.save();
                    }
                }
            } catch (dbErr) {
                console.error('- DB IMAGE SAVE ERROR (non-blocking):', dbErr.message);
            }
        }

        res.json(result);

    } catch (error) {
        console.error("Error analyzing hair:", error);
        res.status(500).json({ error: "Failed to analyze hair", details: error.message });
    }
});

export default router;
