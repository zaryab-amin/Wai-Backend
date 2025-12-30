const nodemailer = require("nodemailer");
const Handlebars = require("handlebars");
const { getConfig } = require("../../../config/vars");
const { stripHtml } = require("../../utils/sanitize");
const { readFileSync } = require("fs");
const { join } = require("path");
const { ConfidentialClientApplication } = require("@azure/msal-node");

// Load environment variables
require("dotenv").config();

// OAuth2 configuration for Microsoft Graph API
const getOAuth2Config = () => {
  const currentConfig = getConfig();
  const clientId = currentConfig.email?.clientId || process.env.EMAIL_CLIENT_ID;
  const clientSecret =
    currentConfig.email?.clientSecret || process.env.EMAIL_CLIENT_SECRET;
  const tenantId = currentConfig.email?.tenantId || process.env.EMAIL_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error(
      "OAuth2 configuration is incomplete. Please check EMAIL_CLIENT_ID, EMAIL_CLIENT_SECRET, and EMAIL_TENANT_ID"
    );
  }

  return {
    auth: {
      clientId: clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret: clientSecret,
    },
  };
};

// Scopes for Microsoft Graph API and Exchange SMTP AUTH
const graphScopes = ["https://graph.microsoft.com/.default"];
const smtpScopes = ["https://outlook.office365.com/.default"];

// Create MSAL application for OAuth2
let msalClient = null;

// Get OAuth2 access token
const getAccessToken = async (resource = "graph") => {
  try {
    if (!msalClient) {
      const oauth2Config = getOAuth2Config();
      msalClient = new ConfidentialClientApplication(oauth2Config);
    }

    const scopesToUse = resource === "graph" ? graphScopes : smtpScopes;
    const result = await msalClient.acquireTokenByClientCredential({
      scopes: scopesToUse,
    });

    if (!result) {
      throw new Error("Failed to acquire access token");
    }

    return result.accessToken;
  } catch (error) {
    console.error("❌ Error acquiring OAuth2 access token:", error);
    throw error;
  }
};

// Create a pooled transporter (reused) for robustness
let pooledTransporter = null;
const createTransporter = async () => {
  const currentConfig = getConfig();

  // Use environment variables directly if config is not available
  const host =
    currentConfig.email?.host ||
    currentConfig.emailConfig?.host ||
    process.env.EMAIL_HOST ||
    process.env.SMTP_HOST;
  const port =
    currentConfig.email?.port ||
    currentConfig.emailConfig?.port ||
    parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || "587");
  const user =
    currentConfig.email?.user ||
    currentConfig.emailConfig?.username ||
    process.env.EMAIL_USER ||
    process.env.SMTP_USERNAME;
  const pass =
    currentConfig.email?.pass ||
    currentConfig.emailConfig?.password ||
    process.env.EMAIL_PASS ||
    process.env.SMTP_PASSWORD;
  const from =
    currentConfig.email?.from ||
    currentConfig.email ||
    process.env.EMAIL_FROM ||
    process.env.EMAIL;
  const useOAuth2 =
    currentConfig.email?.useOAuth2 || process.env.EMAIL_USE_OAUTH2 === "true";

  console.log("📧 Creating email transporter with config:", {
    host,
    port,
    user,
    from,
    secure: port === 465,
    useOAuth2,
  });

  let authConfig;

  if (useOAuth2) {
    // Use OAuth2 authentication for Outlook
    console.log("🔐 Using OAuth2 authentication for Outlook");
    // IMPORTANT: For SMTP XOAUTH2, token must target Outlook resource, not Graph
    const accessToken = await getAccessToken("smtp");

    authConfig = {
      type: "OAuth2",
      user: user,
      clientId: currentConfig.email?.clientId || process.env.EMAIL_CLIENT_ID,
      clientSecret:
        currentConfig.email?.clientSecret || process.env.EMAIL_CLIENT_SECRET,
      tenantId: currentConfig.email?.tenantId || process.env.EMAIL_TENANT_ID,
      accessToken: accessToken,
    };
  } else {
    // Use password authentication (fallback)
    console.log("🔑 Using password authentication");
    authConfig = {
      user: user,
      pass: pass,
    };
  }

  const transporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465, // true for 465, false for other ports
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    auth: authConfig,
    // Additional options for SMTP
    tls: {
      rejectUnauthorized: false,
    },
    // Connection timeout
    connectionTimeout: 60000,
    // Greeting timeout
    greetingTimeout: 30000,
    // Socket timeout
    socketTimeout: 60000,
  });

  // Verify connection configuration
  transporter.verify((error, success) => {
    if (error) {
      console.error("❌ Email transporter verification failed:", error);
    } else {
      console.log("✅ Email transporter verified successfully");
    }
  });

  return transporter;
};

// Load and compile template
const loadTemplate = (templateName) => {
  try {
    // First try to load as HTML file
    const htmlPath = join(__dirname, "templates", `${templateName}.html`);
    try {
      const htmlContent = readFileSync(htmlPath, "utf-8");
      return Handlebars.compile(htmlContent);
    } catch (htmlError) {
      // If HTML not found, try HBS file
      const templatePath = join(__dirname, "templates", `${templateName}.hbs`);
      const templateContent = readFileSync(templatePath, "utf-8");
      return Handlebars.compile(templateContent);
    }
  } catch (error) {
    throw new Error(`Template ${templateName} not found`);
  }
};

