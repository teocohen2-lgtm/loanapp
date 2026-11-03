import type { RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";
import { encrypt, decrypt } from "../../utils/crypto";
import { detectImageExt } from "../../middleware/upload";
import * as storage from "../../services/storage";

const uuid = z.string().uuid();

/** Borrower submits (or re-submits after rejection) their KYC. */
export const submit: RequestHandler = async (req, res) => {
  const userId = req.user!.id;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const idFile = files?.idImage?.[0];
  const selfieFile = files?.selfie?.[0];
  if (!idFile || !selfieFile)
    throw ApiError.badRequest('Both "idImage" and "selfie" files are required');

  // Verify real file types from the bytes, not the client-supplied mimetype
  const idExt = detectImageExt(idFile.buffer);
  const selfieExt = detectImageExt(selfieFile.buffer);
  if (!idExt || !selfieExt)
    throw ApiError.badRequest("Files must be valid JPEG or PNG images");

  const existing = await prisma.kycProfile.findUnique({ where: { userId } });
  if (existing && existing.status !== "REJECTED") {
    throw ApiError.conflict(`KYC already ${existing.status.toLowerCase()}`);
  }

  const d = req.body as {
    fullName: string;
    birthDate: string;
    address: string;
    idType: any;
    idNumber: string;
  };

  const idImageKey = await storage.saveFile(
    idFile.buffer,
    `kyc/${userId}`,
    idExt
  );
  let selfieImageKey: string;
  try {
    selfieImageKey = await storage.saveFile(
      selfieFile.buffer,
      `kyc/${userId}`,
      selfieExt
    );
  } catch (error) {
    await storage.removeFile(idImageKey);
    throw error;
  }

  const data = {
    fullName: d.fullName,
    birthDate: new Date(d.birthDate),
    address: d.address,
    idType: d.idType,
    idNumberEnc: encrypt(d.idNumber),
    idNumberLast4: d.idNumber.slice(-4),
    idImageKey,
    selfieImageKey,
    status: "PENDING" as const,
    rejectionReason: null,
    reviewedById: null,
    reviewedAt: null,
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const current = await tx.kycProfile.findUnique({ where: { userId } });
      if (
        current &&
        (current.status !== "REJECTED" ||
          !existing ||
          current.updatedAt.getTime() !== existing.updatedAt.getTime())
      )
        throw ApiError.conflict(
          "KYC changed; refresh your status before submitting again"
        );
      await tx.kycProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      await tx.user.update({
        where: { id: userId },
        data: { kycStatus: "PENDING" },
      });
    });
  } catch (err) {
    // Don't leave orphaned ID photos if the DB write failed
    await Promise.all([
      storage.removeFile(idImageKey),
      storage.removeFile(selfieImageKey),
    ]);
    throw err;
  }

  // Resubmission after rejection: delete the old photos
  if (existing)
    await Promise.all([
      storage.removeFile(existing.idImageKey),
      storage.removeFile(existing.selfieImageKey),
    ]);

  res
    .status(201)
    .json({ message: "KYC submitted for review", status: "PENDING" });
};

/** Borrower checks their own status (never returns the ID number or image keys). */
export const myStatus: RequestHandler = async (req, res) => {
  const p = await prisma.kycProfile.findUnique({
    where: { userId: req.user!.id },
    select: {
      status: true,
      idType: true,
      idNumberLast4: true,
      rejectionReason: true,
      createdAt: true,
      reviewedAt: true,
    },
  });
  res.json({ kyc: p ?? { status: "NOT_SUBMITTED" } });
};

// ---------- Reviewer / admin ----------

export const listPending: RequestHandler = async (_req, res) => {
  const items = await prisma.kycProfile.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { userId: true, fullName: true, idType: true, createdAt: true },
  });
  res.json({ items });
};

export const getForReview: RequestHandler = async (req, res) => {
  const userId = uuid.parse(req.params.userId);
  const p = await prisma.kycProfile.findUnique({ where: { userId } });
  if (!p) throw ApiError.notFound("KYC profile not found");

  const { idNumberEnc, idImageKey, selfieImageKey, ...safe } = p;
  res.json({
    kyc: {
      ...safe,
      idNumber: decrypt(idNumberEnc), // reviewers only
      idImageUrl: `/api/kyc/admin/${userId}/image/id`,
      selfieUrl: `/api/kyc/admin/${userId}/image/selfie`,
    },
  });
};

/** Streams an image. Needs the Authorization header, so the frontend fetches it as a blob. */
export const getImage: RequestHandler = async (req, res) => {
  const userId = uuid.parse(req.params.userId);
  const type = z.enum(["id", "selfie"]).parse(req.params.type);
  const p = await prisma.kycProfile.findUnique({ where: { userId } });
  if (!p) throw ApiError.notFound("KYC profile not found");

  // res.setHeader("Cache-Control", "private, no-store");
  // res.setHeader("X-Content-Type-Options", "nosniff");
  // res.sendFile(
  //   storage.resolvePath(type === "id" ? p.idImageKey : p.selfieImageKey)
  // );
  const key = type === "id" ? p.idImageKey : p.selfieImageKey;
  const file = await storage.readFile(key);
  if (!file) throw ApiError.notFound("Image not found");

  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(key.endsWith(".png") ? "image/png" : "image/jpeg");
  res.send(file);
};

export const review: RequestHandler = async (req, res) => {
  const userId = uuid.parse(req.params.userId);
  const { decision, reason } = req.body as {
    decision: "APPROVED" | "REJECTED";
    reason?: string;
  };

  const p = await prisma.kycProfile.findUnique({ where: { userId } });
  if (!p) throw ApiError.notFound("KYC profile not found");
  if (p.status !== "PENDING")
    throw ApiError.conflict(`Already ${p.status.toLowerCase()}`);

  await prisma.$transaction([
    prisma.kycProfile.update({
      where: { userId, status: "PENDING", updatedAt: p.updatedAt },
      data: {
        status: decision,
        rejectionReason: decision === "REJECTED" ? reason : null,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { kycStatus: decision },
    }),
  ]);
  res.json({ message: `KYC ${decision.toLowerCase()}`, status: decision });
};
