import fs from "fs";
import path from "path";
import multer from "multer";

const IMAGE_EXTENSIONS_BY_MIME = new Map([
  ["image/png", ".png"],
  ["image/jpg", ".jpg"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"]
]);

function createUploadError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeUploadSegment(value, fallback = "file") {
  const sanitized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || fallback;
}

function resolveImageExtension(file) {
  const mimetype = String(file?.mimetype || "").toLowerCase();
  const ext = path.extname(String(file?.originalname || "")).toLowerCase();

  if (!IMAGE_EXTENSIONS_BY_MIME.has(mimetype)) {
    return null;
  }

  if (!ext) {
    return IMAGE_EXTENSIONS_BY_MIME.get(mimetype) || ".png";
  }

  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return null;
  }

  if (mimetype === "image/png" && ext !== ".png") {
    return null;
  }

  if ((mimetype === "image/jpg" || mimetype === "image/jpeg") && ![".jpg", ".jpeg"].includes(ext)) {
    return null;
  }

  if (mimetype === "image/webp" && ext !== ".webp") {
    return null;
  }

  return ext;
}

function buildUploadFilename({ file, prefix, nameParts = [] }) {
  const ext = resolveImageExtension(file);
  if (!ext) {
    throw createUploadError(400, "Only PNG, JPG, JPEG, and WEBP files are allowed", "INVALID_FILE_TYPE");
  }

  const safePrefix = sanitizeUploadSegment(prefix, "file");
  const safeParts = nameParts
    .map((value) => sanitizeUploadSegment(value, ""))
    .filter(Boolean);

  const base = [safePrefix, ...safeParts].join("_") || safePrefix;
  return `${base}_${Date.now()}${ext}`;
}

function createLogoStorage({ subDir, prefix, getFilenameParts }) {
  const targetDir = path.join(process.cwd(), "uploads", subDir);

  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDir(targetDir);
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      try {
        const name = buildUploadFilename({
          file,
          prefix,
          nameParts: typeof getFilenameParts === "function" ? getFilenameParts(req, file) : []
        });
        cb(null, name);
      } catch (error) {
        cb(error);
      }
    }
  });
}

function fileFilter(_req, file, cb) {
  if (resolveImageExtension(file)) {
    return cb(null, true);
  }

  const error = createUploadError(400, "Only PNG, JPG, JPEG, and WEBP files are allowed", "INVALID_FILE_TYPE");
  return cb(error, false);
}

function createSingleImageUpload({ subDir, prefix, getFilenameParts, fileSize = 2 * 1024 * 1024 }) {
  return multer({
    storage: createLogoStorage({ subDir, prefix, getFilenameParts }),
    fileFilter,
    limits: {
      fileSize
    }
  }).single("file");
}

function wrapUploadMiddleware(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (error) => {
      if (!error) {
        return next();
      }

      if (error instanceof multer.MulterError || error?.name === "MulterError") {
        if (error.code === "LIMIT_FILE_SIZE") {
          error.statusCode = 413;
          error.errorCode = "FILE_TOO_LARGE";
          error.message = "Logo file exceeds the 2 MB limit";
        } else {
          error.statusCode = 400;
          error.errorCode = error.errorCode || "UPLOAD_ERROR";
        }
      }

      return next(error);
    });
  };
}

const franchiseLogoUpload = createSingleImageUpload({
  subDir: "franchise-logos",
  prefix: "franchise"
});

const businessPartnerLogoUpload = createSingleImageUpload({
  subDir: "business-partner-logos",
  prefix: "business_partner"
});

const genericLogoUpload = createSingleImageUpload({
  subDir: "logos",
  prefix: "logo",
  getFilenameParts: (req) => [
    req.logoUploadTarget?.tenantId,
    req.logoUploadTarget?.role,
    req.logoUploadTarget?.entityId
  ]
});

const studentPhotoUpload = createSingleImageUpload({
  subDir: "student-photos",
  prefix: "student"
});

const teacherPhotoUpload = createSingleImageUpload({
  subDir: "teacher-photos",
  prefix: "teacher"
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const type = String(file.mimetype || "").toLowerCase();
    const ext = String(file.originalname || "").toLowerCase();
    if (type === "text/csv" || ext.endsWith(".csv")) {
      return cb(null, true);
    }
    const err = new Error("Only CSV files are allowed");
    err.statusCode = 400;
    err.errorCode = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
}).single("file");

const certificateSignatureUpload = createSingleImageUpload({
  subDir: "certificate-signatures",
  prefix: "signature"
});

const certificateAffiliationLogoUpload = createSingleImageUpload({
  subDir: "certificate-affiliation-logos",
  prefix: "affiliation"
});

const certificateStampUpload = createSingleImageUpload({
  subDir: "certificate-stamps",
  prefix: "stamp"
});

const certificateBackgroundUpload = createSingleImageUpload({
  subDir: "certificate-backgrounds",
  prefix: "background",
  fileSize: 5 * 1024 * 1024
});

export {
  franchiseLogoUpload,
  businessPartnerLogoUpload,
  genericLogoUpload,
  studentPhotoUpload,
  teacherPhotoUpload,
  csvUpload,
  certificateSignatureUpload,
  certificateAffiliationLogoUpload,
  certificateStampUpload,
  certificateBackgroundUpload,
  wrapUploadMiddleware
};
