import 'dotenv/config';
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
});

import express from 'express';
import cors from 'cors';

import mongoose from 'mongoose';
import serverless from 'serverless-http';

// Route imports
import healthRoutes from './routes/health.js';
import analysisRoutes from './routes/analysis.js';
import recommendationRoutes from './routes/recommendation.js';
import reportRoutes from './routes/report.js';
import userRoutes from './routes/user.js';
import chatRoutes from './routes/chat.js';
import catalogRoutes from './routes/catalog.js';
import uploadRoutes from './routes/upload.js';



// Connect to MongoDB (reuse connection across Lambda invocations)
let isConnected = false;
async function connectDB() {
    if (isConnected) return;
    if (process.env.MONGO_URI) {
        try {
            await mongoose.connect(process.env.MONGO_URI);
            isConnected = true;
            console.log('- INFO: Connected to MongoDB');
        } catch (err) {
            console.error('- ERROR: MongoDB connection error:', err);
        }
    } else {
        console.warn('- WARNING: MONGO_URI missing. Tracking disabled.');
    }
}

const app = express();

// Middleware
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

app.use(express.json({ limit: '50mb' }));

// Ensure DB connection before processing requests
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Routes
app.use('/api', healthRoutes);
app.use('/api', analysisRoutes);
app.use('/api', recommendationRoutes);
app.use('/api', reportRoutes);
app.use('/api', userRoutes);
app.use('/api', chatRoutes);
app.use('/api', catalogRoutes);
app.use('/api', uploadRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// --- Lambda Handler Export ---
export const handler = serverless(app);

// --- Local Development Server ---
if (process.env.NODE_ENV !== 'production' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Routes: /api/health, /api/analyze-skin, /api/analyze-hair, /api/recommend-skin, /api/recommend-hair, /api/doctor-report, /api/chat, /api/user/track, /api/upload-images');

        // Startup catalog warming
        import('./services/catalogBuilder.js').then(() => {
            import('./services/shopifySyncService.js').then(({ syncAllProductsFromShopify }) => {
                import('./services/catalogCacheService.js').then(({ saveCatalogsToCache }) => {
                    import('./services/catalogBuilder.js').then(({ buildPreparedCatalogs }) => {
                        const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
                        const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
                        if (SHOPIFY_DOMAIN && ACCESS_TOKEN) {
                            console.log('- INFO: Warming up catalog cache...');
                            syncAllProductsFromShopify(SHOPIFY_DOMAIN, ACCESS_TOKEN)
                                .then(raw => {
                                    const catalogs = buildPreparedCatalogs(raw);
                                    return saveCatalogsToCache(catalogs);
                                })
                                .catch(e => console.error('- STARTUP SYNC ERR:', e.message));
                        }
                    });
                });
            });
        });
    });
}
