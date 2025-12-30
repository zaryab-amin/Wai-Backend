const Folder = require("../models/folder.model");
const Quiz = require("../models/quiz.model");
const { ReqLogger } = require("../utils/Logger");
const { v4: uuidv4 } = require("uuid");

const buildFolderTree = (folders, parentId = null) => {
  const result = [];
  folders.forEach((folder) => {
    if (String(folder.parentFolderId) === String(parentId)) {
      const subfolders = buildFolderTree(folders, folder._id);
      result.push({ ...folder, subfolders }); // Removed .toObject()
    }
  });
  return result;
};

exports.createFolder = async (req, res, next) => {
  try {
    const folderId = uuidv4();
    const created_by = req.user._id;
    const organization = req.user.organization;
    const data = req.body;

    const finalData = { ...data, folderId, created_by, organization };
    const folder = await new Folder(finalData).save();
    console.log("folder---------------------->", folder);
    const folderTransform = folder.transform();
    ReqLogger(req, "info", "Folder Created Successfully");
    return res.status(201).json({
      status: "success",
      message: "Folder Created successfully",
      data: folderTransform,
    });
  } catch (error) {
    console.log(error);
    ReqLogger(req, "error", error);
    next(error);
  }
};
exports.renameFolder = async (req, res, next) => {
  try {
    const { name, folderId } = req.body;
    const organization = req?.user?.organization;

    if (!folderId || !name) {
      return res.status(400).json({
        status: "fail",
        message: "Folder ID and new name are required",
      });
    }

    const folder = await Folder.findOneAndUpdate(
      { folderId, organization },
      { name: name },
      { new: true }
    );

    if (!folder) {
      return res.status(404).json({
        status: "fail",
        message: "Folder not found",
      });
    }

    const folderTransform = folder.transform();
    ReqLogger(req, "info", "Folder Renamed Successfully");
    return res.status(200).json({
      status: "success",
      message: "Folder renamed successfully",
      data: folderTransform,
    });
  } catch (error) {
    console.log(error);
    ReqLogger(req, "error", error);
    next(error);
  }
};
exports.getFolders = async (req, res, next) => {
  try {
    const created_by = req.user._id;
    const organization = req.user.organization;

    let { folderId } = req.query;

    console.log("folderId: " + folderId);
    if (folderId === "null") {
      folderId = null;
    }

    // Find root folders (folders with null parentFolderId)
    const rootFolders = await Folder.find({
      created_by,
      organization,
      parentFolderId: folderId,
      isDeleted: false,
    })
      .populate({
        path: "created_by",
        select: "name ",
      })
      .lean();

    let quizzes;
    if (req.user.role !== "admin") {
      quizzes = await Quiz.find({ isDeleted: false, folder: folderId, organization })
        .populate({
          path: "created_by",
          select: "name ",
        })
        .select(
          "quizId name folder isPublished attemptsOfQuiz updatedAt created_by"
        )
        .lean();
    } else {
      quizzes = await Quiz.find({
        created_by,
        organization,
        isDeleted: false,
        folder: folderId,
        organization
      })
        .populate({
          path: "created_by",
          select: "name ",
        })
        .select(
          "quizId name folder attemptsOfQuiz isPublished updatedAt created_by"
        )
        .lean();
    }

    // let quizzesWithoutFolder;

    // if (folderId === null) {
    //   // Find quizzes without folder IDs
    //   quizzesWithoutFolder = await Quiz.find({
    //     isDeleted: false,
    //     folder: { $exists: false },
    //   })
    //     .populate({
    //       path: "created_by",
    //       select: "name ",
    //     })
    //     .select(
    //       "quizId name folder isPublished attemptsOfQuiz updatedAt created_by"
    //     )
    //     .lean();
    // }

    // // Combine quizzes with and without folder IDs
    // quizzes = quizzes.concat(quizzesWithoutFolder);
    // Map quizzes with null folder to the root level of the folder tree
    rootFolders.forEach((folder) => {
      folder.quizzes = quizzes.filter((quiz) => quiz.folder === null);
    });

    // Build folder tree
    const folderTree = buildFolderTree(rootFolders);

    const folder = [...folderTree, ...quizzes];
    ReqLogger(req, "info", "Fetched folders successfully");
    return res.status(201).json({
      status: "success",
      message: "Fetched folders successfully",
      data: folder,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.deleteFolder = async (req, res, next) => {
  try {
    const { folderId } = req.body;
    const organization = req?.user?.organization;

    if (!folderId) {
      return res.status(400).json({
        status: "fail",
        message: "Folder ID are required",
      });
    }

    const folder = await Folder.findOneAndUpdate(
      { folderId, organization },
      { isDeleted: true },
      { new: true }
    );

    if (!folder) {
      return res.status(404).json({
        status: "fail",
        message: "Folder not found",
      });
    }

    const folderTransform = folder.transform();
    ReqLogger(req, "info", "Folder deleted Successfully");
    return res.status(200).json({
      status: "success",
      message: "Folder deleted successfully",
      data: folderTransform,
    });
  } catch (error) {
    console.log(error);
    ReqLogger(req, "error", error);
    next(error);
  }
};
