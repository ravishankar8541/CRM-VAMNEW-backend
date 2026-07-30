const ProformaInvoice = require('../models/ProformaInvoice');
const Client = require('../models/Client');
const QRCode = require('qrcode');

// ==================== SAFE PROFORMA NUMBER GENERATOR ====================
const generateProformaNumber = async () => {
  try {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `PROF/${year}/${month}/`;

    const latest = await ProformaInvoice
      .findOne({ proformaNumber: { $regex: `^${prefix}` } })
      .sort({ proformaNumber: -1 })
      .select('proformaNumber')
      .lean();

    let sequence = 1;

    if (latest && latest.proformaNumber) {
      const parts = latest.proformaNumber.split('/');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  } catch (error) {
    console.error('Error generating proforma number:', error);
    return `PROF/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${Date.now().toString().slice(-4)}`;
  }
};

// ==================== GENERATE PDF FUNCTION ====================
const generatePDFHTML = async (proforma) => {
  const client = {
    name: proforma.clientName || proforma.contactPerson || 'Client',
    companyName: proforma.companyName || proforma.clientName,
    email: proforma.contactEmail || '',
    phone: proforma.contactPhone || '',
    address: proforma.clientAddress || '',
    gstNumber: proforma.clientGst || ''
  };

  let qrCodeDataURL = null;
  try {
    const upiString = `upi://pay?pa=viraladsmedia@aubank&pn=${encodeURIComponent('VIRAL ADS MEDIA')}&am=${proforma.totalAmount || 0}&cu=INR&tn=${encodeURIComponent(`Proforma ${proforma.proformaNumber}`)}`;
    qrCodeDataURL = await QRCode.toDataURL(upiString, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H'
    });
  } catch (e) {
    console.error('QR generation failed:', e);
  }

  const companyDetails = {
    name: "Viral Ads Media",
    address: "B-27, Khatu shyam Mandir Road, near Max Bazar, Budh Vihar Phase I, New Delhi, Delhi, India - 110086",
    gstin: "07DTXPK7339P1ZF",
    pan: "DTXPK7339P",
    email: "info@viraladsmedia.com",
    phone: "+91 93544 91934",
    bankDetails: {
      accountName: "VIRAL ADS MEDIA",
      accountNumber: "2402244856193850",
      ifsc: "AUBL0002448",
      accountType: "Current",
      bank: "AU Small Finance Bank"
    }
  };

  const totalAmount = parseFloat(proforma.totalAmount) || 0;
  const subtotal = parseFloat(proforma.subtotal) || 0;
  const gstAmount = parseFloat(proforma.totalGstAmount) || 0;
  const gstPercentage = parseFloat(proforma.gstPercentage) || 0;
  const taxType = proforma.taxType || 'CGST+SGST';
  const isIGST = taxType === 'IGST';
  const cgstAmount = isIGST ? 0 : Math.round(gstAmount / 2);
  const sgstAmount = isIGST ? 0 : Math.round(gstAmount / 2);
  const igstAmount = isIGST ? gstAmount : 0;

  const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amt) =>
    `₹${(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const amountToWords = (amount) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const numToWords = (num) => {
      if (num === 0) return 'Zero';
      if (num < 20) return ones[num];
      if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
      if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numToWords(num % 100) : '');
      if (num < 100000) return numToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numToWords(num % 1000) : '');
      if (num < 10000000) return numToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numToWords(num % 100000) : '');
      return numToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numToWords(num % 10000000) : '');
    };
    
    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);
    return numToWords(rupees) + (paise > 0 ? ' and ' + numToWords(paise) + ' Paise' : '') + ' Rupees Only';
  };

  const totalAmountWords = amountToWords(totalAmount);
  const hsnSacCode = "998311";

  let serviceItemsHTML = '';
  (proforma.services || []).forEach((service) => {
    const serviceTotal = service.totalPrice || 0;
    const serviceGst = service.gstAmount || 0;
    const rate = service.gstRate || gstPercentage;

    serviceItemsHTML += `
      <tr class="border-b border-slate-200">
        <td class="px-4 py-3 text-sm font-semibold text-slate-800 text-left">
          ${service.serviceName || 'Service'}
          ${service.duration ? ` (${service.duration})` : ''}
        </td>
        <td class="px-4 py-3 text-sm font-medium text-slate-700 text-center">${hsnSacCode}</td>
        <td class="px-4 py-3 text-sm text-slate-600 text-center">
          ${isIGST ? `IGST (${rate}%)` : `CGST+SGST (${rate / 2}% + ${rate / 2}%)`}
        </td>
        <td class="px-4 py-3 text-sm text-slate-700 text-center">${formatCurrency(serviceGst)}</td>
        <td class="px-4 py-3 text-sm text-slate-700 text-center">${formatCurrency(serviceTotal)}</td>
        <td class="px-4 py-3 text-sm font-bold text-slate-800 text-right">${formatCurrency(serviceTotal + serviceGst)}</td>
      </tr>
      ${service.description ? `
        <tr class="border-b border-slate-200">
          <td colspan="6" class="px-4 py-2 text-xs text-slate-500 text-left pl-6">${service.description}</td>
        </tr>` : ''}
    `;
  });

  const getGSTBreakdown = () => {
    if (isIGST) {
      return `<div class="flex justify-between text-sm text-slate-600 py-1.5"><span>IGST (${gstPercentage}%)</span><span>${formatCurrency(igstAmount)}</span></div>`;
    }
    return `
      <div class="flex justify-between text-sm text-slate-600 py-1.5"><span>CGST (${(gstPercentage / 2).toFixed(1)}%)</span><span>${formatCurrency(cgstAmount)}</span></div>
      <div class="flex justify-between text-sm text-slate-600 py-1.5"><span>SGST (${(gstPercentage / 2).toFixed(1)}%)</span><span>${formatCurrency(sgstAmount)}</span></div>
    `;
  };

  const discountAmount = proforma.discount > 0
    ? (proforma.discountType === 'percentage'
        ? Math.round((subtotal * proforma.discount) / 100)
        : proforma.discount)
    : 0;

  const qrCodeHTML = qrCodeDataURL
    ? `<div class="text-center flex flex-col items-center bg-slate-50 border border-slate-200 rounded-lg p-4">
         <div class="text-xs text-orange-600 font-bold uppercase tracking-wider mb-1">Scan to pay via UPI</div>
         <div class="text-[9px] text-slate-500 max-w-[180px] leading-tight mb-2.5">Maximum of 1 lakh can be transferred via UPI in a single day</div>
         <img src="${qrCodeDataURL}" alt="UPI QR Code" class="w-28 h-28 border border-slate-200 rounded-md p-1.5 bg-white" />
         <div class="text-xs font-bold text-slate-800 mt-2 bg-white px-3 py-0.5 rounded-full border border-slate-200">viraladsmedia@aubank</div>
       </div>`
    : '';

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Proforma Invoice ${proforma.proformaNumber}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      @page { size: A4; margin: 0; }
      body { font-family: 'Inter', sans-serif; background: #f8fafc; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .invoice-container { width: 210mm; min-height: 297mm; margin: 0 auto; background: #ffffff; display: flex; flex-direction: column; gap: 30px; padding: 45px; }
      @media print { body { background: #ffffff; } .invoice-container { box-shadow: none; } }
    </style>
  </head>
  <body>
    <div class="invoice-container">
      <div>
        <div class="flex justify-between items-start border-b-2 border-slate-100 pb-5">
          <div>
            <h1 class="text-4xl font-extrabold tracking-tight text-orange-600 mb-2 uppercase">Proforma Invoice</h1>
            <div class="text-sm text-slate-600">Proforma No # <strong class="text-slate-800">${proforma.proformaNumber}</strong></div>
            <div class="text-sm text-slate-600">Date <strong class="text-slate-800">${formatDate(proforma.proformaDate || proforma.createdAt)}</strong></div>
          </div>
          <div>
            <img src="/logo3.png" alt="Viral Ads Media Logo"
                 style="width: 340px; height: auto; max-height: 150px; object-fit: contain;"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22120%22%3E%3Crect width=%22400%22 height=%22120%22 fill=%22%23f97316%22/%3E%3Ctext x=%2260%22 y=%2275%22 font-family=%22Arial%22 font-size=%2236%22 fill=%22white%22%3EViral Ads Media%3C/text%3E%3C/svg%3E'" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-6 mt-6 mb-6">
          <div class="bg-slate-50 border border-slate-100 rounded-lg p-5">
            <h2 class="text-xs font-bold uppercase tracking-wide text-orange-600 mb-2.5">Billed By</h2>
            <div class="text-base font-bold text-slate-800">${companyDetails.name}</div>
            <p class="text-xs text-slate-600 leading-relaxed">${companyDetails.address}</p>
            <p class="text-xs text-slate-600 mt-1.5"><strong>GSTIN:</strong> ${companyDetails.gstin}</p>
            <p class="text-xs text-slate-600"><strong>PAN:</strong> ${companyDetails.pan}</p>
            <p class="text-xs text-slate-600"><strong>Email:</strong> ${companyDetails.email}</p>
            <p class="text-xs text-slate-600"><strong>Phone:</strong> ${companyDetails.phone}</p>
          </div>
          <div class="bg-slate-50 border border-slate-100 rounded-lg p-5">
            <h2 class="text-xs font-bold uppercase tracking-wide text-orange-600 mb-2.5">Billed To</h2>
            <div class="text-base font-bold text-slate-800">${client.companyName || client.name}</div>
            <p class="text-xs text-slate-600">${client.address || 'N/A'}</p>
            ${client.gstNumber ? `<p class="text-xs text-slate-600 mt-1.5"><strong>GSTIN:</strong> ${client.gstNumber}</p>` : ''}
            <p class="text-xs text-slate-600"><strong>Phone:</strong> ${client.phone || ''}</p>
            <p class="text-xs text-slate-600"><strong>Email:</strong> ${client.email || ''}</p>
          </div>
        </div>

        <div class="mt-1">
          <table class="w-full border border-slate-200 rounded-lg overflow-hidden">
            <thead>
              <tr class="bg-orange-600 text-white">
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-left" style="width:40%">Item Description</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-center" style="width:12%">HSN/SAC</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-center" style="width:12%">GST Rate</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-center" style="width:12%">${isIGST ? 'IGST' : 'GST'}</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-center" style="width:12%">Taxable Amt</th>
                <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right" style="width:12%">Total</th>
              </tr>
            </thead>
            <tbody>
              ${serviceItemsHTML}
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex flex-col gap-6 mt-auto">
        <div class="flex justify-between items-start gap-5 border-b border-dashed border-slate-200 pb-5">
          <div class="text-xs font-medium text-slate-600 max-w-[55%] leading-relaxed bg-slate-50 px-4 py-3 rounded-lg">
            <strong>Total Amount in Words:</strong><br/>
            <span class="uppercase text-[11px] text-slate-800 font-semibold">${totalAmountWords}</span>
          </div>
          <div class="w-[40%]">
            <div class="flex justify-between text-sm text-slate-600 py-1.5">
              <span>Subtotal (Taxable)</span>
              <span class="font-semibold text-slate-800">${formatCurrency(subtotal)}</span>
            </div>
            ${gstPercentage > 0 ? getGSTBreakdown() : `<div class="flex justify-between text-sm text-slate-600 py-1.5"><span>GST (0%)</span><span>₹0.00</span></div>`}
            ${discountAmount > 0 ? `
              <div class="flex justify-between text-sm text-green-600 py-1.5">
                <span>Discount</span>
                <span>- ${formatCurrency(discountAmount)}</span>
              </div>` : ''}
            <div class="flex justify-between border-t-2 border-dashed border-orange-600 mt-2 pt-3 text-lg font-extrabold text-orange-600">
              <span>Total (INR)</span>
              <span>${formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-[1.25fr_0.75fr] gap-6 items-center">
          <div class="border border-slate-200 rounded-lg p-4 bg-white">
            <h3 class="text-xs font-bold uppercase tracking-wide text-slate-800 mb-3 border-b-2 border-slate-100 pb-1.5">Our Bank Details</h3>
            <table class="w-full">
              <tr><td class="border-none py-1 text-left text-xs font-semibold text-slate-500 w-[38%]">Account Name</td><td class="border-none py-1 text-left text-xs font-bold text-slate-800">${companyDetails.bankDetails.accountName}</td></tr>
              <tr><td class="border-none py-1 text-left text-xs font-semibold text-slate-500">Account Number</td><td class="border-none py-1 text-left text-xs font-bold text-slate-800">${companyDetails.bankDetails.accountNumber}</td></tr>
              <tr><td class="border-none py-1 text-left text-xs font-semibold text-slate-500">IFSC Code</td><td class="border-none py-1 text-left text-xs font-bold text-slate-800">${companyDetails.bankDetails.ifsc}</td></tr>
              <tr><td class="border-none py-1 text-left text-xs font-semibold text-slate-500">Account Type</td><td class="border-none py-1 text-left text-xs font-bold text-slate-800">${companyDetails.bankDetails.accountType}</td></tr>
              <tr><td class="border-none py-1 text-left text-xs font-bold text-slate-800">${companyDetails.bankDetails.bank}</td></tr>
            </table>
          </div>
          ${qrCodeHTML}
        </div>

        <div class="border-t-2 border-slate-100 pt-4">
          <a href="#" class="text-xs text-orange-600 font-bold uppercase tracking-wider no-underline inline-block mb-2">Terms & Conditions</a>
          <div class="text-[11px] text-slate-500 leading-relaxed mb-5">
            ${proforma.notes ? `Note: ${proforma.notes}<br/>` : ''}
            1. All payments should be made in favor of VIRAL ADS MEDIA.<br/>
            2. This is a Proforma Invoice and is not a Tax Invoice.
          </div>
          <div class="flex justify-end mb-4">
            <div class="text-right">
              <img src="/signature.png" alt="Authorised Signature" class="max-h-[55px] object-contain mb-1 ml-auto" />
              <div class="w-[180px] border-b-2 border-slate-800 my-1.5 ml-auto"></div>
              <p class="text-xs font-bold text-slate-800">Authorised Signatory</p>
              <span class="text-[10px] text-slate-500">For ${companyDetails.name}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
  </html>`;
};

