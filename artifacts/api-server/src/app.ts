import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// No CORS middleware: the frontend talks to this API same-origin through the
// platform proxy, so cross-origin browser access stays blocked by default.
// Raised from Express's 100kb default: data-URL image (auto-tag) and audio
// (voice capture transcription) payloads go through this same JSON body.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

// Off Replit, this server is also the frontend host: Replit used to stitch the
// built SPA and this API together via path-based routing in front of two
// separate services. Serving the SPA from here instead keeps them same-origin
// (see the no-CORS comment above) without needing a separate static host.
if (process.env.NODE_ENV === "production") {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(currentDir, "../../content-desk/dist/public");

  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }
}

export default app;
