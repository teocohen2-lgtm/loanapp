import multer from "multer";
import { ApiError } from "../utils/ApiError";

export const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
    fields: 10,
    fieldSize: 10 * 1024,
  },
  fileFilter(_req, file, cb) {
    // First-pass filter on the claimed type; real content is verified by magic bytes later
    if (["image/jpeg", "image/png"].includes(file.mimetype))
      return cb(null, true);
    cb(ApiError.badRequest("Only JPEG or PNG images are allowed"));
  },
}).fields([
  { name: "idImage", maxCount: 1 },
  { name: "selfie", maxCount: 1 },
]);

/** Verifies the real file type from its first bytes (the client-sent mimetype can be faked). */
export function detectImageExt(buf: Buffer): "jpg" | "png" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpg";
  if (
    buf.length > 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  return null;
}