// ==================== CREATE PROFORMA ====================
exports.createProforma = async (req, res) => {
  try {
    const {
      clientId,
      clientName,
      companyName,
      leadOwner,
      contactPerson,
      contactEmail,
      contactPhone,
      clientAddress,
      clientGst,
      services,
      description,
      notes,
      gstPercentage,
      taxType,
      discount,
      discountType,
      validUntil,
      pdfUrl
    } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'Client ID is required'
      });
    }

    if (!services || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one service is required'
      });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // ✅ Employee check: Agar employee hai aur client usne nahi banaya toh deny
    if (req.user && req.user.role === 'employee' && client.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only create proforma for your own clients.'
      });
    }

    const processedServices = [];
    let subtotal = 0;
    let totalGst = 0;
    const isIGST = taxType === 'IGST';
    const gstRate = parseFloat(gstPercentage) || 0;

    for (const service of services) {
      const quantity = parseFloat(service.quantity) || 1;
      const unitPrice = parseFloat(service.unitPrice) || 0;
      const totalPrice = quantity * unitPrice;
      const serviceGstRate = parseFloat(service.gstRate) || gstRate;
      const gstAmount = (totalPrice * serviceGstRate) / 100;

      subtotal += totalPrice;
      totalGst += gstAmount;

      processedServices.push({
        serviceName: service.serviceName || 'Unnamed Service',
        description: service.description || '',
        duration: service.duration || '',
        quantity: quantity,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        gstRate: serviceGstRate,
        gstAmount: gstAmount,
        cgst: isIGST ? 0 : gstAmount / 2,
        sgst: isIGST ? 0 : gstAmount / 2,
        igst: isIGST ? gstAmount : 0
      });
    }

    let discountAmount = 0;
    const disc = parseFloat(discount) || 0;
    if (disc > 0) {
      if (discountType === 'percentage') {
        discountAmount = (subtotal * disc) / 100;
      } else {
        discountAmount = disc;
      }
    }

    const totalAmount = subtotal + totalGst - discountAmount;

    let savedProforma = null;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        const proformaNumber = await generateProformaNumber();

        const newProforma = new ProformaInvoice({
          proformaNumber,
          clientId,
          clientName: clientName || client.name || '',
          companyName: companyName || client.companyName || '',
          leadOwner: leadOwner || client.leadOwner || '',
          contactPerson: contactPerson || client.name || '',
          contactEmail: contactEmail || client.email || '',
          contactPhone: contactPhone || client.phone || '',
          clientAddress: clientAddress || client.address || '',
          clientGst: clientGst || client.gstNumber || client.gst || '',
          services: processedServices,
          description: description || '',
          notes: notes || '',
          gstPercentage: gstRate,
          taxType: taxType || 'CGST+SGST',
          discount: disc,
          discountType: discountType || 'percentage',
          validUntil: validUntil ? new Date(validUntil) : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          // ✅ FIXED: createdBy as ObjectId
          createdBy: req.user?.id || null,
          createdByUsername: req.user?.username || 'System',
          pdfUrl: pdfUrl || '',
          status: 'Draft',
          subtotal: Math.round(subtotal),
          totalGstAmount: Math.round(totalGst),
          totalAmount: Math.round(totalAmount)
        });

        savedProforma = await newProforma.save();
        break;
      } catch (err) {
        if (err.code === 11000 && attempts < maxAttempts - 1) {
          console.warn(`⚠️ Duplicate proforma number detected, retrying... (attempt ${attempts + 1})`);
          attempts++;
          continue;
        }
        throw err;
      }
    }

    if (!savedProforma) {
      throw new Error('Failed to create proforma after multiple attempts');
    }

    await savedProforma.populate('clientId', 'name companyName email phone address gstNumber');

    return res.status(201).json({
      success: true,
      message: 'Proforma invoice created successfully',
      data: savedProforma
    });

  } catch (error) {
    console.error('❌ Create proforma error:', error);
    if (error.name === 'ValidationError') {
      const errors = {};
      for (const [key, value] of Object.entries(error.errors)) {
        errors[key] = value.message;
      }
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error while creating proforma invoice',
      error: error.message
    });
  }
};