// Send email with custom template
const sendEmail = async (options) => {
  try {
    console.log("📧 Attempting to send email:", {
      to: options.to,
      subject: options.subject,
      template: options.template,
    });

    const currentConfig = getConfig();
    const useOAuth2 =
      currentConfig.email?.useOAuth2 || process.env.EMAIL_USE_OAUTH2 === "true";

    // Try Microsoft Graph API first, fallback to SMTP (optional)
    if (useOAuth2) {
      try {
        await sendEmailViaGraphAPI(options);
        return;
      } catch (graphError) {
        console.log(
          "⚠️ Microsoft Graph API failed:",
          graphError?.message || graphError
        );
        const disableSmtpFallback =
          currentConfig.email?.disableSmtpFallback ||
          process.env.EMAIL_DISABLE_SMTP_FALLBACK === "true";
        if (disableSmtpFallback) {
          throw graphError;
        }
        console.log("↩️ Falling back to SMTP...");
      }
    }

    // Fallback to SMTP
    if (!pooledTransporter) {
      pooledTransporter = await createTransporter();
    }
    const transporter = pooledTransporter;
    const template = loadTemplate(options.template);

    // Compile the template with context
    const html = template(options.context);

    // Log the rendered HTML content for SMTP fallback
    console.log("📧 SMTP Fallback - Rendered HTML Content:");
    console.log("=".repeat(80));
    console.log(html);
    console.log("=".repeat(80));

    const mailOptions = {
      from: currentConfig.email?.from || currentConfig.email,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      html: html,
    };

    console.log("📧 Mail options prepared:", {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      htmlLength: html.length,
    });

    // Retry SMTP on transient errors (4xx/connection) but NOT on 535 auth failures
    const sendWithRetry = async (attempt = 1) => {
      try {
        return await transporter.sendMail(mailOptions);
      } catch (smtpError) {
        const isAuthError =
          smtpError?.responseCode === 535 || smtpError?.code === "EAUTH";
        const isTransient =
          smtpError?.code === "ETIMEDOUT" ||
          smtpError?.code === "ECONNECTION" ||
          smtpError?.responseCode?.toString().startsWith("4");
        if (!isAuthError && isTransient && attempt < 3) {
          const delayMs = 500 * attempt;
          console.log(
            `⏳ SMTP transient error, retrying in ${delayMs}ms (attempt ${
              attempt + 1
            }/3)`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          return sendWithRetry(attempt + 1);
        }
        throw smtpError;
      }
    };

    const result = await sendWithRetry(1);
    console.log("✅ Email sent successfully:", {
      messageId: result.messageId,
      response: result.response,
    });
  } catch (error) {
    console.error("❌ Email sending error:", {
      message: error.message,
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      response: error.response,
      stack: error.stack,
    });

    // Provide more specific error messages
    let errorMessage = "Failed to send email";
    if (error.code === "EAUTH") {
      errorMessage =
        "Email authentication failed. Please check your email credentials.";
    } else if (error.code === "ECONNECTION") {
      errorMessage =
        "Email connection failed. Please check your email server settings.";
    } else if (error.code === "ETIMEDOUT") {
      errorMessage = "Email connection timed out. Please try again.";
    } else if (error.responseCode === 535) {
      errorMessage =
        "Email authentication failed. Invalid username or password.";
    } else if (error.responseCode === 550) {
      errorMessage = "Email delivery failed. Recipient address may be invalid.";
    }

    throw new Error(errorMessage);
  }
};

// Send email via Microsoft Graph API
const sendEmailViaGraphAPI = async (options) => {
  try {
    console.log("📧 Sending email via Microsoft Graph API...");

    const accessToken = await getAccessToken("graph");
    const template = loadTemplate(options.template);

    // Compile the template with context
    const html = template(options.context);

    // Log the rendered HTML content
    console.log("📧 Rendered HTML Content:");
    console.log("=".repeat(80));
    console.log(html);
    console.log("=".repeat(80));

    // Prepare email message for Graph API
    const emailMessage = {
      message: {
        subject: options.subject,
        body: {
          contentType: "HTML",
          content: html,
        },
        toRecipients: Array.isArray(options.to)
          ? options.to.map((email) => ({ emailAddress: { address: email } }))
          : [{ emailAddress: { address: options.to } }],
      },
    };

    const currentConfig = getConfig();
    const user = currentConfig.email?.user || process.env.EMAIL_USER;

    // Send email using Microsoft Graph API
    const maxRetries = Number.isFinite(currentConfig.email?.graphMaxRetries)
      ? currentConfig.email.graphMaxRetries
      : 5;
    const baseDelay = Number.isFinite(currentConfig.email?.graphRetryBaseMs)
      ? currentConfig.email.graphRetryBaseMs
      : 1000;

    let attempt = 0;
    while (true) {
      attempt++;
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${user}/sendMail`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailMessage),
        }
      );

      if (response.ok) {
        break;
      }

      const status = response.status;
      const errorText = await response.text();
      const isRetryable = status === 429 || (status >= 500 && status < 600);
      if (!isRetryable || attempt > maxRetries) {
        throw new Error(`Graph API error: ${status} - ${errorText}`);
      }
      const delay = Math.min(15000, baseDelay * Math.pow(2, attempt - 1));
      console.log(
        `⏳ Graph API ${status}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    console.log("✅ Email sent successfully via Microsoft Graph API!");
  } catch (error) {
    console.error("❌ Microsoft Graph API error:", error);
    throw error;
  }
};

// Send email to any email address
const sendEmailToUser = async (options) => {
  try {
    const { email, subject, template, context } = options;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    // Add default context
    const emailContext = {
      ...context,
      user: {
        fullName: context?.user?.fullName || "User",
        username: context?.user?.username || "user",
        email: email,
        role: context?.user?.role || "user",
      },
      portalUrl: process.env.PORTAL_URL || "https://www.iae.com.pk/",
    };

    await sendEmail({
      to: email,
      subject,
      template,
      context: emailContext,
    });
  } catch (error) {
    console.error("Send email to user error:", error);
    throw new Error("Failed to send email to user");
  }
};

// Send emails to addresses from CSV file
const sendCSVEmail = async (options) => {
  try {
    const { emails, subject, template, context, type } = options;
    console.log("type service method: ", type);
    if (!emails || emails.length === 0) {
      throw new Error("No email addresses provided");
    }

    // Reuse sendEmail flow (Graph first, SMTP fallback) per recipient
    let successCount = 0;
    let failureCount = 0;
    const failedEmails = [];

    const currentConfig = getConfig();
    // Send emails in batches to avoid throttling
    const batchSize =
      Number.isFinite(currentConfig.email?.batchSize) &&
      currentConfig.email.batchSize > 0
        ? currentConfig.email.batchSize
        : 5;
    const throttleMs =
      Number.isFinite(currentConfig.email?.throttleMsBetweenEmails) &&
      currentConfig.email.throttleMsBetweenEmails >= 0
        ? currentConfig.email.throttleMsBetweenEmails
        : 2000;

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);

      const sendOne = async (email, idx) => {
        try {
          const emailContext = {
            ...context,
            user: {
              fullName: context?.user?.fullName || "User",
              username: context?.user?.username || "user",
              email: email,
              role: context?.user?.role || "user",
            },
            portalUrl: process.env.PORTAL_URL || "https://www.iae.com.pk/",
          };

          // Optional per-email throttle to respect message-per-minute limits
          if (throttleMs > 0 && idx > 0) {
            await new Promise((resolve) => setTimeout(resolve, throttleMs));
          }

          await sendEmail({
            to: email,
            subject,
            template,
            context: emailContext,
          });
          successCount++;
          // ✅ Save log for each successful email (if EmailLogService is available)
          try {
            const EmailLogService = require("../emailLog/emailLog.service");
            await EmailLogService.createEmailLog({
              subject,
              userEmail: email,
              type,
              sentAt: new Date(),
              sentBy: "admin",
              file: options.file,
            });
          } catch (logError) {
            console.log("Email log service not available:", logError.message);
          }
        } catch (error) {
          console.error(`Failed to send email to ${email}:`, error);
          failureCount++;
          failedEmails.push(email);
        }
      };

      const sequential =
        currentConfig.email?.sequential ||
        process.env.EMAIL_SEQUENTIAL === "true";
      if (sequential) {
        for (let j = 0; j < batch.length; j++) {
          await sendOne(batch[j], j);
          if (throttleMs > 0 && j < batch.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, throttleMs));
          }
        }
      } else {
        await Promise.all(batch.map((email, idx) => sendOne(email, idx)));
      }

      // Add a small delay between batches to be respectful to the SMTP server
      if (i + batchSize < emails.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(1000, throttleMs))
        );
      }
    }

    return {
      successCount,
      failureCount,
      totalEmails: emails.length,
      failedEmails,
    };
  } catch (error) {
    console.error("CSV email sending error:", error);
    throw new Error("Failed to send CSV emails");
  }
};

