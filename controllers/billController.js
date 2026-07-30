const Bill = require('../models/Bill');
const Client = require('../models/Client');
const ServiceBill = require('../models/ServiceBill');

const generateBillNumber = async (retryCount = 0) => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');

    const lastBill = await Bill.findOne({
        billNumber: { $regex: `INV/${year}/${month}` }
    }).sort({ createdAt: -1 });

    let sequence = 1;
    if (lastBill) {
        const lastSequence = parseInt(lastBill.billNumber.split('/').pop());
        sequence = lastSequence + 1;
    }

    const billNumber = `INV/${year}/${month}/${String(sequence).padStart(4, '0')}`;

    const exists = await Bill.findOne({ billNumber });
    if (exists && retryCount < 5) {
        return generateBillNumber(retryCount + 1);
    }

    return billNumber;
};

const calculateGST = (amount, gstRate, taxType = 'CGST+SGST') => {
    const gstAmount = (amount * gstRate) / 100;

    if (taxType === 'IGST') {
        return {
            gstAmount: gstAmount,
            cgst: 0,
            sgst: 0,
            igst: gstAmount
        };
    } else {
        return {
            gstAmount: gstAmount,
            cgst: gstAmount / 2,
            sgst: gstAmount / 2,
            igst: 0
        };
    }
};

