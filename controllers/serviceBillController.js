const ServiceBill = require('../models/ServiceBill');
const Bill = require('../models/Bill');

exports.updateServiceBill = async (req, res) => {
    try {
        const { clientId, serviceName, totalAmount, billId, billNumber, initialPayment } = req.body;

        let serviceBill = await ServiceBill.findOne({ 
            clientId: clientId, 
            serviceName: serviceName 
        });

        if (!serviceBill) {
            serviceBill = new ServiceBill({
                clientId,
                serviceName,
                totalAmount: totalAmount,
                paidAmount: initialPayment || 0,
                dueAmount: totalAmount - (initialPayment || 0),
                status: initialPayment >= totalAmount ? 'Paid' : (initialPayment > 0 ? 'Partially Paid' : 'Pending')
            });
        } else {
            const isNewBill = await Bill.findById(billId);
            
            if (isNewBill && isNewBill.status === 'Paid') {
                serviceBill.totalAmount += totalAmount;
            }
            
            serviceBill.paidAmount += initialPayment || 0;
            serviceBill.dueAmount = serviceBill.totalAmount - serviceBill.paidAmount;
            
            if (serviceBill.dueAmount <= 0) {
                serviceBill.status = 'Paid';
            } else if (serviceBill.paidAmount > 0) {
                serviceBill.status = 'Partially Paid';
            } else {
                serviceBill.status = 'Pending';
            }
        }

        serviceBill.bills.push({
            billId: billId,
            billNumber: billNumber,
            amount: totalAmount,
            paymentReceived: initialPayment || 0,
            date: new Date()
        });

        if (initialPayment > 0) {
            serviceBill.payments.push({
                amount: initialPayment,
                paymentMethod: req.body.paymentMethod || 'Cash',
                transactionId: req.body.transactionId || '',
                remarks: req.body.paymentRemarks || 'Payment',
                receivedBy: req.user?.username || 'System',
                billNumber: billNumber,
                paymentDate: new Date()
            });
        }

        await serviceBill.save();

        return res.status(200).json({
            success: true,
            data: serviceBill
        });
    } catch (error) {
        console.error('Update service bill error:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// serviceBillController.js - getClientServiceBilling
exports.getClientServiceBilling = async (req, res) => {
    try {
        const { clientId } = req.params;
        const serviceBills = await ServiceBill.find({ clientId: clientId });
        
        
        
        const processedServices = serviceBills.map(service => {
            let totalPaid = 0;
            if (service.payments && service.payments.length > 0) {
                service.payments.forEach(payment => {
                    totalPaid += payment.amount || 0;
                });
            }
            
            const dueAmount = service.totalAmount - totalPaid;
            
            let displayName = service.serviceName;
            if (service.isMultiService && service.services && service.services.length > 0) {
                displayName = service.services.map(s => s.serviceName).join(' + ');
            }
            
            const installmentBills = (service.payments || [])
                .filter(p => p.billNumber)
                .map((p, idx) => ({
                    id: p._id,
                    installmentNumber: idx + 1,
                    amount: p.amount,
                    date: p.paymentDate,
                    billNumber: p.billNumber,
                    status: 'Paid',
                    paymentMethod: p.paymentMethod,
                    remarks: p.remarks,
                    // ✅ Installment me GST nahi hai
                    gstAmount: 0,
                    gstPercentage: 0,
                    taxType: 'N/A'  // ✅ Installment ka koi GST nahi
                }));
            
            // ✅ 🔥 CRITICAL FIX: Parent bill ka taxType use karo, default mat daalo
            let taxType = service.taxType || 'CGST+SGST';
            let gstPercentage = service.gstPercentage || 0;
            let gstAmount = service.gstAmount || 0;
            
            // ✅ Agar installment hai to GST 0 karo
            const isInstallmentService = service.bills && service.bills.length > 0 && 
                service.bills.some(b => b.amount && b.paymentReceived && b.amount === b.paymentReceived);
            
            if (isInstallmentService) {
                // ✅ Installment service hai - GST nahi hai
                taxType = service.taxType || 'CGST+SGST';  // Parent tax type show karo
                gstPercentage = service.gstPercentage || 0;
                gstAmount = 0;  // ✅ Installment me GST 0
            }
            
            
            
            return {
                _id: service._id,
                serviceName: displayName,
                isMultiService: service.isMultiService || false,
                services: service.services || [],
                duration: service.duration || '',
                totalAmount: service.totalAmount,
                paidAmount: totalPaid,
                dueAmount: dueAmount > 0 ? dueAmount : 0,
                status: dueAmount <= 0 ? 'Paid' : (totalPaid > 0 ? 'Partially Paid' : 'Pending'),
                payments: service.payments || [],
                bills: service.bills || [],
                installmentBills: installmentBills,
                totalInstallments: installmentBills.length,
                // ✅ FIXED: Parent bill ke GST values use karo
                taxType: taxType,
                gstPercentage: gstPercentage,
                gstAmount: gstAmount,
                // ✅ Extra: Parent bill ka original GST store karo
                parentTaxType: service.taxType || 'CGST+SGST',
                parentGstPercentage: service.gstPercentage || 0,
                parentGstAmount: service.gstAmount || 0,
                isInstallmentService: isInstallmentService
            };
        });
        
        const totalBilled = processedServices.reduce((sum, s) => sum + s.totalAmount, 0);
        const totalPaid = processedServices.reduce((sum, s) => sum + s.paidAmount, 0);
        const totalDue = processedServices.reduce((sum, s) => sum + s.dueAmount, 0);
        
        return res.status(200).json({
            success: true,
            data: {
                totalBilled,
                totalPaid,
                totalDue,
                services: processedServices
            }
        });
    } catch (error) {
        console.error('Error in getClientServiceBilling:', error);
        return res.status(500).json({ 
            success: false, 
            message: error.message, 
            data: { services: [] } 
        });
    }
};

exports.addServicePayment = async (req, res) => {
    try {
        const { serviceBillId } = req.params;
        const { amount, paymentMethod, transactionId, remarks, receivedBy, billNumber } = req.body;
        
 
        
        const serviceBill = await ServiceBill.findById(serviceBillId);
        
        if (!serviceBill) {
            return res.status(404).json({
                success: false,
                message: 'Service bill not found'
            });
        }
        
        const paymentAmount = parseFloat(amount);
        const newPaidAmount = (serviceBill.paidAmount || 0) + paymentAmount;
        
        serviceBill.paidAmount = newPaidAmount;
        serviceBill.dueAmount = serviceBill.totalAmount - newPaidAmount;
        
        if (serviceBill.paidAmount >= serviceBill.totalAmount) {
            serviceBill.status = 'Paid';
        } else if (serviceBill.paidAmount > 0) {
            serviceBill.status = 'Partially Paid';
        }
        
        serviceBill.payments.push({
            amount: paymentAmount,
            paymentMethod: paymentMethod || 'Cash',
            transactionId: transactionId || '',
            remarks: remarks || `Installment payment`,
            receivedBy: receivedBy || 'System',
            billNumber: billNumber || `PAY-${Date.now()}`,
            paymentDate: new Date()
        });
        
        await serviceBill.save();
        
       
        
        return res.status(200).json({
            success: true,
            data: serviceBill,
            message: 'Payment added successfully'
        });
    } catch (error) {
        console.error('Add service payment error:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.deleteServiceBill = async (req, res) => {
    try {
        const { id } = req.params;
        
        const deletedServiceBill = await ServiceBill.findByIdAndDelete(id);
        
        if (!deletedServiceBill) {
            return res.status(404).json({
                success: false,
                message: 'Service bill not found'
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Service bill deleted successfully',
            data: deletedServiceBill
        });
    } catch (error) {
        console.error('Delete service bill error:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.removeBillFromServiceBill = async (req, res) => {
    try {
        const { id } = req.params;
        const { billNumber } = req.body;
        
        const serviceBill = await ServiceBill.findById(id);
        
        if (!serviceBill) {
            return res.status(404).json({
                success: false,
                message: 'Service bill not found'
            });
        }
        
        serviceBill.bills = serviceBill.bills.filter(b => b.billNumber !== billNumber);
        serviceBill.payments = serviceBill.payments.filter(p => p.billNumber !== billNumber);
        
        serviceBill.paidAmount = serviceBill.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        serviceBill.dueAmount = serviceBill.totalAmount - serviceBill.paidAmount;
        
        if (serviceBill.dueAmount <= 0) {
            serviceBill.status = 'Paid';
        } else if (serviceBill.paidAmount > 0) {
            serviceBill.status = 'Partially Paid';
        } else {
            serviceBill.status = 'Pending';
        }
        
        if (serviceBill.bills.length === 0 && serviceBill.payments.length === 0) {
            await ServiceBill.findByIdAndDelete(id);
            return res.status(200).json({
                success: true,
                message: 'Service bill deleted (no bills remaining)',
                deleted: true
            });
        }
        
        await serviceBill.save();
        
        return res.status(200).json({
            success: true,
            message: 'Bill removed from service record',
            data: serviceBill
        });
    } catch (error) {
        console.error('Remove bill error:', error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};