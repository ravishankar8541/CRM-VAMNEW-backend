const express = require('express');
const authMiddleware = require('../middleware/auth');
const {
    addClient, 
    clients, 
    editClient, 
    deleteClient
} = require('../controllers/clientController');

const router = express.Router();

// ✅ IMPORTANT: Auth middleware for all routes
router.use(authMiddleware);

// Routes
router.post('/add', addClient);
router.get('/clients', clients);
router.put('/edit/:id', editClient);
router.delete('/delete/:id', deleteClient);

module.exports = router;