exports.createBill = async (req, res) => {
    try {
        const {
            clientId,
            clientName,
            leadOwner,
            serviceName,
            description,
            duration,
            totalAmount,
            dueDate,
            gstAmount,
            gstPercentage,
            taxType,
            notes,
            initialPayment,
            paymentMethod,
            transactionId,
            paymentRemarks,
            services,
            isMultiServiceInstallment,
            targetServiceBillId
        } = req.body;

        if (!clientId) {
            return res.status(400).json({
                success: false,
                message: 'Client ID is required'
            });
        }

        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        const billNumber = await generateBillNumber();

        let parsedTotalAmount = 0;
        let parsedSubtotal = 0;
        let parsedTotalGst = 0;

        if (services && Array.isArray(services) && services.length > 0) {
            for (const service of services) {
                const quantity = service.quantity || 1;
                const unitPrice = parseFloat(service.unitPrice) || 0;
                const totalPrice = quantity * unitPrice;
                const gstRate = parseFloat(service.gstRate) || 0;
                const gstAmountCalc = (totalPrice * gstRate) / 100;

                parsedSubtotal += totalPrice;
                parsedTotalGst += gstAmountCalc;
            }

            let discountAmount = 0;
            if (req.body.discount) {
                const discount = parseFloat(req.body.discount) || 0;
                const discountType = req.body.discountType || 'percentage';
                if (discountType === 'percentage') {
                    discountAmount = (parsedSubtotal * discount) / 100;
                } else {
                    discountAmount = discount;
                }
            }
            parsedTotalAmount = parsedSubtotal + parsedTotalGst - discountAmount;
            parsedTotalAmount = Math.round(parsedTotalAmount);
        } else {
            parsedTotalAmount = Math.round(parseFloat(totalAmount)) || 0;
            parsedTotalAmount = Math.round(parsedTotalAmount);
        }

        const parsedInitialPayment = Math.round(parseFloat(initialPayment)) || 0;

        const roundedTotal = Math.round(parsedTotalAmount);
        const roundedInitial = Math.round(parsedInitialPayment);

        if (roundedInitial > roundedTotal) {
            return res.status(400).json({
                success: false,
                message: `Initial payment (₹${roundedInitial}) cannot exceed total amount (₹${roundedTotal})`
            });
        }

        let displayServiceName = serviceName || '';
        if ((!displayServiceName || displayServiceName === '') && services && services.length > 0) {
            const serviceNames = services.map(s => s.serviceName).filter(n => n && n !== '');
            displayServiceName = serviceNames.join(', ');
            if (displayServiceName.length > 50) {
                displayServiceName = displayServiceName.substring(0, 47) + '...';
            }
        }
        if (!displayServiceName || displayServiceName === '') {
            displayServiceName = 'Multi-Service Bill';
        }

        const calculatedGstAmount = parseFloat(gstAmount) || parsedTotalGst;
        const roundedGstAmount = Math.round(calculatedGstAmount);
        const currentTaxType = taxType || 'CGST+SGST';
        const isIGST = (currentTaxType === 'IGST');

        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;

        if (isIGST) {
            igstAmount = calculatedGstAmount;
        } else {
            cgstAmount = calculatedGstAmount / 2;
            sgstAmount = calculatedGstAmount / 2;
        }

        // ✅ NEW: createdBy fields - IMPORTANT
        const newBill = new Bill({
            billNumber,
            clientId,
            clientName: clientName || client?.name || '',
            leadOwner: leadOwner || '',
            serviceName: displayServiceName,
            description: description || '',
            duration: duration || '',
            totalAmount: parsedTotalAmount,
            dueDate: new Date(dueDate),
            gstAmount: roundedGstAmount,
            gstPercentage: parseFloat(gstPercentage) || 0,
            cgst: cgstAmount,
            sgst: sgstAmount,
            igst: igstAmount,
            taxType: currentTaxType,
            notes: notes || '',
            createdBy: req.user?.username || 'System',
            createdById: req.user?.id || null,
            createdByUsername: req.user?.username || 'System',
            paidAmount: parsedInitialPayment,
            subtotal: parsedSubtotal,
            totalGstAmount: roundedGstAmount,
            discount: parseFloat(req.body.discount) || 0,
            discountType: req.body.discountType || 'percentage'
        });

        if (services && Array.isArray(services) && services.length > 0 && services[0].duration) {
            newBill.duration = services[0].duration;

        }

        let due = parsedTotalAmount - parsedInitialPayment;
        newBill.dueAmount = due < 0 ? 0 : due;
        newBill.calculateBill();

        if (parsedInitialPayment > 0) {
            newBill.payments.push({
                amount: parsedInitialPayment,
                paymentMethod: paymentMethod || 'Cash',
                transactionId: transactionId || '',
                remarks: paymentRemarks || 'Initial payment at bill creation',
                receivedBy: req.user?.username || 'System',
                paymentDate: new Date()
            });
        }

        if (services && Array.isArray(services) && services.length > 0) {
            const processedServices = [];
            for (const service of services) {
                const quantity = service.quantity || 1;
                const unitPrice = parseFloat(service.unitPrice) || 0;
                const totalPrice = quantity * unitPrice;
                const gstRate = parseFloat(service.gstRate) || 0;
                const gstAmountCalc = (totalPrice * gstRate) / 100;

                processedServices.push({
                    serviceName: service.serviceName,
                    description: service.description || '',
                    duration: service.duration || '',
                    quantity: quantity,
                    unitPrice: unitPrice,
                    totalPrice: totalPrice,
                    gstRate: gstRate,
                    gstAmount: gstAmountCalc,
                    cgst: gstAmountCalc / 2,
                    sgst: gstAmountCalc / 2,
                    igst: 0
                });
            }
            newBill.services = processedServices;
        }

        await newBill.save();

        await newBill.populate('clientId', 'name companyName email phone address gstNumber');

        // ========== SERVICE BILL CREATION ==========
        try {
            let isInstallmentForExistingMultiService = false;
            let existingMultiServiceBill = null;

            if (targetServiceBillId) {
                existingMultiServiceBill = await ServiceBill.findById(targetServiceBillId);
                if (existingMultiServiceBill && existingMultiServiceBill.isMultiService === true) {
                    isInstallmentForExistingMultiService = true;
                }
            }

            if (!isInstallmentForExistingMultiService && isMultiServiceInstallment === true && serviceName) {
                existingMultiServiceBill = await ServiceBill.findOne({
                    clientId: clientId,
                    isMultiService: true,
                    'services.serviceName': serviceName,
                    status: { $ne: 'Paid' }
                });

                if (existingMultiServiceBill) {
                    isInstallmentForExistingMultiService = true;
                }
            }

            // ✅ CASE 1: MULTIPLE SERVICES (New multi-service contract)
            if (services && Array.isArray(services) && services.length > 0) {
                let totalContractValue = 0;
                const serviceDetails = [];
                let contractDuration = '';

                for (const service of services) {
                    const quantity = parseFloat(service.quantity) || 1;
                    const unitPrice = parseFloat(service.unitPrice) || 0;
                    const totalPrice = quantity * unitPrice;
                    const gstRate = parseFloat(service.gstRate) || 0;
                    const gstAmountCalc = (totalPrice * gstRate) / 100;
                    const serviceTotal = totalPrice + gstAmountCalc;

                    totalContractValue += serviceTotal;

                    if (service.duration && !contractDuration) {
                        contractDuration = service.duration;
                    }

                    serviceDetails.push({
                        serviceName: service.serviceName,
                        description: service.description || '',
                        duration: service.duration || '',
                        quantity: quantity,
                        unitPrice: unitPrice,
                        totalPrice: totalPrice,
                        gstRate: gstRate,
                        gstAmount: gstAmountCalc
                    });
                }

                let proportionalPayment = 0;
                if (parsedInitialPayment > 0 && parsedTotalAmount > 0) {
                    proportionalPayment = (parsedInitialPayment * totalContractValue) / parsedTotalAmount;
                    proportionalPayment = Math.round(proportionalPayment);
                }

                const contractName = serviceDetails.map(s => s.serviceName).join(' + ');

                const serviceBill = new ServiceBill({
                    clientId: clientId,
                    isMultiService: true,
                    serviceName: contractName,
                    duration: contractDuration,
                    services: serviceDetails,
                    totalAmount: totalContractValue,
                    paidAmount: proportionalPayment,
                    dueAmount: totalContractValue - proportionalPayment,
                    status: proportionalPayment >= totalContractValue ? 'Paid' :
                        proportionalPayment > 0 ? 'Partially Paid' : 'Pending',
                    bills: [{
                        billId: newBill._id,
                        billNumber: billNumber,
                        amount: totalContractValue,
                        paymentReceived: proportionalPayment,
                        date: new Date()
                    }],
                    taxType: currentTaxType,
                    gstPercentage: parseFloat(gstPercentage) || 18,
                    gstAmount: roundedGstAmount || 0,
                    // ✅ IMPORTANT: Save who created this
                    createdBy: req.user?.id || null,
                    createdByUsername: req.user?.username || 'System'
                });

                if (proportionalPayment > 0) {
                    serviceBill.payments.push({
                        amount: Number(proportionalPayment.toFixed(2)),
                        paymentMethod: paymentMethod || 'Cash',
                        transactionId: transactionId || '',
                        remarks: paymentRemarks || 'Initial payment',
                        receivedBy: req.user?.username || 'System',
                        billNumber: billNumber,
                        paymentDate: new Date()
                    });
                }

                await serviceBill.save();
            }

            // ✅ CASE 2: SINGLE SERVICE
            else if (serviceName && (!services || services.length === 0)) {
                if (isInstallmentForExistingMultiService && existingMultiServiceBill) {
                    // Installment for existing multi-service
                    const billAlreadyExists = existingMultiServiceBill.bills.some(b => b.billNumber === billNumber);

                    if (!billAlreadyExists) {
                        const newPaidAmount = existingMultiServiceBill.paidAmount + parsedInitialPayment;
                        existingMultiServiceBill.paidAmount = newPaidAmount;
                        existingMultiServiceBill.dueAmount = existingMultiServiceBill.totalAmount - newPaidAmount;

                        if (existingMultiServiceBill.dueAmount < 0) {
                            existingMultiServiceBill.dueAmount = 0;
                        }

                        existingMultiServiceBill.status = existingMultiServiceBill.paidAmount >= existingMultiServiceBill.totalAmount ? 'Paid' :
                            (existingMultiServiceBill.paidAmount > 0 ? 'Partially Paid' : 'Pending');

                        existingMultiServiceBill.bills.push({
                            billId: newBill._id,
                            billNumber: billNumber,
                            amount: parsedTotalAmount,
                            paymentReceived: parsedInitialPayment,
                            date: new Date()
                        });

                        if (parsedInitialPayment > 0) {
                            const paymentExists = existingMultiServiceBill.payments.some(p => p.billNumber === billNumber);
                            if (!paymentExists) {
                                existingMultiServiceBill.payments.push({
                                    amount: parsedInitialPayment,
                                    paymentMethod: paymentMethod || 'Cash',
                                    transactionId: transactionId || '',
                                    remarks: paymentRemarks || `Installment payment for ${serviceName}`,
                                    receivedBy: req.user?.username || 'System',
                                    billNumber: billNumber,
                                    paymentDate: new Date()
                                });
                            }
                        }

                        await existingMultiServiceBill.save();
                    }
                } else {
                    // Regular single service
                    let serviceBill = await ServiceBill.findOne({
                        clientId: clientId,
                        serviceName: serviceName,
                        isMultiService: { $ne: true }
                    });

                    const serviceTotal = parsedTotalAmount;

                    if (!serviceBill) {
                        serviceBill = new ServiceBill({
                            clientId: clientId,
                            serviceName: serviceName,
                            isMultiService: false,
                            duration: duration || '',
                            totalAmount: serviceTotal,
                            paidAmount: parsedInitialPayment,
                            dueAmount: serviceTotal - parsedInitialPayment,
                            status: parsedInitialPayment >= serviceTotal ? 'Paid' :
                                (parsedInitialPayment > 0 ? 'Partially Paid' : 'Pending'),
                            bills: [{
                                billId: newBill._id,
                                billNumber: billNumber,
                                amount: serviceTotal,
                                paymentReceived: parsedInitialPayment,
                                date: new Date()
                            }],
                            // ✅ IMPORTANT: Save who created this
                            createdBy: req.user?.id || null,
                            createdByUsername: req.user?.username || 'System'
                        });
                    } else {
                        const billAlreadyExists = serviceBill.bills.some(b => b.billNumber === billNumber);

                        if (!billAlreadyExists) {
                            const isInstallmentBill = parsedInitialPayment === parsedTotalAmount &&
                                parsedTotalAmount <= serviceBill.dueAmount;

                            if (isInstallmentBill) {
                                serviceBill.paidAmount += parsedInitialPayment;
                            } else {
                                serviceBill.paidAmount += parsedInitialPayment;
                            }

                            serviceBill.dueAmount = serviceBill.totalAmount - serviceBill.paidAmount;

                            if (serviceBill.dueAmount < 0) serviceBill.dueAmount = 0;

                            serviceBill.status = serviceBill.paidAmount >= serviceBill.totalAmount ? 'Paid' :
                                (serviceBill.paidAmount > 0 ? 'Partially Paid' : 'Pending');

                            serviceBill.bills.push({
                                billId: newBill._id,
                                billNumber: billNumber,
                                amount: parsedTotalAmount,
                                paymentReceived: parsedInitialPayment,
                                date: new Date()
                            });
                        }
                    }

                    if (parsedInitialPayment > 0) {
                        const paymentExists = serviceBill.payments?.some(p => p.billNumber === billNumber);
                        if (!paymentExists) {
                            if (!serviceBill.payments) serviceBill.payments = [];
                            serviceBill.payments.push({
                                amount: parsedInitialPayment,
                                paymentMethod: paymentMethod || 'Cash',
                                transactionId: transactionId || '',
                                remarks: paymentRemarks || 'Payment',
                                receivedBy: req.user?.username || 'System',
                                billNumber: billNumber,
                                paymentDate: new Date()
                            });
                        }
                    }

                    await serviceBill.save();
                }
            }

        } catch (serviceBillError) {
            console.error('❌ Error creating service bill:', serviceBillError);
        }

        return res.status(201).json({
            success: true,
            message: parsedInitialPayment > 0 ? 'Bill created with initial payment' : 'Bill created successfully',
            data: {
                ...newBill.toObject(),
                taxType: newBill.taxType,
                cgst: newBill.cgst,
                sgst: newBill.sgst,
                igst: newBill.igst
            }
        });

    } catch (error) {
        console.error('❌ Create bill error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while creating bill',
            error: error.message
        });
    }
};