// ==================== GET ALL PROFORMAS ====================
// ✅ Employee ko sirf apne proformas dikhao
exports.getProformas = async (req, res) => {
  try {
    const {
      status,
      clientId,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    let query = {};

    // ✅ Agar employee hai toh sirf apne proformas dikhao
    if (req.user && req.user.role === 'employee') {
      query.createdBy = req.user.id;
    }

    if (status && status !== 'All') query.status = status;
    if (clientId) query.clientId = clientId;

    if (startDate || endDate) {
      query.proformaDate = {};
      if (startDate) query.proformaDate.$gte = new Date(startDate);
      if (endDate) query.proformaDate.$lte = new Date(endDate);
    }

    const proformas = await ProformaInvoice.find(query)
      .populate('clientId', 'name companyName email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await ProformaInvoice.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: proformas,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get proformas error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching proforma invoices',
      error: error.message
    });
  }
};

// ==================== GET SINGLE PROFORMA ====================
// ✅ Employee ko sirf apne proformas dikhao
exports.getProformaById = async (req, res) => {
  try {
    const proforma = await ProformaInvoice.findById(req.params.id)
      .populate('clientId', 'name companyName email phone address gstNumber');

    if (!proforma) {
      return res.status(404).json({
        success: false,
        message: 'Proforma invoice not found'
      });
    }

    // ✅ Employee check: Agar employee hai aur proforma usne nahi banaya toh deny
    if (req.user && req.user.role === 'employee' && proforma.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own proforma invoices.'
      });
    }

    return res.status(200).json({
      success: true,
      data: proforma
    });

  } catch (error) {
    console.error('Get proforma error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching proforma invoice',
      error: error.message
    });
  }
};

