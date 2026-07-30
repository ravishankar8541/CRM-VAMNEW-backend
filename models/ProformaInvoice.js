const mongoose = require('mongoose');

const proformaServiceItemSchema = new mongoose.Schema({
    serviceName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    duration: {
        type: String,
        default: ''
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    unitPrice: {
        type: Number,
        required: true,
        min: 0
    },
    totalPrice: {
        type: Number,
        required: true,
        min: 0
    },
    gstRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    gstAmount: {
        type: Number,
        default: 0
    },
    cgst: {
        type: Number,
        default: 0
    },
    sgst: {
        type: Number,
        default: 0
    },
    igst: {
        type: Number,
        default: 0
    }
}, { _id: false });

const proformaInvoiceSchema = new mongoose.Schema({
    proformaNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    clientName: {
        type: String,
        default: ''
    },
    companyName: {
        type: String,
        default: ''
    },
    leadOwner: {
        type: String,
        default: ''
    },
    contactPerson: {
        type: String,
        default: ''
    },
    contactEmail: {
        type: String,
        default: ''
    },
    contactPhone: {
        type: String,
        default: ''
    },
    clientAddress: {
        type: String,
        default: ''
    },
    clientGst: {
        type: String,
        default: ''
    },
    services: [proformaServiceItemSchema],
    subtotal: {
        type: Number,
        default: 0
    },
    totalGstAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    gstPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    cgst: {
        type: Number,
        default: 0
    },
    sgst: {
        type: Number,
        default: 0
    },
    igst: {
        type: Number,
        default: 0
    },
    taxType: {
        type: String,
        enum: ['CGST+SGST', 'IGST'],
        default: 'CGST+SGST'
    },
    discount: {
        type: Number,
        default: 0
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    description: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    },
    proformaDate: {
        type: Date,
        default: Date.now
    },
    validUntil: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired', 'Converted'],
        default: 'Draft'
    },
    // ✅ FIXED: createdBy should be ObjectId, not String
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    createdByUsername: {
        type: String,
        default: ''
    },
    convertedToBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bill',
        default: null
    },
    convertedToBillNumber: {
        type: String,
        default: null
    },
    convertedAt: {
        type: Date,
        default: null
    },
    viewedAt: {
        type: Date,
        default: null
    },
    sentAt: {
        type: Date,
        default: null
    },
    acceptedAt: {
        type: Date,
        default: null
    },
    rejectedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    pdfUrl: {
        type: String,
        default: ''
    }
}, { timestamps: true });

proformaInvoiceSchema.pre('save', async function () {
    try {
        let subtotal = 0;
        let totalGst = 0;
        let cgstTotal = 0;
        let sgstTotal = 0;
        let igstTotal = 0;
        
        if (this.services && this.services.length > 0) {
            this.services.forEach(service => {
                const serviceTotal = service.totalPrice || 0;
                const serviceGst = service.gstAmount || 0;
                
                subtotal += serviceTotal;
                totalGst += serviceGst;
                cgstTotal += service.cgst || 0;
                sgstTotal += service.sgst || 0;
                igstTotal += service.igst || 0;
            });
        }
        
        let discountAmount = 0;
        if (this.discount > 0) {
            if (this.discountType === 'percentage') {
                discountAmount = (subtotal * this.discount) / 100;
            } else {
                discountAmount = this.discount;
            }
        }
        
        this.subtotal = Math.round(subtotal);
        this.totalGstAmount = Math.round(totalGst);
        this.totalAmount = Math.round(subtotal + totalGst - discountAmount);
        this.cgst = Math.round(cgstTotal);
        this.sgst = Math.round(sgstTotal);
        this.igst = Math.round(igstTotal);
        
    } catch (error) {
        console.error('❌ Error in pre-save middleware:', error);
        throw error;
    }
});

module.exports = mongoose.model('ProformaInvoice', proformaInvoiceSchema);