const { v4: uuidv4 } = require("uuid");
const Demo = require("../models/demo.model");
const LectureVideo = require("../models/lectureVideo.model");
const { uploadFile, deleteFile, getSignedUrlFile } = require("./gcs.controller");
const { isSuperAdminUser } = require("../utils");
const { ObjectId } = require("mongodb");

exports.addDemo = async (req, res, next) => {
  try {
    const { title, description } = req.body;
    const uploadedBy = req.user._id;
    const organization = req.user.organization;

    if (!title?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Title is required" });
    }

    let videoSrc = null;
    let document = null;

    if (req.files?.file && req.files.file.length > 0) {
      const videoFile = req.files.file[0];

      try {
        const videoUpload = await uploadFile(videoFile, "demos/videos");

        // Store the GCS object key (videoUpload.key) instead of a time-limited signed URL.
        // We'll generate fresh signed URLs whenever demos are fetched.
        const lectureVideo = await LectureVideo.create({
          url: videoUpload.key,
          fileName: videoFile.originalname,
          mimeType: videoFile.mimetype,
          size: videoFile.size,
          uploadedBy,
          organization,
        });

        videoSrc = lectureVideo._id;
        console.log("VIDEO UPLOADED & SAVED →", lectureVideo.url);
      } catch (err) {
        console.error("Video upload failed:", err.message);
        return res
          .status(500)
          .json({ success: false, message: "Video upload failed" });
      }
    }

    if (req.files?.document && req.files.document.length > 0) {
      const docFile = req.files.document[0];

      try {
        const docUpload = await uploadFile(docFile, "demos/documents");

        // Persist the object key; URL will be generated on demand.
        document = {
          key: docUpload.key,
          url: docUpload.key,
          name: docFile.originalname,
          type: docFile.mimetype,
        };
        console.log("DOCUMENT UPLOADED →", docUpload.key);
      } catch (err) {
        console.error("Document upload failed:", err.message);
        return res
          .status(500)
          .json({ success: false, message: "Document upload failed" });
      }
    }

    const demo = await Demo.create({
      demoId: `demo-${uuidv4().split("-")[0]}`,
      title: title.trim(),
      description: description?.trim() || "",
      organization,
      videoSrc,
      document,
      uploadedBy,
      status: "published",
    });

    await demo.populate([
      { path: "videoSrc", select: "url fileName" },
      { path: "uploadedBy", select: "name email" },
    ]);

    return res.status(201).json({
      success: true,
      message: "Demo created successfully",
      demo,
    });
  } catch (error) {
    console.error("Add Demo Error:", error);
    return next(error);
  }
};

exports.getDemos = async (req, res, next) => {
  try {
    const user = req.user;
    const isSuperAdmin = isSuperAdminUser(user);

    const query = { status: "published" };

    if (!isSuperAdmin && user?.organization) {
      query.organization = user.organization;
    }

    const demos = await Demo.find(query)
      .sort({ createdAt: -1 })
      .populate({
        path: "videoSrc",
        select: "url fileName",
      })
      .populate({
        path: "uploadedBy",
        select: "name email",
      })
      .lean();

    // Regenerate fresh signed URLs so demo media never "disappears" due to old links expiring
    // Also handle legacy records where we stored a full signed URL instead of a GCS object key.
    const demosWithSignedUrls = await Promise.all(
      demos.map(async (demo) => {
        const updatedDemo = { ...demo };

        // --- Handle demo video ---
        if (updatedDemo.videoSrc?.url) {
          try {
            let videoKey = updatedDemo.videoSrc.url;

            // Legacy case: url is a full https://storage.googleapis.com/... URL.
            if (typeof videoKey === "string" && videoKey.startsWith("http")) {
              try {
                const parsed = new URL(videoKey);
                // For URLs like: /<bucketName>/demos/videos/uuid.mp4
                // pathname = "/bucket/demos/videos/uuid.mp4"
                const pathParts = parsed.pathname.split("/").filter(Boolean);
                // If we have at least bucket + object path, drop bucket name.
                if (pathParts.length >= 2) {
                  videoKey = pathParts.slice(1).join("/");
                }
              } catch (parseErr) {
                console.error(
                  "Failed to parse legacy demo video URL, using as-is:",
                  parseErr
                );
              }
            }

            const signedVideoUrl = await getSignedUrlFile(videoKey);
            updatedDemo.videoSrc.url = signedVideoUrl;
          } catch (err) {
            console.error("Failed to generate signed URL for demo video:", err);
          }
        }

        // --- Handle demo document ---
        if (updatedDemo.document) {
          try {
            let documentKey = updatedDemo.document.key || updatedDemo.document.url;

            if (typeof documentKey === "string" && documentKey.startsWith("http")) {
              try {
                const parsed = new URL(documentKey);
                const pathParts = parsed.pathname.split("/").filter(Boolean);
                if (pathParts.length >= 2) {
                  documentKey = pathParts.slice(1).join("/");
                }
              } catch (parseErr) {
                console.error(
                  "Failed to parse legacy demo document URL, using as-is:",
                  parseErr
                );
              }
            }

            if (documentKey) {
              const signedDocUrl = await getSignedUrlFile(documentKey);
              updatedDemo.document.url = signedDocUrl;
              // Optionally normalize in-memory key so future calls are cleaner
              updatedDemo.document.key = documentKey;
            }
          } catch (err) {
            console.error(
              "Failed to generate signed URL for demo document:",
              err
            );
          }
        }

        return updatedDemo;
      })
    );

    res.json({
      success: true,
      count: demosWithSignedUrls.length,
      demos: demosWithSignedUrls,
    });
  } catch (error) {
    console.error("Get demos error:", error);
    next(error);
  }
};

exports.deleteDemoDocument = async (req, res, next) => {
  try {
    const { demoId, documentKey } = req.params;
    const organization = req.user?.organization;

    const demo = await Demo.findOne({
      demoId,
      organization: new ObjectId(organization),
    });

    if (!demo || !demo.document || demo.document.key !== documentKey) {
      return res.status(404).json({ message: "Document not found" });
    }

    await deleteFile(documentKey);
    demo.document = null;
    await demo.save();

    return res.json({ message: "Document deleted successfully" });
  } catch (error) {
    return next(error);
  }
};
