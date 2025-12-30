const { v4: uuidv4 } = require("uuid");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const User = require("../models/user.model");
const { InfoLogger } = require("../utils/Logger");
const { resolve } = require("path");
const fs = require("fs");
const Organization = require("../models/organization.model");
const { getConfig } = require("../../config/vars");

// Configure AWS S3 client
const s3Client = new S3Client({
  region: "us-east-1",
});
const allowedExtensions = ["png", "jpg", "jpeg"];
exports.Upload = async (req, res, next) => {
  try {
    const extension = req?.file?.originalname?.split(".")?.pop()?.toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      return res
        .status(400)
        .json({ error: "Only PNG, JPG, and JPEG files are allowed." });
    }

    const { key, url } = await this.uploadFile(
      req?.file,
      "avcourse-imagesatar"
    );

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

    const { key, url } = await this.uploadFile(req?.file, "avatar");

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
    const extension = file?.originalname?.split(".")?.pop()?.toLowerCase();
    let key = `${folder}/${uuidv4()}.${extension}`;
    const config = getConfig();

    const filePath = resolve(
      __dirname,
      "..",
      "..",
      "..",
      "uploads",
      file.originalname
    );
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.s3BucketUpload,
        Key: key,
        Body: fs.createReadStream(filePath),
        CacheControl: "no-store",
      })
    );

    const url = await this.getSignedUrlFile(key);

    return { key, url };
  } catch (error) {
    console.log(error);
    InfoLogger({}, "error", `File upload error: ${JSON.stringify(error)}`);
  }
};

exports.getSignedUrlFile = async (key) => {
  const config = getConfig();
  const params = {
    Bucket: config.s3BucketUpload,
    ResponseCacheControl: "no-store",
    Key: key,
  };
  const command = new GetObjectCommand(params);
  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return url;
  } catch (error) {
    throw error;
  }
};
