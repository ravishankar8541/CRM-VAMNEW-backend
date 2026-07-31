const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const sendPasswordResetEmail = async (email, resetToken, username) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  const mailOptions = {
    from: `"Viral Ads Media" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '🔐 Password Reset Request - Viral Ads Media CRM',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #f1f5f9; }
          .header { background: linear-gradient(135deg, #f97316, #ea580c); padding: 30px; text-align: center; }
          .header h1 { color: white; font-size: 24px; margin: 0; font-weight: 700; }
          .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0 0; }
          .content { padding: 35px 40px; }
          .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
          .message { font-size: 15px; color: #334155; line-height: 1.7; margin-bottom: 25px; }
          .user-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 25px; font-size: 14px; }
          .user-info strong { color: #0f172a; }
          .button-container { text-align: center; margin: 30px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: #ffffff; padding: 14px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(249, 115, 22, 0.3); transition: all 0.3s ease; }
          .button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(249, 115, 22, 0.4); }
          .token-display { background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; text-align: center; font-family: 'Courier New', monospace; font-size: 14px; color: #0f172a; margin: 20px 0; word-break: break-all; }
          .footer-note { font-size: 13px; color: #64748b; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px; }
          .footer { background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
          .footer p { font-size: 12px; color: #94a3b8; margin: 0; }
          .badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset</h1>
            <p>Viral Ads Media CRM - Secure Password Reset</p>
          </div>
          
          <div class="content">
            <div class="greeting">Hello, ${username}!</div>
            
            <p class="message">
              We received a request to reset your password for your Viral Ads Media CRM account. 
              Click the button below to set a new password. This link will expire in 1 hour.
            </p>
            
            <div class="user-info">
              <strong>👤 Account:</strong> ${username} (${email})
            </div>
            
            <div class="button-container">
              <a href="${resetUrl}" class="button">🔑 Reset Password</a>
            </div>
            
            <p style="font-size: 13px; color: #475569; text-align: center; margin-top: 10px;">
              Or copy and paste this link in your browser:
            </p>
            <div class="token-display">
              ${resetUrl}
            </div>
            
            <div class="footer-note">
              <p style="margin-bottom: 8px;"><span class="badge">⏰ 1 hour expiry</span></p>
              <p style="font-size: 13px; color: #64748b;">
                If you didn't request this password reset, please ignore this email or 
                <a href="mailto:info@viraladsmedia.com" style="color: #ea580c; text-decoration: none; font-weight: 500;">contact support</a>.
              </p>
            </div>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Viral Ads Media. All rights reserved.</p>
            <p style="font-size: 11px; color: #cbd5e1; margin-top: 4px;">
              This is a system-generated email from Viral Ads Media CRM.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendPasswordResetEmail };