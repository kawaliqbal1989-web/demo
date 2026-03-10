import fs from "fs";
import path from "path";
import multer from "multer";

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createLogoStorage({ subDir, prefix }) {
  const targetDir = path.join(process.cwd(), "uploads", subDir);

  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDir(targetDir);
      cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
      const safeExt = [".png", ".jpg", ".jpeg"].includes(ext) ? ext : ".png";
      const name = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
      cb(null, name);
    }
  });
}

function fileFilter(_req, file, cb) {
  const type = String(file.mimetype || "").toLowerCase();
  if (["image/png", "image/jpg", "image/jpeg"].includes(type)) {
    return cb(null, true);
  }

  const error = new Error("Only PNG/JPG files are allowed");
  error.statusCode = 400;
  error.errorCode = "INVALID_FILE_TYPE";
  return cb(error, false);
}

const franchiseLogoUpload = multer({
  storage: createLogoStorage({ subDir: "franchise-logos", prefix: "franchise" }),
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}).single("file");

const businessPartnerLogoUpload = multer({
  storage: createLogoStorage({ subDir: "business-partner-logos", prefix: "business_partner" }),
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}).single("file");

const studentPhotoUpload = multer({
  storage: createLogoStorage({ subDir: "student-photos", prefix: "student" }),
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}).single("file");

const teacherPhotoUpload = multer({
  storage: createLogoStorage({ subDir: "teacher-photos", prefix: "teacher" }),
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}).single("file");

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

const certificateSignatureUpload = multer({
  storage: createLogoStorage({ subDir: "certificate-signatures", prefix: "signature" }),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
}).single("file");

const certificateAffiliationLogoUpload = multer({
  storage: createLogoStorage({ subDir: "certificate-affiliation-logos", prefix: "affiliation" }),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
}).single("file");

const certificateStampUpload = multer({
  storage: createLogoStorage({ subDir: "certificate-stamps", prefix: "stamp" }),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
}).single("file");

const certificateBackgroundUpload = multer({
  storage: createLogoStorage({ subDir: "certificate-backgrounds", prefix: "background" }),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single("file");

export { franchiseLogoUpload, businessPartnerLogoUpload, studentPhotoUpload, teacherPhotoUpload, csvUpload, certificateSignatureUpload, certificateAffiliationLogoUpload, certificateStampUpload, certificateBackgroundUpload };
