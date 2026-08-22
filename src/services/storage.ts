import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

export type UploadObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface StorageService {
  upload(input: UploadObjectInput): Promise<{ url: string }>;
  delete(key: string): Promise<void>;
}

class CloudinaryStorageService implements StorageService {
  private configured = false;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw Object.assign(new Error("Cloudinary is not configured"), { statusCode: 503 });
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    this.configured = true;
  }

  async upload(input: UploadObjectInput) {
    if (!this.configured) {
      throw Object.assign(new Error("Cloudinary is not configured"), { statusCode: 503 });
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: input.key,
          resource_type: "image",
          overwrite: false,
        },
        (error, uploadResult) => {
          if (error || !uploadResult) {
            reject(error ?? new Error("Cloudinary upload failed"));
            return;
          }

          resolve(uploadResult);
        },
      );

      stream.end(input.body);
    });

    return {
      url: result.secure_url,
    };
  }

  async delete(key: string) {
    await cloudinary.uploader.destroy(key, {
      resource_type: "image",
    });
  }
}

let storageService: StorageService | undefined;

export function getStorageService() {
  storageService ??= new CloudinaryStorageService();
  return storageService;
}

export function setStorageServiceForTests(service: StorageService | undefined) {
  storageService = service;
}
