import "./env.js";

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import mongoose from "mongoose";
import productRoutes from "./routes/products.js";
import categoryRoutes from "./routes/categories.js";
import orderRoutes from "./routes/orders.js";
import uploadRoutes from "./routes/upload.js";
import authRoutes from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/khamarbari";

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const log = {
      time: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms,
      ip: req.ip,
    };
    const line = JSON.stringify(log);
    if (res.statusCode >= 500) console.error(line);
    else if (res.statusCode >= 400) console.warn(line);
    else console.log(line);
  });
  next();
});

// ── CORS — allow any client origin to use this API ──────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── Centralised error handler ─────────────────────────────────────────────────
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? "Internal Server Error";
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      method: req.method,
      path: req.originalUrl,
      status,
      message,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    }),
  );
  res.status(status).json({ error: message });
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        level: "info",
        message: "MongoDB connected",
      }),
    );
    app.listen(PORT, () =>
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          level: "info",
          message: `Server running on port ${PORT}`,
        }),
      ),
    );
  })
  .catch((err) => {
    console.error(
      JSON.stringify({
        time: new Date().toISOString(),
        level: "fatal",
        message: "MongoDB connection error",
        error: err.message,
      }),
    );
    process.exit(1);
  });
