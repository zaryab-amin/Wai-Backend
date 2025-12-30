const { v4: uuidv4 } = require("uuid");
const { Storage } = require("@google-cloud/storage");
const User = require("../models/user.model");
const { InfoLogger } = require("../utils/Logger");
const path = require("path");
const Organization = require("../models/organization.model");
const { getConfig } = require("../../config/vars");

// Initialize GCS client
let storage;

const initializeGCS = () => {
  const config = getConfig();
  const keyFilePath =
    config.gcsKeyFilePath ||
    path.join(__dirname, "../../../gcs-service-account.json");

  console.log("Initializing GCS with key file:", keyFilePath);

  storage = new Storage({
    keyFilename: keyFilePath,
    projectId: config.gcsProjectId || "sales-demonstrations",
  });

  return storage;
};

const allowedExtensions = ["png", "jpg", "jpeg"];

exports.Upload = async (req, res, next) => {
  try {
    const extension = req?.file?.originalname?.split(".")?.pop()?.toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      return res
        .status(400)
        .json({ error: "Only PNG, JPG, and JPEG files are allowed." });
    }

    const { key, url } = await this.uploadFile(req?.file, "course-images");

    res.status(200).json({ message: "File uploaded successfully.", url, key });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

exports.uploadAvatar = async (req, res, next) => {
  try {
    const extension = req?.file?.originalname?.split(".")?.pop()?.toLowerCase();
    const userId = req.user._id;
    const organization = req?.user?.organization;

    if (!allowedExtensions.includes(extension)) {
      return res
        .status(400)
        .json({ error: "Only PNG, JPG, and JPEG files are allowed." });
    }

    const user = await User.findOne({
      _id: userId,
      organization,
    }).exec();
    if (!user) {
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    const { key, url } = await this.uploadFile(req?.file, "avatar");

    user.avatar = key;
    await user.save();

    res.status(200).json({ message: "Avatar uploaded successfully.", url });
  } catch (error) {
    next(error);
  }
};

exports.uploadLogo = async (req, res, next) => {
  try {
    const extension = req?.file?.originalname?.split(".")?.pop()?.toLowerCase();
    const userId = req.user._id;
    const organization = req?.user?.organization;

    if (!allowedExtensions.includes(extension)) {
      return res
        .status(400)
        .json({ error: "Only PNG, JPG, and JPEG files are allowed." });
    }

    const existingOrganization = await Organization.findOne({
      signatoryUser: userId,
      _id: organization,
    }).exec();
    if (!existingOrganization) {
      return res.status(400).json({
        message: "Invalid data",
        success: false,
      });
    }

    const { key, url } = await this.uploadFile(req?.file, "logo");

    existingOrganization.organizationLogo = key;
    await existingOrganization.save();

    res
      .status(200)
      .json({ message: "Organization Logo uploaded successfully.", url });
  } catch (error) {
    next(error);
  }
};

exports.uploadFile = async (file, folder) => {
  try {
    if (!storage) {
      storage = initializeGCS();
    }

    const config = getConfig();
    const bucketName = config.gcsBucketName || "wai-partner-portal-bucket";
    const bucket = storage.bucket(bucketName);

    const extension = file?.originalname?.split(".")?.pop()?.toLowerCase();
    const key = `${folder}/${uuidv4()}.${extension}`;

    const blob = bucket.file(key);
    const blobStream = blob.createWriteStream({
      metadata: {
        cacheControl: "public, max-age=31536000",
        contentType: file.mimetype,
      },
    });

    // Use the file buffer directly from multer.memoryStorage
    blobStream.end(file.buffer);

    return new Promise((resolve, reject) => {
      blobStream.on("error", (err) => {
        console.error("GCS Upload Error:", err);
        InfoLogger({}, "error", `File upload error: ${JSON.stringify(err)}`);
        reject(err);
      });

      blobStream.on("finish", async () => {
        console.log(`File ${file.originalname} uploaded to GCS as ${key}`);

        // Generate signed URL (valid for 4 hours)
        const [url] = await blob.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
        });

        resolve({ key, url });
      });
    });
  } catch (error) {
    console.error("GCS Upload Error:", error);
    InfoLogger({}, "error", `File upload error: ${JSON.stringify(error)}`);
    throw error;
  }
};

exports.getSignedUrlFile = async (key) => {
  try {
    if (!storage) {
      storage = initializeGCS();
    }

    const config = getConfig();
    const bucketName = config.gcsBucketName || "wai-partner-portal-bucket";
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(key);

    // Generate signed URL (valid for 4 hours)
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
    });

    return url;
  } catch (error) {
    console.log("GCS Signed URL Error:", error);
    throw error;
  }
};

// Helper function to make a file public (optional)
exports.makeFilePublic = async (key) => {
  try {
    if (!storage) {
      storage = initializeGCS();
    }

    const config = getConfig();
    const bucketName = config.gcsBucketName || "wai-partner-portal-bucket";
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(key);

    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${key}`;
    return publicUrl;
  } catch (error) {
    console.log("GCS Make Public Error:", error);
    throw error;
  }
};

// Helper function to delete a file
exports.deleteFile = async (key) => {
  try {
    if (!storage) {
      storage = initializeGCS();
    }

    const config = getConfig();
    const bucketName = config.gcsBucketName || "wai-partner-portal-bucket";
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(key);

    await file.delete();
    console.log(`File ${key} deleted from GCS`);
    return true;
  } catch (error) {
    console.log("GCS Delete Error:", error);
    throw error;
  }
};
