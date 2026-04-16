import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
    originalName: { type: String },
    s3Key: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    context: { type: String, default: 'analysis-input' },
    createdAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    age: { type: Number },
    history: [{
        sessionId: { type: String, required: true },
        hairProfileData: { type: mongoose.Schema.Types.Mixed },
        analysisResult: [{ type: mongoose.Schema.Types.Mixed }],
        haircareGoals: [{ type: String }],
        recommendation: { type: mongoose.Schema.Types.Mixed },
        routineTitle: { type: String },
        images: [imageSchema],
        chatHistory: [{
            id: { type: String },
            sender: { type: String },
            text: { type: String }
        }],
        date: { type: Date, default: Date.now },
        lastUpdated: { type: Date, default: Date.now }
    }],
    lastActiveAt: { type: Date, default: Date.now }
}, { timestamps: true });

userSchema.index({ email: 1, phone: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
export default User;