// Legacy email functions for backward compatibility
exports.sendLogin = async (user) => {
  const config = getConfig();
  const emailConfig = {
    from: config.email?.from || config.email,
    to: user.email,
    subject: "User logged in successfully",
    text: `Dear ${stripHtml(user.name)},
    
    We're writing to inform you that you have successfully logged in to your account on ${stripHtml(
      user.email
    )}. We are glad to have you with us and we hope you enjoy your experience.
    
    If you have any questions or need assistance, please don't hesitate to contact our support team at info@IAE.com.
    
    Best regards,
    The IAE Team`,

    html: `<div>
    <p>Dear ${stripHtml(user.name)},</p>
    <br/>
    <p>We're writing to inform you that you have successfully logged in to your account on ${stripHtml(
      user.email
    )}. We are glad to have you with us and we hope you enjoy your experience.</p>
    <br/>
    <p>If you have any questions or need assistance, please don't hesitate to contact our support team at <a href="mailto:info@IAE.com">info@IAE.com</a>.</p>
    <br/>
    <p>Best regards,<br/>
    The IAE Team</p>
    </div>`,
  };

  try {
    // Log the HTML content for legacy emails
    console.log("📧 Legacy Email - Rendered HTML Content:");
    console.log("=".repeat(80));
    console.log(emailConfig.html);
    console.log("=".repeat(80));
    const emailTransporter = await createTransporter();
    return emailTransporter
      .sendMail(emailConfig)
      .then((info) =>
        console.log(`Email verification instructions Sent: ${info.response}`)
      )
      .catch((err) => console.log(`Problem sending email: ${err}`));
  } catch (error) {
    console.log(error);
  }
};

exports.sendSupportForm = async (formData) => {
  const config = getConfig();

  const emailConfig = {
    from: formData.email,
    to: config.supportEmail,
    subject: `New Support Request: ${stripHtml(formData.subject)}`,
    text: `You have received a new customer support request.
      Full Name: ${stripHtml(formData.firstName)} ${stripHtml(
      formData.lastName
    )}
      Email: ${stripHtml(formData.email)}
      Subject: ${stripHtml(formData.subject)}
      Message: ${stripHtml(formData.message)}
      `,
    html: `<div>
      <h2>New Customer Support Request</h2>
      <p><strong>Full Name:</strong> ${stripHtml(
        formData.firstName
      )} ${stripHtml(formData.lastName)}</p>
      <p><strong>Email:</strong> ${stripHtml(formData.email)}</p>
      <p><strong>Subject:</strong> ${stripHtml(formData.subject)}</p>
      <p><strong>Message:</strong> ${stripHtml(formData.message)}</p>
    </div>`,
  };

  try {
    // Log the HTML content for support emails
    console.log("📧 Support Email - Rendered HTML Content:");
    console.log("=".repeat(80));
    console.log(emailConfig.html);
    console.log("=".repeat(80));
    const emailTransporter = await createTransporter();
    return emailTransporter
      .sendMail(emailConfig)
      .then((info) => console.log(`Support form email sent: ${info.response}`))
      .catch((err) =>
        console.log(`Problem sending support form email: ${err}`)
      );
  } catch (error) {
    console.log("Unexpected error while sending support form email:", error);
  }
};

