// api/index.js
require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');
const dbConnection = require('../config/db'); 
const auth = require('../routes/auth');
const client = require('../routes/client');
const billRoutes = require('../routes/billRoutes');
const serviceBillRoutes = require('../routes/serviceBillRoutes');
const emailRoutes = require('../routes/emailRoutes');
const pdfRoutes = require('../routes/pdfRoutes');
const proformaRoutes = require('../routes/proformaRoutes');

const PORT = process.env.PORT || 5000;

dbConnection();

// ✅ CORS - सबसे open तरीका (cPanel hosting के लिए)
app.use((req, res, next) => {
  // ✅ Allow all origins for cPanel
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  
  // ✅ Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', auth);
app.use('/api/client', client);
app.use('/api/bills', billRoutes);
app.use('/api/service-bills', serviceBillRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/proforma', proformaRoutes);

app.get('/', (req, res) => {
  res.status(200).json({
    status: "success",
    message: "ViralCRM Backend is Live!",
    timestamp: new Date()
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});