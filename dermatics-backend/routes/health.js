import { Router } from 'express';
const router = Router();

router.get('/health', (req, res) => {
    res.status(200).json({
        status: "success",
        message: "AI Server is awake and running!"
    });
});

export default router;
