const Client = require('../models/Client');

// ==================== ADD CLIENT ====================
exports.addClient = async (req, res) => {
    try {
        const { 
            name, 
            email, 
            phone, 
            alternatePhone,
            companyName, 
            gstNumber, 
            category, 
            address,
            leadOwner,
            clientStatus, 
            remarks
        } = req.body;

        // 1. Basic Validation
        if (!name || !email || !phone || !companyName) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields',
            });
        }

        // 2. Check if client already exists (by email or phone)
        const existingClient = await Client.findOne({ 
            $or: [{ email: email.toLowerCase() }, { phone }] 
        });

        if (existingClient) {
            return res.status(400).json({
                success: false,
                message: 'Client with this email or phone already exists',
            });
        }

       

        // 4. ✅ createdBy save karo - Properly handle req.user
        const newClient = new Client({
            name,
            email: email.toLowerCase(),
            phone,
            alternatePhone: alternatePhone || '',
            companyName,
            gstNumber,
            category,
            address,
            leadOwner: leadOwner || req.user?.username || 'System',
            clientStatus: clientStatus || "New Client",
            remarks: remarks || '',
            createdBy: req.user?.id || null,
            createdByUsername: req.user?.username || 'System'
        });

        // 5. Save to Database
        await newClient.save();

        // 6. Success Response
        return res.status(201).json({
            success: true,
            message: 'Client added successfully',
            data: newClient,
        });

    } catch (error) {
        console.error('adding client error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during adding Client',
            error: error.message,
        });
    }
};

// ==================== GET ALL CLIENTS ====================
// ✅ Employee / Sales ko sirf apne clients dikhao
exports.clients = async (req, res) => {
    try {
        let query = {};
        
        // ✅ Agar employee ya sales hai toh sirf apne clients dikhao
        if (req.user && (req.user.role === 'employee' || req.user.role === 'sales')) {
            query.createdBy = req.user.id;
        }
        // ✅ Admin aur HR ko sab dikhega (query empty hai)
        
        const clients = await Client.find(query).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: clients.length,
            clients
        });

    } catch (error) {
        console.error('fetching error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during fetching Client',
            error: error.message,
        });
    }
};

// ==================== EDIT CLIENT ====================
exports.editClient = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        const client = await Client.findById(id);
        if (!client) {
            return res.status(404).json({ 
                success: false, 
                message: 'Client not found' 
            });
        }

        // ✅ Get user info for comparison
        const userId = req.user?.id?.toString();
        const createdBy = client.createdBy?.toString();
        const isOwner = createdBy === userId;
        const isEmployeeOrSales = req.user && (req.user.role === 'employee' || req.user.role === 'sales');

        // ✅ If employee/sales and not owner, restrict to status-only updates
        if (isEmployeeOrSales && !isOwner) {
            // ✅ Allow status updates (Follow-up, Prospect, Converted)
            const allowedFields = [
                'status', 'clientStatus', 'remarks',
                'followUpComment', 'nextFollowUpDate',
                'prospectComment', 'prospectDate',
                'convertedService', 'convertedDealAmout', 
                'convertedStartDate', 'convertedDuration',
                'convertedLeadOwner', 'convertedRemarks'
            ];
            
            // ✅ Check if employee/sales is trying to update personal info
            const personalFields = ['name', 'email', 'phone', 'alternatePhone', 'companyName', 'gstNumber', 'category', 'address'];
            const isUpdatingPersonal = personalFields.some(field => updateData[field] !== undefined);
            
            if (isUpdatingPersonal) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Employees/Sales can only update status and follow-up information.'
                });
            }
        }

        // ✅ Update leadOwner - only if not employee/sales OR employee/sales owns the client
        if (updateData.leadOwner !== undefined && !isEmployeeOrSales) {
            client.leadOwner = updateData.leadOwner;
        }

        // ✅ Update converted fields
        if (updateData.convertedService) client.convertedService = updateData.convertedService;
        if (updateData.convertedDealAmout !== undefined) client.convertedDealAmout = updateData.convertedDealAmout;
        if (updateData.convertedStartDate) client.convertedStartDate = updateData.convertedStartDate;
        if (updateData.convertedDuration) client.convertedDuration = updateData.convertedDuration;
        if (updateData.convertedLeadOwner) client.convertedLeadOwner = updateData.convertedLeadOwner;
        if (updateData.convertedRemarks) client.convertedRemarks = updateData.convertedRemarks;

        // ✅ Followup - Multiple allowed
        if (updateData.status === "Followup" && updateData.nextFollowUpDate) {
            client.followUpHistory.push({
                nextFollowUpDate: updateData.nextFollowUpDate,
                comment: updateData.followUpComment || "",
                updatedAt: new Date()
            });
            client.latestFollowUpDate = updateData.nextFollowUpDate;
        }

        // ✅ Prospect
        if (updateData.status === "Prospect" && updateData.prospectDate) {
            client.prospectHistory.push({
                prospectDate: updateData.prospectDate,
                comment: updateData.prospectComment || "",
                updatedAt: new Date()
            });
            client.latestProspectDate = updateData.prospectDate;
        }

        // ✅ Converted - Multiple allowed
        if (updateData.status === "Converted") {
            client.convertedHistory.push({
                service: updateData.convertedService || client.convertedService || 'Converted Client',
                convertedDealAmout: updateData.convertedDealAmout || client.convertedDealAmout || '0',
                startDate: updateData.convertedStartDate || client.convertedStartDate || new Date(),
                duration: updateData.convertedDuration || client.convertedDuration || '',
                leadOwner: updateData.convertedLeadOwner || client.convertedLeadOwner || '',
                remarks: updateData.convertedRemarks || client.convertedRemarks || '',
                convertedAt: new Date()
            });
        }

        // ✅ Update personal fields - only if not employee/sales OR employee/sales owns the client
        if (!isEmployeeOrSales || isOwner) {
            if (updateData.name) client.name = updateData.name;
            if (updateData.email) client.email = updateData.email;
            if (updateData.phone) client.phone = updateData.phone;
            if (updateData.alternatePhone !== undefined) client.alternatePhone = updateData.alternatePhone;
            if (updateData.companyName) client.companyName = updateData.companyName;
            if (updateData.gstNumber) client.gstNumber = updateData.gstNumber;
            if (updateData.category) client.category = updateData.category;
            if (updateData.address) client.address = updateData.address;
        }

        // ✅ Always update status and clientStatus if provided
        if (updateData.status) client.status = updateData.status;
        if (updateData.clientStatus) client.clientStatus = updateData.clientStatus;
        if (updateData.remarks) client.remarks = updateData.remarks;

        const updatedClient = await client.save();

        return res.status(200).json({
            success: true,
            message: 'Client updated successfully',
            data: updatedClient
        });

    } catch (error) {
        console.error('Editing client error:', error);
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

// ==================== DELETE CLIENT ====================
exports.deleteClient = async (req, res) => {
    const { id } = req.params; 
    try {
        const client = await Client.findById(id);

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found"
            });
        }

        // ✅ Proper ObjectId comparison
        const userId = req.user?.id?.toString();
        const createdBy = client.createdBy?.toString();

        // ✅ Agar employee ya sales hai aur client usne nahi banaya toh deny
        if (req.user && (req.user.role === 'employee' || req.user.role === 'sales') && createdBy !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only delete your own clients.'
            });
        }

        await Client.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Client deleted successfully"
        });

    } catch (error) {
        console.error("Delete client error", error);
        return res.status(500).json({
            success: false,
            message: "Server error during delete client",
            error: error.message
        });
    }
};