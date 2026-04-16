import { Router } from 'express';
import { uploadMultipleImagesToS3 } from '../services/s3UploadService.js';

const router = Router();

/**
 * POST /api/upload-images
 * Body: { images: ["base64_string_1", ...], context?: "analysis-input" }
 * Returns: Array of S3 image metadata objects
 */
router.post('/upload-images', async (req, res) => {
    try {
        const { images, context } = req.body;

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: "Please provide an array of base64 images." });
        }

        if (!process.env.AWS_S3_BUCKET_NAME) {
            return res.status(500).json({ error: "S3 bucket not configured on the server." });
        }

        const results = await uploadMultipleImagesToS3(images, context || 'analysis-input');
        res.json({ status: "success", images: results });

    } catch (error) {
        console.error("Error uploading images:", error);
        res.status(500).json({ error: "Failed to upload images", details: error.message });
    }
});

export default router;
