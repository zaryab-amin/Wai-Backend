const AWS = require("aws-sdk");
const secretsManager = new AWS.SecretsManager({ region: "us-east-1" });

// Cache to store the secrets after fetching them once
let cachedSecrets = null;
let config = null;

// Function to retrieve the secret values from AWS Secrets Manager
async function getSecretValue(secretName) {
  // Check if secrets are already cached
  if (cachedSecrets) {
    return cachedSecrets;
  }

  try {
    const data = await secretsManager
      .getSecretValue({ SecretId: secretName })
      .promise();
    if (data.SecretString) {
      cachedSecrets = JSON.parse(data.SecretString); // Cache the secret values
    } else {
      const buff = Buffer.from(data.SecretBinary, "base64");
      cachedSecrets = JSON.parse(buff.toString("ascii")); // Cache the secret values
    }
    return cachedSecrets;
  } catch (err) {
    console.error("Error retrieving secret: ", err);
    throw err;
  }
}

async function loadConfig() {
  const isLocal = process.env.NODE_ENV === "local";

  if (isLocal) {
    return {
      env: process.env.NODE_ENV,
      port: process.env.PORT,
      clientURL: process.env.CLIENT_URL,
      serverHost: process.env.SERVER_HOST,
      jwtSecret: process.env.JWT_SECRET,
      jwtExpirationInterval: process.env.JWT_EXPIRATION_MINUTES,
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      mongo: {
        uri:
          process.env.NODE_ENV === "test"
            ? process.env.MONGO_URI_TESTS
            : process.env.MONGO_URI,
      },
      logs: process.env.NODE_ENV === "production" ? "combined" : "dev",
      emailConfig: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        username: process.env.SMTP_USERNAME,
        password: process.env.SMTP_PASSWORD,
      },
      // Modern Email Configuration
      email: {
        host: process.env.EMAIL_HOST || process.env.SMTP_HOST,
        port: parseInt(
          process.env.EMAIL_PORT || process.env.SMTP_PORT || "587"
        ),
        user: process.env.EMAIL_USER || process.env.SMTP_USERNAME,
        pass: process.env.EMAIL_PASS || process.env.SMTP_PASSWORD,
        from: process.env.EMAIL_FROM || process.env.EMAIL,
        useOAuth2: process.env.EMAIL_USE_OAUTH2 === "true",
        clientId: process.env.EMAIL_CLIENT_ID,
        clientSecret: process.env.EMAIL_CLIENT_SECRET,
        tenantId: process.env.EMAIL_TENANT_ID,
        disableSmtpFallback: process.env.EMAIL_DISABLE_SMTP_FALLBACK === "true",
        graphMaxRetries: parseInt(process.env.EMAIL_GRAPH_MAX_RETRIES || "5"),
        graphRetryBaseMs: parseInt(
          process.env.EMAIL_GRAPH_RETRY_BASE_MS || "1000"
        ),
        batchSize: parseInt(process.env.EMAIL_BATCH_SIZE || "5"),
        throttleMsBetweenEmails: parseInt(
          process.env.EMAIL_THROTTLE_MS || "2000"
        ),
        sequential: process.env.EMAIL_SEQUENTIAL === "true",
      },
      supportEmail: "academy@prescientsecurity.com",
      prescientOrgId: process.env.PRECIENT_ORGANIZATION_ID,
      recaptchaSecret: process.env.RECAPTCHA_SECRET_KEY,
      openAIKey: process.env.OPEN_AI_KEY,
      s3BucketUpload: process.env.S3_BUCKET_UPLOADS,
      stripePidPerUser: process.env.STRIPE_PRICE_ID_PER_USER,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      email: process.env.EMAIL,
      platformAdminEmail: process.env?.PLATFORM_ADMIN_EMAIL,
      sessionKey: process.env?.SESSION_KEY,
      googleClientId: process.env?.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env?.GOOGLE_CLIENT_SECRET,
      // GCS Configuration
      gcsBucketName: process.env.GCS_BUCKET_NAME || "wai-partner-portal-bucket",
      gcsProjectId: process.env.GCS_PROJECT_ID,
      gcsKeyFilePath: process.env.GCS_KEY_FILE_PATH,
      gcsCredentials: process.env.GCS_CREDENTIALS,
    };
  } else {
    // Fetch the secrets asynchronously
    const secrets = await getSecretValue(process.env.SECRET_NAME);
    // add settungs from secrets manager
    return {
      env: secrets.NODE_ENV,
      port: secrets.PORT,
      clientURL: secrets.CLIENT_URL,
      serverHost: secrets.SERVER_HOST,
      jwtSecret: secrets.JWT_SECRET,
      jwtExpirationInterval: secrets.JWT_EXPIRATION_MINUTES,
      stripeSecretKey: secrets.STRIPE_SECRET_KEY,
      stripePublishableKey: secrets.STRIPE_PUBLISHABLE_KEY,
      mongo: {
        uri:
          secrets.NODE_ENV === "test"
            ? secrets.MONGO_URI_TESTS
            : secrets.MONGO_URI,
      },
      logs: secrets.NODE_ENV === "production" ? "combined" : "dev",
      emailConfig: {
        host: secrets.SMTP_HOST,
        port: secrets.SMTP_PORT,
        username: secrets.SMTP_USERNAME,
        password: secrets.SMTP_PASSWORD,
      },
      // Modern Email Configuration
      email: {
        host: secrets.EMAIL_HOST || secrets.SMTP_HOST,
        port: parseInt(secrets.EMAIL_PORT || secrets.SMTP_PORT || "587"),
        user: secrets.EMAIL_USER || secrets.SMTP_USERNAME,
        pass: secrets.EMAIL_PASS || secrets.SMTP_PASSWORD,
        from: secrets.EMAIL_FROM || secrets.EMAIL,
        useOAuth2: secrets.EMAIL_USE_OAUTH2 === "true",
        clientId: secrets.EMAIL_CLIENT_ID,
        clientSecret: secrets.EMAIL_CLIENT_SECRET,
        tenantId: secrets.EMAIL_TENANT_ID,
        disableSmtpFallback: secrets.EMAIL_DISABLE_SMTP_FALLBACK === "true",
        graphMaxRetries: parseInt(secrets.EMAIL_GRAPH_MAX_RETRIES || "5"),
        graphRetryBaseMs: parseInt(secrets.EMAIL_GRAPH_RETRY_BASE_MS || "1000"),
        batchSize: parseInt(secrets.EMAIL_BATCH_SIZE || "5"),
        throttleMsBetweenEmails: parseInt(secrets.EMAIL_THROTTLE_MS || "2000"),
        sequential: secrets.EMAIL_SEQUENTIAL === "true",
      },
      prescientOrgId: secrets.PRECIENT_ORGANIZATION_ID,
      recaptchaSecret: secrets.RECAPTCHA_SECRET_KEY,
      openAIKey: secrets.OPEN_AI_KEY,
      s3BucketUpload: secrets.S3_BUCKET_UPLOADS,
      stripePidPerUser: secrets.STRIPE_PRICE_ID_PER_USER,
      stripeWebhookSecret: secrets.STRIPE_WEBHOOK_SECRET,
      email: secrets.EMAIL,
      platformAdminEmail: secrets?.PLATFORM_ADMIN_EMAIL,
      sessionKey: secrets?.SESSION_KEY,
      googleClientId: secrets?.GOOGLE_CLIENT_ID,
      googleClientSecret: secrets?.GOOGLE_CLIENT_SECRET,
      // GCS Configuration
      gcsBucketName: secrets.GCS_BUCKET_NAME || "wai-partner-portal-bucket",
      gcsProjectId: secrets.GCS_PROJECT_ID,
      gcsKeyFilePath: secrets.GCS_KEY_FILE_PATH,
      gcsCredentials: secrets.GCS_CREDENTIALS,
    };
  }
}

async function initializeConfig() {
  if (!config) {
    config = await loadConfig();
  }
  return config;
}

function getConfig() {
  if (!config) {
    throw new Error(
      "Configuration not initialized. Call initializeConfig first."
    );
  }
  return config;
}

module.exports = { initializeConfig, getConfig };