// ✅ UPDATED: Employee ko sirf apne bills dikhao
exports.getBills = async (req, res) => {
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

        // ✅ Agar employee hai toh sirf apne bills dikhao
        if (req.user && req.user.role === 'employee') {
            query.createdById = req.user.id;
        }

        if (status && status !== 'All') query.status = status;
        if (clientId) query.clientId = clientId;

        if (startDate || endDate) {
            query.billDate = {};
            if (startDate) query.billDate.$gte = new Date(startDate);
            if (endDate) query.billDate.$lte = new Date(endDate);
        }

        const bills = await Bill.find(query)
            .populate('clientId', 'name companyName email phone')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Bill.countDocuments(query);

        return res.status(200).json({
            success: true,
            data: bills,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get bills error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while fetching bills',
            error: error.message
        });
    }
};

// ✅ UPDATED: Permission check for bill by ID
exports.getBillById = async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id)
            .populate('clientId', 'name companyName email phone address gstNumber');

        if (!bill) {
            return res.status(404).json({
                success: false,
                message: 'Bill not found'
            });
        }

        // ✅ Employee check: Agar employee hai aur bill usne nahi banaya toh deny
        if (req.user && req.user.role === 'employee' && bill.createdById?.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only view your own bills.'
            });
        }

        const billData = bill.toObject();

        return res.status(200).json({
            success: true,
            data: {
                ...billData,
                taxType: billData.taxType || 'CGST+SGST'
            }
        });

    } catch (error) {
        console.error('Get bill error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while fetching bill',
            error: error.message
        });
    }
};

