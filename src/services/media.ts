import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { getStorageService } from "./storage";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const maxUploadSize = 10 * 1024 * 1024;

type UploadMediaInput = {
  buffer: Buffer;
  originalName: string;
  uploadedById: string;
};

function safeOriginalName(originalName: string) {
  const normalized = originalName.trim().replace(/[^\w.\- ]+/g, "").slice(0, 255);
  return normalized || "upload";
}

function readUInt24BE(buffer: Buffer, offset: number) {
  return (buffer[offset] << 16) + (buffer[offset + 1] << 8) + buffer[offset + 2];
}

function getImageDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png" && buffer.length >= 24) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }

  if (mimeType === "image/webp" && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: readUInt24BE(Buffer.from([buffer[26], buffer[25], buffer[24]]), 0) + 1,
        height: readUInt24BE(Buffer.from([buffer[29], buffer[28], buffer[27]]), 0) + 1,
      };
    }
  }

  return {
    width: undefined,
    height: undefined,
  };
}

export async function uploadMedia(input: UploadMediaInput) {
  if (input.buffer.length > maxUploadSize) {
    throw Object.assign(new Error("File exceeds maximum size"), { statusCode: 413 });
  }

  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(input.buffer);

  if (!detected || !allowedMimeTypes.has(detected.mime)) {
    throw Object.assign(new Error("Invalid image type"), { statusCode: 400 });
  }

  const storageKey = `uailibras/news/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
  const dimensions = getImageDimensions(input.buffer, detected.mime);
  const uploaded = await getStorageService().upload({
    key: storageKey,
    body: input.buffer,
    contentType: detected.mime,
  });

  return prisma.media.create({
    data: {
      storageKey,
      url: uploaded.url,
      originalName: safeOriginalName(input.originalName),
      mimeType: detected.mime,
      size: input.buffer.length,
      width: dimensions.width,
      height: dimensions.height,
      uploadedById: input.uploadedById,
    },
  });
}

export async function deleteMedia(id: string, user: { id: string; role: "ADMIN" | "AUTHOR" | "REVIEWER" }) {
  const media = await prisma.media.findUnique({
    where: { id },
    include: {
      coverForNews: true,
      internalInNews: {
        include: {
          news: true,
        },
      },
    },
  });

  if (!media) {
    throw Object.assign(new Error("Media not found"), { statusCode: 404 });
  }

  if (user.role !== "ADMIN" && media.uploadedById !== user.id) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }

  const usedByPublished = media.coverForNews.some((news) => news.status === "PUBLISHED") ||
    media.internalInNews.some((relation) => relation.news.status === "PUBLISHED");

  if (usedByPublished) {
    throw Object.assign(new Error("Media is used by published content"), { statusCode: 409 });
  }

  if (media.coverForNews.length > 0 || media.internalInNews.length > 0) {
    throw Object.assign(new Error("Media is still in use"), { statusCode: 409 });
  }

  await getStorageService().delete(media.storageKey);
  await prisma.media.delete({ where: { id } });

  return {
    success: true,
  };
}
