import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const s3Client = new S3Client({
    region: process.env.AWS_S3_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

/**
 * Uploads a base64 image to S3 and returns metadata matching the required schema.
 * @param {string} base64Data - Raw base64 string (no data URI prefix)
 * @param {string} originalName - Original filename or generated name
 * @param {string} context - Context tag e.g. "analysis-input"
 * @returns {Promise<object>} - Image metadata object for MongoDB
 */
export async function uploadImageToS3(base64Data, originalName, context = 'analysis-input') {
    const buffer = Buffer.from(base64Data, 'base64');
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    const timestamp = Date.now();
    const ext = originalName?.split('.').pop() || 'jpg';
    const s3Key = `uploads/analysis/${timestamp}-${hash}.${ext}`;

    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType,
    }));

    return {
        originalName: originalName || `capture-${timestamp}.${ext}`,
        s3Key,
        mimeType,
        size: buffer.length,
        context,
        createdAt: new Date(),
    };
}

/**
 * Uploads multiple base64 images to S3.
 * @param {string[]} base64Images - Array of raw base64 strings
 * @param {string} context - Context tag
 * @returns {Promise<object[]>} - Array of image metadata objects
 */
export async function uploadMultipleImagesToS3(base64Images, context = 'analysis-input') {
    const results = [];
    for (let i = 0; i < base64Images.length; i++) {
        const name = `capture-${Date.now() + i}.jpg`;
        const metadata = await uploadImageToS3(base64Images[i], name, context);
        results.push(metadata);
    }
    return results;
}
