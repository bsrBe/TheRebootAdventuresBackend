import * as brevo from '@getbrevo/brevo';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async ({ to, subject, html, text }: SendEmailParams) => {
  try {
    // Initialize Brevo API client
    const apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY || ''
    );

    // Prepare email
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = {
      name: process.env.EMAIL_FROM_NAME || 'Reboot Adventures',
      email: process.env.EMAIL_FROM_ADDRESS || 'no-reply@rebootadventures.com',
    };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    
    if (text) {
      sendSmtpEmail.textContent = text;
    }

    // Send email
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("📧 Email sent successfully via Brevo:", response.body.messageId);
    return response;
  } catch (error: any) {
    console.error("❌ Error sending email:", {
      message: error?.message,
      status: error?.response?.status,
      body: error?.response?.body,
    });
    throw error;
  }
};