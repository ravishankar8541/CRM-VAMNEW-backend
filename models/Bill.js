const mongoose = require('mongoose');

// Payment Sub-Schema
const paymentSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentDate: {
        type: Date,
        default: Date.now
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Credit Card', 'Debit Card'],
        required: true
    },
    transactionId: {
        type: String,
        trim: true,
        default: ''
    },
    remarks: {
        type: String,
        default: ''
    },
    receivedBy: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Service Item Schema for multiple services
const serviceItemSchema = new mongoose.Schema({
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
});

const billSchema = new mongoose.Schema({
    billNumber: {
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
    leadOwner: { 
        type: String, 
        default: '' 
    },
    serviceName: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    duration: {                    
        type: String,
        default: ''
    },
    services: [serviceItemSchema],
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    paidAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    dueAmount: {
        type: Number,
        default: 0
    },
    subtotal: {
        type: Number,
        default: 0
    },
    totalGstAmount: {
        type: Number,
        default: 0
    },
    gstAmount: {
        type: Number,
        default: 0,
        min: 0
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
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    taxType: {
        type: String,
        enum: ['CGST+SGST', 'IGST', 'None'],
        default: 'CGST+SGST'
    },
    roundOff: {
        type: Number,
        default: 0
    },
    billDate: {
        type: Date,
        default: Date.now
    },
    dueDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['Draft', 'Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled', 'Installment'],
        default: 'Pending'
    },
    payments: [paymentSchema],
    notes: {
        type: String,
        default: ''
    },
    createdBy: {
        type: String,
        default: ''
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurringPeriod: {
        type: String,
        enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'],
        default: null
    },

    // ==================== GST & INSTALLMENT SEPARATION TRACKING ====================
    // ✅ Yeh bill installment (child invoice) hai ya direct bill?
    isInstallment: {
        type: Boolean,
        default: false
    },
    // ✅ Is bill ko GST category me aana chahiye ya Non-GST me?
    isGST: {
        type: Boolean,
        default: false
    },
    // ✅ Child invoice ke parent contract/deal me GST tha ya nahi?
    parentIsGST: {
        type: Boolean,
        default: false
    },
    // ✅ Parent bill ki details (agar direct bill se link ho)
    parentBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bill',
        default: null
    },
    parentBillNumber: {
        type: String,
        default: ''
    },
    parentServiceName: {
        type: String,
        default: ''
    },
    parentGSTPercentage: {
        type: Number,
        default: 0
    },
    parentGSTAmount: {
        type: Number,
        default: 0
    },
    // ✅ ServiceBill container ka reference
    targetServiceBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ServiceBill',
        default: null
    },

    // Employee tracking
    createdById: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    createdByUsername: {
        type: String,
        default: ''
    }
}, { timestamps: true });

// Method to calculate due amount and status
billSchema.methods.calculateBill = function() {
    this.dueAmount = Math.max(0, this.totalAmount - this.paidAmount);

    const now = new Date();
    const dueDate = new Date(this.dueDate);

    if (this.isInstallment) {
        this.status = 'Installment';
    } else if (this.dueAmount <= 0) {
        this.status = 'Paid';
    } else if (this.paidAmount > 0 && this.dueAmount > 0) {
        this.status = 'Partially Paid';
    } else if (now > dueDate && this.dueAmount > 0) {
        this.status = 'Overdue';
    } else {
        this.status = 'Pending';
    }

    return this;
};

// Method to calculate totals for multiple services
billSchema.methods.calculateTotals = function() {
    let subtotal = 0;
    let totalGst = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    
    if (this.services && this.services.length > 0) {
        this.services.forEach(service => {
            subtotal += service.totalPrice;
            totalGst += service.gstAmount || 0;
            cgstTotal += service.cgst || 0;
            sgstTotal += service.sgst || 0;
            igstTotal += service.igst || 0;
        });
    } else {
        subtotal = this.totalAmount - (this.gstAmount || 0);
        totalGst = this.gstAmount || 0;
    }
    
    let discountAmount = 0;
    if (this.discount > 0) {
        if (this.discountType === 'percentage') {
            discountAmount = (subtotal * this.discount) / 100;
        } else {
            discountAmount = this.discount;
        }
    }
    
    this.subtotal = subtotal;
    this.totalGstAmount = totalGst;
    this.totalAmount = subtotal + totalGst - discountAmount;
    this.cgst = cgstTotal;
    this.sgst = sgstTotal;
    this.igst = igstTotal;
    
    this.calculateBill();
    
    return this;
};

// Method to add payment
billSchema.methods.addPayment = async function(paymentData) {
    this.payments.push(paymentData);
    this.paidAmount += paymentData.amount;
    this.calculateBill();
    await this.save();
    return this;
};

module.exports = mongoose.model("Bill", billSchema);