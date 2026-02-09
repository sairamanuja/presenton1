import { Storage } from "@google-cloud/storage";
import path from "path";

const getBucketName = () => process.env.GCS_BUCKET || "";
const getPrefix = () => process.env.GCS_PREFIX || "app_data";

const normalizeObjectName = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\/+/, "");

export const uploadBufferToGcs = async (
  buffer: Buffer | Uint8Array,
  relativePath: string,
  contentType?: string
): Promise<string | null> => {
  const bucketName = getBucketName();
  if (!bucketName) {
    return null;
  }

  const prefix = getPrefix();
  const objectName = normalizeObjectName(path.posix.join(prefix, relativePath));
  const storage = new Storage();
  const file = storage.bucket(bucketName).file(objectName);

  await file.save(buffer as Buffer, {
    resumable: false,
    contentType: contentType || undefined,
  });
  await file.makePublic();

  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
};