// ✅ UPDATED: Permission check for add payment
exports.addPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, paymentMethod, transactionId, remarks } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid payment amount is required'
            });
        }

        const bill = await Bill.findById(id);

        if (!bill) {
            return res.status(404).json({
                success: false,
                message: 'Bill not found'
            });
        }

        // ✅ Employee check
        if (req.user && req.user.role === 'employee' && bill.createdById?.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only add payments to your own bills.'
            });
        }

        if (bill.status === 'Paid') {
            return res.status(400).json({
                success: false,
                message: 'Bill is already fully paid'
            });
        }

        const paymentAmount = parseFloat(amount);

        if (paymentAmount > bill.dueAmount) {
            return res.status(400).json({
                success: false,
                message: `Payment amount cannot exceed due amount of ₹${bill.dueAmount.toLocaleString('en-IN')}`
            });
        }

        const payment = {
            amount: paymentAmount,
            paymentMethod: paymentMethod || 'Cash',
            transactionId: transactionId || '',
            remarks: remarks || '',
            receivedBy: req.user?.username || 'System',
            paymentDate: new Date()
        };

        bill.payments.push(payment);
        bill.paidAmount += paymentAmount;
        bill.dueAmount = bill.totalAmount - bill.paidAmount;

        if (bill.dueAmount <= 0) {
            bill.status = 'Paid';
        } else if (bill.paidAmount > 0) {
            bill.status = 'Partially Paid';
        }

        await bill.save();
        await bill.populate('clientId', 'name companyName email phone');

        return res.status(200).json({
            success: true,
            message: 'Payment added successfully',
            data: bill
        });

    } catch (error) {
        console.error('Add payment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while adding payment',
            error: error.message
        });
    }
};

