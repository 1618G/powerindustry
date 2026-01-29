/**
 * File Upload API - Handles file uploads with optimization
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import {
  json,
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
} from "@remix-run/node";

import { requireUserId } from "~/utils/auth.server";
import { uploadFile, deleteFile, getUserFiles } from "~/services/file-upload.server";
import { withRateLimit } from "~/services/rate-limit.server";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "52428800"); // 50MB

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  // Rate limit
  const rateCheck = await withRateLimit(request, "file-upload", "upload", userId);
  if ("status" in rateCheck) return rateCheck;

  const method = request.method.toUpperCase();

  if (method === "DELETE") {
    const formData = await request.formData();
    const fileId = formData.get("fileId") as string;

    if (!fileId) {
      return json({ error: "File ID required" }, { status: 400 });
    }

    const result = await deleteFile(fileId, userId);
    if (!result.success) {
      return json({ error: result.error }, { status: 400 });
    }

    return json({ success: true });
  }

  // Handle upload
  try {
    const uploadHandler = unstable_createMemoryUploadHandler({
      maxPartSize: MAX_FILE_SIZE,
    });

    const formData = await unstable_parseMultipartFormData(request, uploadHandler);
    const file = formData.get("file") as File | null;

    if (!file) {
      return json({ error: "No file provided" }, { status: 400 });
    }

    const isPublic = formData.get("public") === "true";
    const optimize = formData.get("optimize") !== "false";

    const result = await uploadFile(file, {
      userId,
      isPublic,
      optimize,
    });

    if (!result.success) {
      return json({ error: result.error }, { status: 400 });
    }

    return json({
      success: true,
      file: result.file,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function loader({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") as "IMAGE" | "VIDEO" | "DOCUMENT" | undefined;
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const files = await getUserFiles(userId, { type, limit, offset });

  return json({ files });
}