exports.sendInvitationLink = async (user) => {
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: "You're Invited to Join IAE",
      template: "invitation-link",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        inviteUrl: `${config?.clientURL}/invite/${user.inviteKey}`,
        clientURL: config?.clientURL,
      },
    });
    console.log("✅ Invitation link sent successfully via modern system");
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: "You're Invited to Join IAE",
      text: `Dear ${stripHtml(user.name)},
      You have been invited to join IAE. Please click the link below to accept the invitation and complete your registration:
      ${config?.clientURL}/invite/${stripHtml(user.inviteKey)}
      If you did not expect this invitation, please ignore this email.`,
      html: `<div>
      <p>Dear ${stripHtml(user.name)},</p>
      <br/>
      <p>You have been invited to join <strong>IAE</strong>. Please click the link below to accept the invitation and complete your registration:</p>
      <p><a href="${config?.clientURL}/invite/${stripHtml(
        user.inviteKey
      )}" target="_blank">${config?.clientURL}/invite/${stripHtml(
        user.inviteKey
      )}</a></p>
      <br/>
      <p>If you did not expect this invitation, please ignore this email.</p>
      </div>`,
    };

    try {
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(`Email verification instructions Sent: ${info.response}`)
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

exports.sendEmailVerification = async (user, token, password) => {
  const config = getConfig();

  try {
    await sendEmail({
      to: user.email,
      subject: "Complete Your Registration - Set Password",
      template: "email-verification",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        verificationUrl: `${config?.clientURL}/set-password?token=${token}`,
        clientURL: config?.clientURL,
      },
    });
    console.log("Email verification sent successfully via modern system");
  } catch (error) {
    console.log("Modern email failed, falling back to legacy method:", error.message);

    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: "Complete Your Registration - Set Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #fff; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333;">Welcome, ${user.name}!</h2>
          <p>Click below to set your password and complete registration:</p>
          <a href="${config?.clientURL}/set-password?token=${token}" 
             style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Set Your Password
          </a>
          <p><small>Link expires in 15 minutes.</small></p>
          <hr>
          <p>Best,<br>The IAE Team</p>
        </div>
      `,
    };

    try {
      const emailTransporter = await createTransporter();
      await emailTransporter.sendMail(emailConfig);
      console.log("Legacy email sent successfully");
    } catch (fallbackError) {
      console.log("Legacy email failed:", fallbackError);
    }
  }
};

exports.sendOrganizationEmailVerification = async (user, token) => {
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: "IAE Invitation",
      template: "organization-email-verification",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        verificationUrl: `${config?.clientURL}/verify-organization-email/?auth=${token}`,
        clientURL: config?.clientURL,
      },
    });
    console.log(
      "✅ Organization email verification sent successfully via modern system"
    );
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: "IAE Invitation",
      text: `Dear ${stripHtml(user.name)},
      We are glad to have you with us and we hope you enjoy your experience.`,
      html: `<div style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; padding: 20px;">
          <div style="max-width: 700px; margin: 0 auto; background: #fff; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
              <h2 style="margin-bottom: 20px; color: #333;">Welcome to Our Community, ${stripHtml(
                user.name
              )}!</h2>
              <p>We're thrilled to have you with us! 🎉 To get started, please verify your email by clicking on the link below:</p>
              <a href="${stripHtml(
                config?.clientURL
              )}/verify-organization-email/?auth=${stripHtml(
        token
      )}" style="display: inline-block; background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px;">Verify Email Address</a>
              <p style="margin-top: 20px;">Once verified, you'll have full access to all of our features and community resources. We hope you enjoy your experience!</p>
               <br/>
      <p>If you have any questions or need assistance, please don't hesitate to contact our support team at <a href="mailto:info@IAE.com">info@IAE.com</a>.</p>
      <br/>
              <p style="margin-top: 30px; color: #888;">Cheers,</p>
              <p style="margin: 0; color: #888;">The IAE Team</p>
          </div>
      </div>`,
    };

    try {
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(`Email verification instructions Sent: ${info.response}`)
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

exports.sendVerifyLogin = async (user, token) => {
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: "IAE Login",
      template: "login-verification",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        loginUrl: `${config?.clientURL}/verify-login/?auth=${token}`,
        clientURL: config?.clientURL,
      },
    });
    console.log(
      "✅ Login verification email sent successfully via modern system"
    );
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: "IAE Login",
      text: `Dear ${stripHtml(user.name)},
      We're writing to inform you that you have successfully logged in to your account on ${stripHtml(
        user.email
      )}. We are glad to have you with us and we hope you enjoy your experience.`,
      html: `<div>
      <p>Dear ${stripHtml(user.name)}</p>
      <br/>
      <p>You have requested a login link for IAE. Please click the link below to login:</p>
      <br />
      <p>Click here to login: ${stripHtml(
        config?.clientURL
      )}/verify-login/?auth=${stripHtml(token)}</p>
      <br />
      <p>If you did not request this login link, please ignore this email.</p>
      <br />
       <br/>
      <p>If you have any questions or need assistance, please don't hesitate to contact our support team at <a href="mailto:info@IAE.com">info@IAE.com</a>.</p>
      <br/>
      <p>Thank you,</p>
      <p>IAE Team</p> 
    </div>`,
    };

    try {
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(`Email verification instructions Sent: ${info.response}`)
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

exports.sendQuizInvite = async (user, token, quiz) => {
  console.log(quiz);
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: `Invitation to Attempt ${quiz.name}`,
      template: "quiz-invite",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        quiz: {
          name: quiz.name,
          quizId: quiz.quizId,
        },
        quizUrl: `${config?.clientURL}/verify-user/${quiz.quizId}/?auth=${token}`,
        clientURL: config?.clientURL,
      },
    });
    console.log("✅ Quiz invite sent successfully via modern system");
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: `Invitation to Attempt ${stripHtml(quiz.name)}`,
      html: `<div>
      <p>Dear ${stripHtml(user.name)}</p>
      <br/>
      <p>I hope this email finds you well. We are pleased to invite you to attempt the ${stripHtml(
        quiz.name
      )}</p>
      <br />
      <p>To access the exam, please click on the following link:  <a href="${stripHtml(
        config?.clientURL
      )}/verify-user/${stripHtml(quiz.quizId)}/?auth=${stripHtml(
        token
      )}">Exam Link</a></p>
      <br />
      <h2>Instructions:</h2>
      <br/>
      <ol>
        <li>Make sure you have a stable internet connection.</li>
        <li>Read all questions carefully before answering.</li>
      </ol>  
       <br/>
      <p>If you have any questions or need assistance, please don't hesitate to contact our support team at <a href="mailto:info@IAE.com">info@IAE.com</a>.</p>
      <br/>
      <br />
      <p>Best of luck!</p>
      <br />
      <p>Thank you,</p>
      <p>IAE Team</p> 
    </div>`,
    };

    try {
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(`Email verification instructions Sent: ${info.response}`)
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

exports.sendCourseInvite = async (user, token, course) => {
  console.log(course);
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: `Invitation to Join ${course.name}`,
      template: "course-invite",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        course: {
          name: course.name,
          courseId: course.courseId,
        },
        courseUrl: `${config?.clientURL}/verify-course-user/${course.courseId}/?auth=${token}`,
        clientURL: config?.clientURL,
      },
    });
    console.log("✅ Course invite sent successfully via modern system");
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: `Invitation to Join ${stripHtml(course.name)}`,
      html: `<div>
      <p>Dear ${stripHtml(user.name)}</p>
      <br/>
      <p>I hope this email finds you well. We are pleased to invite you to join the course ${stripHtml(
        course.name
      )}</p>
      <br />
      <p>To access the course, please click on the following link:  <a href="${stripHtml(
        config?.clientURL
      )}/verify-course-user/${stripHtml(course.courseId)}/?auth=${stripHtml(
        token
      )}">Course Link</a></p>
      <br />
      <h2>Instructions:</h2>
      <br/>
      <ol>
        <li>Make sure you have a stable internet connection.</li>
        <li>Read all the course materials carefully before starting.</li>
      </ol>  
       <br/>
      <p>If you have any questions or need assistance, please don't hesitate to contact our support team at <a href="mailto:info@IAE.com">info@IAE.com</a>.</p>
      <br/>
      <br />
      <p>Best of luck!</p>
      <br />
      <p>Thank you,</p>
      <p>IAE Team</p> 
    </div>`,
    };

    try {
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(`Email verification instructions sent: ${info.response}`)
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

exports.sendOrganizationVerifyLogin = async (user, token) => {
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: "Magic link for Organization Login",
      template: "organization-verify-login",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        loginUrl: `${config?.clientURL}/verify-organization-login/?auth=${token}`,
        clientURL: config?.clientURL,
      },
    });
    console.log(
      "✅ Organization verify login sent successfully via modern system"
    );
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: "Magic link for Organization Login",
      text: `Dear ${stripHtml(user.name)},
      We're writing to inform you that you have successfully logged in to your account on ${stripHtml(
        user.email
      )}. We are glad to have you with us and we hope you enjoy your experience.`,
      html: `<div>
      <p>Dear ${stripHtml(user.name)}</p>
      <br/>
      <p>You have requested a login link for IAE. Please click the link below to login:</p>
      <br />
      <p>Click here to login: <a href="${stripHtml(
        config?.clientURL
      )}/verify-organization-login/?auth=${stripHtml(token)}">Login Link</a></p>
      <br />
      <p>If you did not request this login link, please ignore this email.</p>
      <br />
      <p>Thank you,</p>
      <p>IAE Team</p> 
    </div>`,
    };

    try {
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(`Email verification instructions Sent: ${info.response}`)
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

// course creation
exports.sendCourseCreation = async (course, user) => {
  const config = getConfig();
  const emailConfig = {
    from: config.email?.from || config.email,
    to: user.email,
    subject: "Course Created Successfully",
    text: `${stripHtml(course)} has been created successfully`,
    html: `<p>${stripHtml(course)} has been created successfully</p>`,
  };
  try {
    // Log the HTML content for legacy emails
    console.log("📧 Legacy Email - Rendered HTML Content:");
    console.log("=".repeat(80));
    console.log(emailConfig.html);
    console.log("=".repeat(80));
    const emailTransporter = await createTransporter();
    return emailTransporter
      .sendMail(emailConfig)
      .then((info) =>
        console.log(`Email verfication instructions Sent: ${info.response}`)
      )
      .catch((err) => console.log(`Problem sending email: ${err}`));
  } catch (error) {
    console.log(error);
  }
};

// course payment cancel
exports.sendPaymentCancel = async (course, user) => {
  const config = getConfig();
  const emailConfig = {
    from: config.email?.from || config.email,
    to: user.email,
    subject: "Payment Cancelled",
    text: `${stripHtml(course)} payment cancelled.`,
    html: `<p>${stripHtml(course)} payment cancelled.</p>`,
  };
  try {
    // Log the HTML content for legacy emails
    console.log("📧 Legacy Email - Rendered HTML Content:");
    console.log("=".repeat(80));
    console.log(emailConfig.html);
    console.log("=".repeat(80));
    const emailTransporter = await createTransporter();
    return emailTransporter
      .sendMail(emailConfig)
      .then((info) =>
        console.log(`Email verfication instructions Sent: ${info.response}`)
      )
      .catch((err) => console.log(`Problem sending email: ${err}`));
  } catch (error) {
    console.log(error);
  }
};

// course complation
exports.sendCourseCompletion = async (courseName, user) => {
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: "Congratulations on Completing",
      template: "course-completion",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        courseName: courseName,
        clientURL: config?.clientURL,
      },
    });
    console.log(
      "✅ Course completion email sent successfully via modern system"
    );
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: " Congratulations on Completing",
      text: `Congratulations! We're thrilled to inform you that you have successfully completed the course ${courseName} on IAE. You've put in a lot of effort and hard work, and we're proud of you for making it this far.

      We hope that you've gained valuable knowledge and skills from this course that will help you in your personal and professional life. We also encourage you to continue learning and exploring new subjects on our platform.
      
      As a token of appreciation, we're awarding you with a certificate of completion for the course. You can access and download your certificate from your account dashboard.
      
      Once again, congratulations on your accomplishment and thank you for choosing IAE as your learning platform!`,
      html: `<p>Congratulations! We're thrilled to inform you that you have successfully completed the course ${courseName} on IAE. You've put in a lot of effort and hard work, and we're proud of you for making it this far.

      We hope that you've gained valuable knowledge and skills from this course that will help you in your personal and professional life. We also encourage you to continue learning and exploring new subjects on our platform.
      
      As a token of appreciation, we're awarding you with a certificate of completion for the course. You can access and download your certificate from your account dashboard.
      
      Once again, congratulations on your accomplishment and thank you for choosing IAE as your learning platform!</p>`,
    };

    try {
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(`Email verification instructions Sent: ${info.response}`)
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

const requestForCourseEmail = (body) => {
  const emailHeaderStyle = `
    background-color: purple;
    color: white;
    padding: 20px;
    text-align: center;
    font-size: 24px;
    font-weight: bold;
  `;

  const emailBodyStyle = `
    background-color: white;
    padding: 20px;
    color: black;
    font-size: 16px;
  `;

  return `
    <div>
      <div style="${stripHtml(emailHeaderStyle)}">
        <h1>IAE</h1>
      </div>
      <div style="${stripHtml(emailBodyStyle)}">

        <p><strong>Price Range:</strong> ${stripHtml(body.priceRange)}</p>

        <p>Dear IAE,</p>

        <p>I am writing to request a new course for your academy. The details of the course are as follows:</p>

        <p><strong>Title:</strong> ${stripHtml(body.title)}</p>
        <p><strong>Duration:</strong> ${stripHtml(body.duration)}</p>
        <p><strong>Table of Contents:</strong> ${stripHtml(
          body.tableOfContents
        )}</p>
        <p><strong>Lecture Type:</strong> ${stripHtml(body.lectureType)}</p>
        <p><strong>How Soon:</strong> ${stripHtml(body.howSoon)}</p>
        <p><strong>Price Range:</strong> ${stripHtml(body.priceRange)}</p>

        <p>Please consider my request, as I believe this course will be valuable for the students at IAE.</p>

        <p>Thank you for your attention. I look forward to hearing from you.</p>

        <p>Best regards,</p>
        <p>Your ${stripHtml(body.name)}</p>
      </div>
    </div>
  `;
};

exports.sendRequestForCourse = async (body, user) => {
  const config = getConfig();
  const emailConfig = {
    to: config.email,
    from: user.email,
    subject: "Request For Course",
    text: requestForCourseEmail(body),
    html: requestForCourseEmail(body),
  };
  try {
    // Log the HTML content for legacy emails
    console.log("📧 Legacy Email - Rendered HTML Content:");
    console.log("=".repeat(80));
    console.log(emailConfig.html);
    console.log("=".repeat(80));
    const emailTransporter = await createTransporter();
    return emailTransporter
      .sendMail(emailConfig)
      .then((info) => console.log(`Request for Course Sent: ${info.response}`))
      .catch((err) => console.log(`Problem sending email: ${err}`));
  } catch (error) {
    console.log(error);
  }
};

exports.sendUpgradeNotification = async (user) => {
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: "Action Required: Upgrade Your Organization Account",
      template: "upgrade-notification",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        upgradeUrl: `${config?.clientURL}/settings`,
        clientURL: config?.clientURL,
      },
    });
    console.log("✅ Upgrade notification sent successfully via modern system");
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: "Action Required: Upgrade Your Organization Account",
      text: `Dear ${stripHtml(user.name)},
      
      Your organization has reached the maximum number of users allowed. To add more users, please upgrade your users limit.

      Visit the link below to upgrade your account:
      ${config?.clientURL}/settings

      If you have any questions, feel free to contact support.

      Best regards,
      IAE Team`,
      html: `<div>
      <p>Dear ${stripHtml(user?.name)},</p>
      <br/>
      <p>Your organization has reached the maximum number of users allowed. To add more users, please upgrade your users limit.</p>
      <p>Visit the link below to upgrade your account:</p>
      <p><a href="${config?.clientURL}/settings" target="_blank">${
        config?.clientURL
      }/settings</a></p>
      <br/>
      <p>If you have any questions, feel free to contact support.</p>
      <br/>
      <p>Best regards,</p>
      <p>IAE Team</p>
      </div>`,
    };

    try {
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      // Log the HTML content for legacy emails
      console.log("📧 Legacy Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(`Email for Account Upgrade Sent: ${info.response}`)
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

exports.sendCoursePurchased = async (courseName, user) => {
  const config = getConfig();

  // Use the modern sendEmail function with Microsoft Graph API
  try {
    await sendEmail({
      to: user.email,
      subject: "Course Purchase Confirmation - IAE",
      template: "course-purchased",
      context: {
        user: {
          name: user.name,
          email: user.email,
        },
        courseName: courseName,
        clientURL: config?.clientURL,
      },
    });
    console.log(
      "✅ Course purchased email sent successfully via modern system"
    );
  } catch (error) {
    console.log(
      "⚠️ Modern email failed, falling back to legacy method:",
      error.message
    );

    // Fallback to legacy method
    const emailConfig = {
      from: config.email?.from || config.email,
      to: user.email,
      subject: "Course Purchase Confirmation - IAE",
      text: `Dear ${stripHtml(user.name)},
      Thank you for purchasing ${stripHtml(courseName)} from IAE.
      You can now access your course 
      If you have any questions, please don't hesitate to contact our support team.
      Best regards,
      IAE Team`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Course Purchase Confirmation</h1>
        </div>
        
        <div style="padding: 20px; background-color: #ffffff;">
          <p>Dear ${stripHtml(user.name)},</p>
          
          <p>Thank you for purchasing <strong>${stripHtml(
            courseName
          )}</strong> from IAE.</p>
          
          <p>You can now access your course </p>
          
          <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
          
          <p>Best regards,<br>
          IAE Team</p>
        </div>
        
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>`,
    };

    try {
      // Log the HTML content for course purchase emails
      console.log("📧 Course Purchase Email - Rendered HTML Content:");
      console.log("=".repeat(80));
      console.log(emailConfig.html);
      console.log("=".repeat(80));
      const emailTransporter = await createTransporter();
      return emailTransporter
        .sendMail(emailConfig)
        .then((info) =>
          console.log(
            `Course purchase confirmation email sent: ${info.response}`
          )
        )
        .catch((err) => console.log(`Problem sending email: ${err}`));
    } catch (fallbackError) {
      console.log("Legacy email also failed:", fallbackError);
    }
  }
};