// ==================== UPDATE PROFORMA ====================
// ✅ Employee ko sirf apne proformas edit karne do
exports.updateProforma = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      clientName,
      companyName,
      contactPerson,
      contactEmail,
      contactPhone,
      clientAddress,
      clientGst,
      services,
      description,
      notes,
      gstPercentage,
      taxType,
      discount,
      discountType,
      validUntil,
      proformaDate
    } = req.body;

    const proforma = await ProformaInvoice.findById(id);
    
    if (!proforma) {
      return res.status(404).json({
        success: false,
        message: 'Proforma invoice not found'
      });
    }

    // ✅ Employee check: Agar employee hai aur proforma usne nahi banaya toh deny
    if (req.user && req.user.role === 'employee' && proforma.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only edit your own proforma invoices.'
      });
    }

    if (proforma.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft proforma invoices can be edited'
      });
    }

    if (!services || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one service is required'
      });
    }

    const processedServices = [];
    let subtotal = 0;
    let totalGst = 0;
    const isIGST = taxType === 'IGST';
    const gstRate = parseFloat(gstPercentage) || 0;

    for (const service of services) {
      const quantity = parseFloat(service.quantity) || 1;
      const unitPrice = parseFloat(service.unitPrice) || 0;
      const totalPrice = quantity * unitPrice;
      const serviceGstRate = parseFloat(service.gstRate) || gstRate;
      const gstAmount = (totalPrice * serviceGstRate) / 100;

      subtotal += totalPrice;
      totalGst += gstAmount;

      processedServices.push({
        serviceName: service.serviceName || 'Unnamed Service',
        description: service.description || '',
        duration: service.duration || '',
        quantity: quantity,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        gstRate: serviceGstRate,
        gstAmount: gstAmount,
        cgst: isIGST ? 0 : gstAmount / 2,
        sgst: isIGST ? 0 : gstAmount / 2,
        igst: isIGST ? gstAmount : 0
      });
    }

    let discountAmount = 0;
    const disc = parseFloat(discount) || 0;
    if (disc > 0) {
      if (discountType === 'percentage') {
        discountAmount = (subtotal * disc) / 100;
      } else {
        discountAmount = disc;
      }
    }

    const totalAmount = subtotal + totalGst - discountAmount;

    proforma.clientName = clientName || proforma.clientName;
    proforma.companyName = companyName || proforma.companyName;
    proforma.contactPerson = contactPerson || proforma.contactPerson;
    proforma.contactEmail = contactEmail || proforma.contactEmail;
    proforma.contactPhone = contactPhone || proforma.contactPhone;
    proforma.clientAddress = clientAddress || proforma.clientAddress;
    proforma.clientGst = clientGst || proforma.clientGst;
    proforma.services = processedServices;
    proforma.description = description || '';
    proforma.notes = notes || '';
    proforma.gstPercentage = gstRate;
    proforma.taxType = taxType || 'CGST+SGST';
    proforma.discount = disc;
    proforma.discountType = discountType || 'percentage';
    proforma.subtotal = Math.round(subtotal);
    proforma.totalGstAmount = Math.round(totalGst);
    proforma.totalAmount = Math.round(totalAmount);
    
    if (validUntil) {
      proforma.validUntil = new Date(validUntil);
    }
    if (proformaDate) {
      proforma.proformaDate = new Date(proformaDate);
    }

    await proforma.save();
    await proforma.populate('clientId', 'name companyName email phone address gstNumber');

    return res.status(200).json({
      success: true,
      message: 'Proforma invoice updated successfully',
      data: proforma
    });

  } catch (error) {
    console.error('Update proforma error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating proforma invoice',
      error: error.message
    });
  }
};

