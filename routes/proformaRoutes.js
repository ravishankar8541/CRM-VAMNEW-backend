// routes/proformaRoutes.js
const express = require('express');
const router = express.Router();
const {
    createProforma,
    getProformas,
    getProformaById,
    updateProforma,
    updateProformaStatus,
    deleteProforma,
    getProformaStats,
    generateProformaPDF
} = require('../controllers/proformaController');

// Auth middleware
const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            req.user = { username: 'System', _id: 'system' };
            return next();
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        req.user = { username: 'System', _id: 'system' };
        next();
    }
};

router.use(authMiddleware);

// Routes
router.post('/create', createProforma);
router.get('/all', getProformas);
router.get('/stats', getProformaStats);
router.get('/:id', getProformaById);
router.put('/:id', updateProforma);
router.put('/:id/status', updateProformaStatus);
router.delete('/:id', deleteProforma);
router.get('/:id/pdf', generateProformaPDF); // PDF generation route

// Test route
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Proforma routes are working!' });
});

module.exports = router;