exports.sendPurchaseNotifications = async (
  courseInvoice,
  courseName,
  user,
  organizationName,
  organizationEmail
) => {
  // Organization Purchase Notification
  const config = getConfig();
  const organizationEmailConfig = {
    from: config.email?.from || config.email,
    to: organizationEmail,
    subject: "New Course Purchase - IAE",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">New Course Purchase</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>Dear ${organizationName} Admin,</p>
        
        <p>A new purchase has been made for your course:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Course:</strong> ${stripHtml(courseName)}</p>
          <p><strong>User:</strong> ${stripHtml(user.name)} (${stripHtml(
      user?.email
    )})</p>
          <p><strong>Amount:</strong> $${courseInvoice.organizationAmount}</p>
          <p><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${courseInvoice?.organizationInvoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Invoice
          </a>
        </div>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  // Platform Fee Notification
  const platformEmailConfig = {
    from: config.email?.from || config.email,
    to: config.platformAdminEmail, // Platform admin email
    subject: "Platform Fee Received - IAE",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Platform Fee Received</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>New platform fee received for course purchase:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Course:</strong> ${stripHtml(courseName)}</p>
          <p><strong>Organization:</strong> ${stripHtml(organizationName)}</p>
          <p><strong>User:</strong> ${stripHtml(user.name)} (${stripHtml(
      user?.email
    )})</p>
          <p><strong>Total Amount:</strong> $${courseInvoice.amount}</p>
          <p><strong>Platform Fee:</strong> $${courseInvoice.platformFee}</p>
          <p><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${courseInvoice.platformInvoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Details
          </a>
        </div>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  try {
    // Send both emails in parallel
    await Promise.all([
      pooledTransporter
        .sendMail(organizationEmailConfig)
        .then((info) =>
          console.log("Organization notification sent:", info.response)
        )
        .catch((err) =>
          console.log("Error sending organization notification:", err)
        ),

      pooledTransporter
        .sendMail(platformEmailConfig)
        .then((info) =>
          console.log("Platform notification sent:", info.response)
        )
        .catch((err) =>
          console.log("Error sending platform notification:", err)
        ),
    ]);

    console.log("All purchase notifications sent successfully");
  } catch (error) {
    console.log("Error sending purchase notifications:", error);
  }
};

exports.sendOrganizationPurchaseNotification = async (
  courseInvoice,
  courseName,
  user
) => {
  const config = getConfig();
  const emailConfig = {
    from: config.email?.from || config.email,
    to: config.platformAdminEmail,
    subject: "New Course Purchase - IAE",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">New Course Purchase</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>Hello,</p>
        
        <p>A new purchase has been made for your course:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Course:</strong> ${stripHtml(courseName)}</p>
          <p><strong>User:</strong> ${stripHtml(user.name)} (${stripHtml(
      user?.email
    )})</p>
          <p><strong>Amount:</strong> $${courseInvoice.organizationAmount}</p>
          <p><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</p>
          
        </div>
<div style="text-align: center; margin: 30px 0;">
          <a href="${courseInvoice.platformInvoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Details
          </a>
        </div>
        <p>Thank you for being part of IAE.</p>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  try {
    const info = await pooledTransporter.sendMail(emailConfig);
    console.log(`Organization purchase notification sent: ${info.response}`);
    return info;
  } catch (error) {
    console.log("Error sending organization purchase notification:", error);
    throw error;
  }
};

exports.sendSubscriptionPurchaseNotifications = async (
  subscription,
  user,
  organization
) => {
  // Organization Subscription Purchase Notification
  const config = getConfig();
  const organizationEmailConfig = {
    from: config.email?.from || config.email,
    to: organization.signatoryUser.email,
    subject: "New Subscription Purchase - IAE",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">New Subscription Purchase</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>Dear ${organization.name} Admin,</p>
        
        <p>A new subscription has been purchased:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Subscription Plan:</strong> ${subscription.plan}</p>
          <p><strong>Number of Users:</strong> ${subscription.numberOfUsers}</p>
          <p><strong>Amount:</strong> $${subscription.amount}</p>
          
          <p><strong>Start Date:</strong> ${new Date(
            subscription.billingCycleStartDate
          ).toLocaleDateString()}</p>
          <p><strong>End Date:</strong> ${new Date(
            subscription.billingCycleEndDate
          ).toLocaleDateString()}</p>
        </div>

        <p>The invoice has been generated and can be accessed through your dashboard.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${subscription.invoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Invoice
          </a>
        </div>

        <p>Thank you for choosing IAE.</p>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  // Platform Subscription Purchase Notification
  const platformEmailConfig = {
    from: config.email?.from || config.email,
    to: config.platformAdminEmail,
    subject: "New Platform Subscription - IAE",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">New Platform Subscription</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p> ${subscription.plan}  subscription received:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Organization:</strong> ${organization.name}</p>
          <p><strong>Subscription Plan:</strong> ${subscription.plan}</p>
          <p><strong>Number of Users:</strong> ${subscription.numberOfUsers}</p>
          <p><strong>Total Amount:</strong> $${subscription.amount}</p>
          <p><strong>Start Date:</strong> ${new Date(
            subscription.billingCycleStartDate
          ).toLocaleDateString()}</p>
          <p><strong>End Date:</strong> ${new Date(
            subscription.billingCycleEndDate
          ).toLocaleDateString()}</p>
        </div>

        <p>The invoice has been generated and can be accessed through the admin dashboard.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${subscription.invoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Details
          </a>
        </div>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  try {
    // Send both notifications
    await Promise.all([
      pooledTransporter.sendMail(organizationEmailConfig),
      pooledTransporter.sendMail(platformEmailConfig),
    ]);

    console.log("Subscription purchase notifications sent successfully");
  } catch (error) {
    console.error("Error sending subscription purchase notifications:", error);
    throw error;
  }
};

exports.sendSubscriptionUpdateNotification = async (
  updateDetails,
  organization
) => {
  const changeType = updateDetails.changes.type;
  const changeWord = changeType === "increase" ? "increased" : "decreased";
  const config = getConfig();
  const organizationEmailConfig = {
    from: config.email?.from || config.email,
    to: organization.signatoryUser.email,
    subject: `Subscription Update - User Count ${changeWord} - IAE`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Subscription Update</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>Dear ${organization.name} Admin,</p>
        
        <p>Your subscription has been updated with the following changes:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Change Type:</strong> User count ${changeWord}</p>
          <p><strong>Previous User Count:</strong> ${
            updateDetails.previousUserCount
          }</p>
          <p><strong>New User Count:</strong> ${updateDetails.newUserCount}</p>
          <p><strong>Change in Users:</strong> ${
            updateDetails.changes.difference
          }</p>
          <p><strong>Effective Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Next Billing Date:</strong> ${new Date(
            updateDetails.nextBillingDate
          ).toLocaleDateString()}</p>
        </div>

        ${
          changeType === "increase"
            ? `<p>A prorated charge of $${updateDetails.changes.prorationAmount.toFixed(
                2
              )} will be applied for the additional users for the remainder of the current billing cycle.</p>`
            : `<p>Your next bill will reflect the reduced number of users. Any unused portion will be prorated and credited to your next invoice.</p>`
        }
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${updateDetails?.invoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Billing Details
          </a>
        </div>

        <p>If you have any questions about this change or need assistance, please don't hesitate to contact our support team.</p>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  const platformEmailConfig = {
    from: config.email?.from || config.email,
    to: config.platformAdminEmail,
    subject: `Subscription Update - User Count ${changeWord} - IAE`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Subscription Update</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>Dear ${organization.name} Admin,</p>
        
        <p>Your subscription has been updated with the following changes:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Change Type:</strong> User count ${changeWord}</p>
          <p><strong>Previous User Count:</strong> ${
            updateDetails.previousUserCount
          }</p>
          <p><strong>New User Count:</strong> ${updateDetails.newUserCount}</p>
          <p><strong>Change in Users:</strong> ${
            updateDetails.changes.difference
          }</p>
          <p><strong>Effective Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Next Billing Date:</strong> ${new Date(
            updateDetails.nextBillingDate
          ).toLocaleDateString()}</p>
        </div>

        ${
          changeType === "increase"
            ? `<p>A prorated charge of $${updateDetails.changes.prorationAmount.toFixed(
                2
              )} will be applied for the additional users for the remainder of the current billing cycle.</p>`
            : `<p>Your next bill will reflect the reduced number of users. Any unused portion will be prorated and credited to your next invoice.</p>`
        }
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${updateDetails?.invoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Billing Details
          </a>
        </div>

        <p>If you have any questions about this change or need assistance, please don't hesitate to contact our support team.</p>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  try {
    await Promise.all([
      pooledTransporter.sendMail(organizationEmailConfig),
      pooledTransporter.sendMail(platformEmailConfig),
    ]);
    console.log("✉️ Subscription update notification sent:");
  } catch (error) {
    console.error("❌ Error sending subscription update notification:", error);
    throw error;
  }
};

exports.sendQuizPurchaseNotifications = async (
  quizInvoice,
  quizName,
  user,
  organizationName,
  organizationEmail
) => {
  // Organization Purchase Notification
  const config = getConfig();
  const organizationEmailConfig = {
    from: config.email?.from || config.email,
    to: organizationEmail,
    subject: "New Quiz Purchase - IAE",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">New Quiz Purchase</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>Dear ${organizationName} Admin,</p>
        
        <p>A new purchase has been made for your quiz:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Quiz:</strong> ${stripHtml(quizName)}</p>
         <p><strong>User:</strong> ${stripHtml(user.name)} (${stripHtml(
      user?.email
    )})</p>
          <p><strong>Amount:</strong> $${quizInvoice.organizationAmount}</p>
          <p><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${quizInvoice?.organizationInvoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Invoice
          </a>
        </div>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  // Platform Fee Notification
  const platformEmailConfig = {
    from: config.email?.from || config.email,
    to: config.platformAdminEmail, // Platform admin email
    subject: "Platform Fee Received - IAE",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Platform Fee Received</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>New platform fee received for quiz purchase:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Quiz:</strong> ${stripHtml(quizName)}</p>
          <p><strong>Organization:</strong> ${stripHtml(organizationName)}</p>
<p><strong>User:</strong> ${stripHtml(user.name)} (${stripHtml(
      user?.email
    )})</p>
          <p><strong>Total Amount:</strong> $${quizInvoice.amount}</p>
          <p><strong>Platform Fee:</strong> $${quizInvoice.platformFee}</p>
          <p><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${quizInvoice.platformInvoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Details
          </a>
        </div>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  try {
    // Send both emails in parallel
    await Promise.all([
      pooledTransporter
        .sendMail(organizationEmailConfig)
        .then((info) =>
          console.log("Organization notification sent:", info.response)
        )
        .catch((err) =>
          console.log("Error sending organization notification:", err)
        ),

      pooledTransporter
        .sendMail(platformEmailConfig)
        .then((info) =>
          console.log("Platform notification sent:", info.response)
        )
        .catch((err) =>
          console.log("Error sending platform notification:", err)
        ),
    ]);

    console.log("All purchase notifications sent successfully");
  } catch (error) {
    console.log("Error sending purchase notifications:", error);
  }
};

exports.sendOrganizationQuizPurchaseNotification = async (
  quizInvoice,
  quizName,
  user
) => {
  const config = getConfig();
  const emailConfig = {
    from: config.email?.from || config.email,
    to: config.platformAdminEmail,
    subject: "New Quiz Purchase - IAE",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">New Quiz Purchase</h1>
      </div>
      
      <div style="padding: 20px; background-color: #ffffff;">
        <p>Hello,</p>
        
        <p>A new purchase has been made for your quiz:</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Quiz:</strong> ${stripHtml(quizName)}</p>
<p><strong>User:</strong> ${stripHtml(user.name)} (${stripHtml(
      user?.email
    )})</p>
          <p><strong>Amount:</strong> $${quizInvoice.organizationAmount}</p>
          <p><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</p>
          
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${quizInvoice.platformInvoiceUrl}" 
             style="background-color: #1a2e64; 
                    color: white; 
                    padding: 12px 25px; 
                    text-decoration: none; 
                    border-radius: 5px;
                    display: inline-block;">
            View Details
          </a>
        </div>
        <p>Thank you for being part of IAE.</p>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated message from IAE</p>
      </div>
    </div>`,
  };

  try {
    const info = await pooledTransporter.sendMail(emailConfig);
    console.log(`Organization purchase notification sent: ${info.response}`);
    return info;
  } catch (error) {
    console.log("Error sending organization purchase notification:", error);
    throw error;
  }
};

exports.sendSubscriptionEmails = async (
  updateDetails,
  organization,
  type = "update"
) => {
  const config = getConfig();
  const isRegularUpdate = type === "regular";
  const emailContent = isRegularUpdate
    ? {
        subject: `Subscription Renewed - IAE`,
        details: `
      <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <p><strong>User Count:</strong> ${updateDetails.newUserCount}</p>
        <p><strong>Billing Period:</strong> ${new Date(
          updateDetails.billingCycleStartDate
        ).toLocaleDateString()} - ${new Date(
          updateDetails.billingCycleEndDate
        ).toLocaleDateString()}</p>
        <p><strong>Monthly Rate:</strong> $${
          updateDetails.newUserCount * 5
        }.00</p>
      </div>
      <p>Your subscription has been automatically renewed. No additional action is required.</p>
    `,
      }
    : {
        subject: `Subscription Update - User Count ${
          updateDetails.changes.type === "increase" ? "Increased" : "Decreased"
        } - IAE`,
        details: `
      <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
        <p><strong>Change Type:</strong> User count ${
          updateDetails.changes.type === "increase" ? "increased" : "decreased"
        }</p>
        <p><strong>Previous Users:</strong> ${
          updateDetails.previousUserCount
        }</p>
        <p><strong>New Users:</strong> ${updateDetails.newUserCount}</p>
        <p><strong>Change in Users:</strong> ${
          updateDetails.changes.difference
        }</p>
        <p><strong>Next Billing Date:</strong> ${new Date(
          updateDetails.nextBillingDate
        ).toLocaleDateString()}</p>
      </div>
      ${
        updateDetails.changes.type === "increase" &&
        updateDetails.changes.prorationAmount > 0
          ? `<p>A prorated charge of $${updateDetails.changes.prorationAmount.toFixed(
              2
            )} will be applied for the additional users.</p>`
          : updateDetails.changes.type === "decrease"
          ? `<p>Your next bill will reflect the reduced number of users with prorated credit.</p>`
          : ""
      }
    `,
      };

  const getEmailConfig = (recipient) => ({
    from: config.email?.from || config.email,
    to: recipient,
    subject: emailContent.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #1a2e64; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Subscription Update</h1>
        </div>
        
        <div style="padding: 20px; background-color: #ffffff;">
          <p>Dear ${organization.name} Admin,</p>
          ${emailContent.details}
          ${
            updateDetails.invoiceUrl
              ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${updateDetails.invoiceUrl}" 
                style="background-color: #1a2e64; color: white; padding: 12px 25px; 
                       text-decoration: none; border-radius: 5px; display: inline-block;">
                View Billing Details
              </a>
            </div>
          `
              : ""
          }
           <br/>
    <p>If you have any questions or need assistance, please don't hesitate to contact our support team at <a href="mailto:info@IAE.com">info@IAE.com</a>.</p>
    <br/>
        </div>
        
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
          <p>This is an automated message from IAE</p>
        </div>
      </div>
    `,
  });

  try {
    await Promise.all([
      pooledTransporter.sendMail(
        getEmailConfig(organization?.signatoryUser?.email)
      ),
      pooledTransporter.sendMail(getEmailConfig(config.platformAdminEmail)),
    ]);
    console.log("✉️ Subscription emails sent");
  } catch (error) {
    console.error("❌ Error sending subscription emails:", error);
    throw error;
  }
};

// Export the new modern functions
exports.sendEmail = sendEmail;
exports.sendEmailToUser = sendEmailToUser;
exports.sendCSVEmail = sendCSVEmail;