// ==================== UPDATE STATUS ====================
// ✅ Employee ko sirf apne proformas ka status update karne do
exports.updateProformaStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const proforma = await ProformaInvoice.findById(id);
    if (!proforma) {
      return res.status(404).json({
        success: false,
        message: 'Proforma invoice not found'
      });
    }

    // ✅ Employee check: Agar employee hai aur proforma usne nahi banaya toh deny
    if (req.user && req.user.role === 'employee' && proforma.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update status for your own proforma invoices.'
      });
    }

    proforma.status = status;

    if (status === 'Sent') {
      proforma.sentAt = new Date();
    } else if (status === 'Viewed') {
      proforma.viewedAt = new Date();
    } else if (status === 'Accepted') {
      proforma.acceptedAt = new Date();
    } else if (status === 'Rejected') {
      proforma.rejectedAt = new Date();
      proforma.rejectionReason = rejectionReason || '';
    }

    await proforma.save();

    return res.status(200).json({
      success: true,
      message: `Proforma status updated to ${status}`,
      data: proforma
    });

  } catch (error) {
    console.error('Update proforma status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating proforma status',
      error: error.message
    });
  }
};

// ==================== DELETE PROFORMA ====================
// ✅ Employee ko sirf apne proformas delete karne do
exports.deleteProforma = async (req, res) => {
  try {
    const { id } = req.params;
    const proforma = await ProformaInvoice.findById(id);

    if (!proforma) {
      return res.status(404).json({
        success: false,
        message: 'Proforma invoice not found'
      });
    }

    // ✅ Employee check: Agar employee hai aur proforma usne nahi banaya toh deny
    if (req.user && req.user.role === 'employee' && proforma.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete your own proforma invoices.'
      });
    }

    if (proforma.status === 'Converted') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a converted proforma invoice'
      });
    }

    await ProformaInvoice.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Proforma invoice deleted successfully'
    });

  } catch (error) {
    console.error('Delete proforma error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting proforma',
      error: error.message
    });
  }
};

