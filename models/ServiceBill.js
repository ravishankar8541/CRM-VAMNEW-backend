


const mongoose = require('mongoose');

const serviceBillSchema = new mongoose.Schema({
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    isMultiService: {
        type: Boolean,
        default: false
    },
    serviceName: {
        type: String,
        default: null
    },
    duration: {
        type: String,
        default: ''
    },
    services: [{
        serviceName: { type: String, required: true },
        description: { type: String, default: '' },
        duration: { type: String, default: '' },
        quantity: { type: Number, default: 1, min: 1 },
        unitPrice: { type: Number, default: 0, min: 0 },
        totalPrice: { type: Number, default: 0, min: 0 },
        gstRate: { type: Number, default: 0 },
        gstAmount: { type: Number, default: 0 }
    }],
    totalAmount: {
        type: Number,
        required: true,
        min: 0,
        default: 0
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
    taxType: {
        type: String,
        enum: ['CGST+SGST', 'IGST', 'None'],
        default: 'CGST+SGST'
    },
    gstPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    gstAmount: {
        type: Number,
        default: 0
    },
    isGST: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['Pending', 'Partially Paid', 'Paid'],
        default: 'Pending'
    },
    payments: [{
        amount: { type: Number, required: true },
        paymentDate: { type: Date, default: Date.now },
        paymentMethod: { type: String },
        transactionId: { type: String },
        remarks: { type: String },
        receivedBy: { type: String },
        billNumber: { type: String }
    }],
    bills: [{
        billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
        billNumber: { type: String },
        amount: { type: Number },
        paymentReceived: { type: Number },
        date: { type: Date, default: Date.now }
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    createdByUsername: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('ServiceBill', serviceBillSchema);