// ✅ UPDATED: Permission check for update bill
exports.updateBill = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const bill = await Bill.findById(id);

        if (!bill) {
            return res.status(404).json({
                success: false,
                message: 'Bill not found'
            });
        }

        // ✅ Employee check
        if (req.user && req.user.role === 'employee' && bill.createdById?.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only edit your own bills.'
            });
        }

        if (bill.status === 'Paid') {
            return res.status(400).json({
                success: false,
                message: 'Cannot edit a paid bill'
            });
        }

        const allowedUpdates = ['serviceName', 'description', 'totalAmount', 'dueDate', 'gstAmount', 'notes'];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                if (field === 'totalAmount') {
                    bill[field] = parseFloat(updates[field]);
                } else if (field === 'dueDate') {
                    bill[field] = new Date(updates[field]);
                } else if (field === 'gstAmount') {
                    bill[field] = parseFloat(updates[field]) || 0;
                } else {
                    bill[field] = updates[field];
                }
            }
        });

        if (bill.calculateBill) {
            bill.calculateBill();
        }

        await bill.save();
        await bill.populate('clientId', 'name companyName email phone');

        return res.status(200).json({
            success: true,
            message: 'Bill updated successfully',
            data: bill
        });

    } catch (error) {
        console.error('Update bill error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while updating bill',
            error: error.message
        });
    }
};

