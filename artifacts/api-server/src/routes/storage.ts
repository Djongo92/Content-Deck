import express, { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const OBJECT_ID_RE = /^[a-f0-9-]{36}$/i;

/**
 * Single-user workspace: uploads are intentionally not behind account auth.
 * Objects are made public-by-link so frozen review-link snapshots can render
 * media without the client needing an account.
 */
router.post(
  "/storage/uploads/request-url",
  async (req: Request, res: Response) => {
    const { name, size, contentType } = (req.body ?? {}) as {
      name?: unknown;
      size?: unknown;
      contentType?: unknown;
    };

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof size !== "number" ||
      !(size > 0) ||
      typeof contentType !== "string" ||
      !contentType
    ) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }
    if (size > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: "File too large (200MB max)" });
      return;
    }

    try {
      const objectId = randomUUID();
      const uploadURL = objectStorageService.getObjectEntityUploadURL(objectId);
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      await objectStorageService.trySetObjectEntityAclPolicy(uploadURL, {
        owner: "content-desk",
        visibility: "public",
      });
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      req.log.error({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

router.put(
  "/storage/uploads/direct/:objectId",
  express.raw({ type: () => true, limit: "200mb" }),
  async (req: Request, res: Response) => {
    const objectId = String(req.params.objectId ?? "");
    if (!OBJECT_ID_RE.test(objectId)) {
      res.status(400).json({ error: "Invalid object id" });
      return;
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      res.status(400).json({ error: "Empty upload body" });
      return;
    }
    try {
      await objectStorageService.uploadObject(
        objectId,
        req.body,
        req.get("content-type") || "application/octet-stream",
      );
      res.status(200).json({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading object");
      res.status(500).json({ error: "Failed to upload object" });
    }
  },
);

router.get(
  /^\/storage\/objects\/(.+)$/,
  async (req: Request, res: Response) => {
    const objectPath = `/objects/${req.params[0]}`;
    try {
      const webResponse = await objectStorageService.downloadObject(objectPath, 3600);
      res.status(webResponse.status);
      webResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "content-length") res.setHeader(key, value);
      });
      if (!webResponse.body) {
        res.end();
        return;
      }
      Readable.fromWeb(webResponse.body as import("stream/web").ReadableStream).pipe(res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

export default router;
