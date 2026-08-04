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

// ✅ CORS - इस तरह करो (बिना app.options के)
app.use(cors({
  origin: [
    'https://crm.viralcrm.in',
    'http://crm.viralcrm.in',
    'https://www.viralcrm.in', 
    'http://www.viralcrm.in', 
    'https://viralcrm.in', 
    'http://viralcrm.in', 
    'http://localhost:5174', 
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// ❌ इस line को हटाओ - यही login तोड़ रहा है
// app.options('*', cors());  // <-- इसे हटाओ

app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
    message: "ViralCRM Backend is Live and Running perfectly!",
    timestamp: new Date()
  });
});

app.get('/uploads/debug-test', (req, res) => {
  res.send('Static middleware is active!');
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});