// ==================== GET STATS ====================
// ✅ Employee ko sirf apne proformas ka stats dikhao
exports.getProformaStats = async (req, res) => {
  try {
    let query = {};

    // ✅ Agar employee hai toh sirf apne proformas ka stats dikhao
    if (req.user && req.user.role === 'employee') {
      query.createdBy = req.user.id;
    }

    const total = await ProformaInvoice.countDocuments(query);
    const draft = await ProformaInvoice.countDocuments({ ...query, status: 'Draft' });
    const sent = await ProformaInvoice.countDocuments({ ...query, status: 'Sent' });
    const viewed = await ProformaInvoice.countDocuments({ ...query, status: 'Viewed' });
    const accepted = await ProformaInvoice.countDocuments({ ...query, status: 'Accepted' });
    const rejected = await ProformaInvoice.countDocuments({ ...query, status: 'Rejected' });
    const converted = await ProformaInvoice.countDocuments({ ...query, status: 'Converted' });
    const expired = await ProformaInvoice.countDocuments({ ...query, status: 'Expired' });

    const result = await ProformaInvoice.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalAmount = result.length > 0 ? result[0].total : 0;

    return res.status(200).json({
      success: true,
      data: {
        total,
        draft,
        sent,
        viewed,
        accepted,
        rejected,
        converted,
        expired,
        totalAmount
      }
    });

  } catch (error) {
    console.error('Get proforma stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching stats',
      error: error.message
    });
  }
};

// ==================== GENERATE PROFORMA PDF ====================
// ✅ Employee ko sirf apne proformas ka PDF generate karne do
exports.generateProformaPDF = async (req, res) => {
  try {
    const { id } = req.params;
    
    const proforma = await ProformaInvoice.findById(id);
    if (!proforma) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>❌ Proforma Invoice Not Found</h1>
            <p>The proforma invoice you are looking for does not exist.</p>
          </body>
        </html>
      `);
    }

    // ✅ Employee check: Agar employee hai aur proforma usne nahi banaya toh deny
    if (req.user && req.user.role === 'employee' && proforma.createdBy?.toString() !== req.user.id) {
      return res.status(403).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>⛔ Access Denied</h1>
            <p>You can only view your own proforma invoices.</p>
          </body>
        </html>
      `);
    }

    const htmlContent = await generatePDFHTML(proforma);
    
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
    
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ Error Generating PDF</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
};