// ✅ UPDATED: Permission check for delete bill
exports.deleteBill = async (req, res) => {
    try {
        const { id } = req.params;

        const bill = await Bill.findById(id);

        if (!bill) {
            return res.status(404).json({
                success: false,
                message: 'Bill not found'
            });
        }

        // ✅ Employee check
        if (req.user && req.user.role === 'employee' && bill.createdById?.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only delete your own bills.'
            });
        }

        if (bill.payments && bill.payments.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete bill with existing payments'
            });
        }

        if (bill.status === 'Paid') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete a paid bill'
            });
        }

        await Bill.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Bill deleted successfully'
        });

    } catch (error) {
        console.error('Delete bill error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while deleting bill',
            error: error.message
        });
    }
};

// ✅ UPDATED: Permission check for client billing summary
exports.getClientBillingSummary = async (req, res) => {
    try {
        const { clientId } = req.params;

        if (!clientId || clientId === 'undefined' || clientId === 'null') {
            return res.status(400).json({
                success: false,
                message: 'Valid client ID is required'
            });
        }

        let query = { clientId: clientId };

        // ✅ Agar employee hai toh sirf apne bills dikhao
        if (req.user && req.user.role === 'employee') {
            query.createdById = req.user.id;
        }

        const bills = await Bill.find(query).sort({ billDate: -1 });

        const summary = {
            totalBilled: 0,
            totalPaid: 0,
            totalDue: 0,
            billsCount: bills.length,
            overdueBills: 0,
            bills: bills.map(bill => ({
                _id: bill._id,
                billNumber: bill.billNumber,
                clientName: bill.clientName || '',
                leadOwner: bill.leadOwner || '',
                totalAmount: bill.totalAmount,
                paidAmount: bill.paidAmount,
                dueAmount: bill.dueAmount,
                status: bill.status,
                dueDate: bill.dueDate,
                billDate: bill.billDate,
                duration: bill.duration || '',
                gstAmount: bill.gstAmount || 0,
                gstPercentage: bill.gstPercentage || 0,
                cgst: bill.cgst || 0,
                sgst: bill.sgst || 0,
                igst: bill.igst || 0,
                taxType: bill.taxType || 'CGST+SGST',
                serviceName: bill.serviceName || (bill.services && bill.services[0]?.serviceName) || 'Installment Bill'
            }))
        };

        bills.forEach(bill => {
            summary.totalBilled += bill.totalAmount;
            summary.totalPaid += bill.paidAmount;
            summary.totalDue += bill.dueAmount;
            if (bill.status === 'Overdue') summary.overdueBills++;
        });

        return res.status(200).json({
            success: true,
            data: summary
        });

    } catch (error) {
        console.error('Get client billing summary error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while fetching client billing summary',
            error: error.message
        });
    }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const bill = await Bill.findById(id);
        if (!bill) {
            return res.status(404).json({
                success: false,
                message: 'Bill not found'
            });
        }
        return res.status(200).json({
            success: true,
            data: bill.payments
        });
    } catch (error) {
        console.error('Get payment history error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while fetching payment history',
            error: error.message
        });
    }
};

exports.downloadBill = async (req, res) => {
    res.status(200).json({ success: true, message: 'Download function placeholder' });
};

exports.editBill = async (req, res) => {
    return exports.updateBill(req, res);
};

// ✅ UPDATED: Permission check for force delete
exports.forceDeleteBill = async (req, res) => {
    try {
        const { id } = req.params;

        const bill = await Bill.findById(id);
        if (!bill) {
            return res.status(404).json({
                success: false,
                message: 'Bill not found'
            });
        }

        // ✅ Employee check
        if (req.user && req.user.role === 'employee' && bill.createdById?.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only delete your own bills.'
            });
        }

        const deletedBill = await Bill.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Bill and all associated payments deleted successfully',
            data: deletedBill
        });
    } catch (error) {
        console.error('Force delete error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};