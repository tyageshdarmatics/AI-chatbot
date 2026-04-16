import { Router } from 'express';
import User from '../models/User.js';
import { uploadMultipleImagesToS3 } from '../services/s3UploadService.js';

const router = Router();

/**
 * POST /api/user/track
 * Body: { name, email, phone, age, sessionId, action, data }
 * data.images (optional): array of base64 strings to upload to S3
 */
router.post('/user/track', async (req, res) => {
    try {
        const { name, email, phone, age, sessionId, action, data } = req.body;

        if (!email || !phone || !name || !sessionId) {
            return res.status(400).json({ error: "Missing required fields: name, email, phone, sessionId" });
        }

        let user = await User.findOne({ email, phone });

        if (user) {
            if (user.name.toLowerCase() !== name.toLowerCase()) {
                return res.status(400).json({
                    error: "Validation failed: This email and phone number are already registered under a different name."
                });
            }
        } else {
            user = new User({ name, email, phone, age, history: [] });
        }

        user.lastActiveAt = new Date();

        let session = user.history.find(s => s.sessionId === sessionId);
        if (!session) {
            session = { sessionId, chatHistory: [], images: [] };
            user.history.push(session);
            session = user.history[user.history.length - 1];
        }

        if (action === 'init_session') {
            if (data?.hairProfileData) session.hairProfileData = data.hairProfileData;
        } else if (action === 'update_analysis') {
            if (data?.analysisResult) session.analysisResult = data.analysisResult;
            if (data?.haircareGoals) session.haircareGoals = data.haircareGoals;
        } else if (action === 'update_recommendation') {
            if (data?.recommendation) session.recommendation = data.recommendation;
            session.routineTitle = "Your Plan";
        } else if (action === 'add_chat') {
            if (data?.chatMessage) {
                const exists = session.chatHistory.some(c => c.id === data.chatMessage.id);
                if (!exists) session.chatHistory.push(data.chatMessage);
            }
        } else if (action === 'upload_images') {
            // Upload images to S3 and save metadata
            if (data?.images && Array.isArray(data.images) && data.images.length > 0) {
                try {
                    if (process.env.AWS_S3_BUCKET_NAME) {
                        const s3Meta = await uploadMultipleImagesToS3(data.images, data.context || 'analysis-input');
                        session.images = [...(session.images || []), ...s3Meta];
                        console.log(`- S3/TRACK: Uploaded ${s3Meta.length} images for user ${email}`);
                    }
                } catch (s3Err) {
                    console.error('- S3 UPLOAD ERROR in track:', s3Err.message);
                }
            }
        }

        session.lastUpdated = new Date();
        user.markModified('history');

        await user.save();
        res.status(200).json({ status: "success", userId: user._id });

    } catch (error) {
        console.error("Tracking Error (/api/user/track):", error);
        res.status(500).json({ error: "Failed to track user session" });
    }
});

export default router;
