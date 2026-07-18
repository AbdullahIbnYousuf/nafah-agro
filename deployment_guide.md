# Khamarbari E-Shop — Free Deployment Guide

## TL;DR — You Don't Need Separate Repos

Both **Vercel** and **Render** can deploy from the **same GitHub repository**. You just configure them to build different parts of the project. No repo splitting required.

| Component                   | Platform               | Deploys From                                  | Cost |
| --------------------------- | ---------------------- | --------------------------------------------- | ---- |
| **Frontend** (React + Vite) | **Vercel**             | Same repo → builds `src/` via `npm run build` | $0   |
| **Backend** (Express)       | **Render**             | Same repo → builds `server/` via `tsc`        | $0   |
| **Database** (MongoDB)      | **MongoDB Atlas** (M0) | N/A                                           | $0   |

> [!IMPORTANT]
> **Why this works:** Vercel ignores the `server/` folder (it only runs `vite build`). Render ignores the `src/` folder (it only compiles and runs the server). Both install from the same `package.json` — the unused deps just sit there harmlessly.

---

## Strategy A: Vercel (Frontend) + Render (Backend) — Recommended

### Step 1: Set Up MongoDB Atlas (Free M0 Cluster)

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) → Sign up / Log in
2. Click **"Build a Database"** → Select **M0 FREE** (Shared)
3. Choose AWS, region closest to your users (e.g., `ap-southeast-1` for Bangladesh)
4. Create a database user:
   - Username: `khamarbari_user`
   - Password: generate a strong one, **save it**
5. **Network Access** → **"Add IP Address"** → **"Allow Access from Anywhere"** (`0.0.0.0/0`)
6. Get connection string: Click **"Connect"** → **"Drivers"** → Copy string
   - Replace `<password>` with actual password, `<dbname>` with `khamarbari`
   - Final: `mongodb+srv://khamarbari_user:PASSWORD@cluster0.xxxxx.mongodb.net/khamarbari?retryWrites=true&w=majority`

---

### Step 2: Deploy Backend on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) → **"New +"** → **"Web Service"**
2. Connect your GitHub repo
3. Configure:

| Setting           | Value                                            |
| ----------------- | ------------------------------------------------ |
| **Name**          | `khamarbari-api`                                 |
| **Branch**        | `main`                                           |
| **Runtime**       | Node                                             |
| **Build Command** | `npm install && npx tsc -p server/tsconfig.json` |
| **Start Command** | `node dist-server/index.js`                      |
| **Instance Type** | **Free**                                         |

> [!NOTE]
> The build compiles `server/*.ts` → `dist-server/*.js` (per your existing `server/tsconfig.json` which has `"outDir": "../dist-server"`). The start command runs the compiled output directly.

4. Add **Environment Variables**:

| Key                     | Value                                    |
| ----------------------- | ---------------------------------------- |
| `MONGO_URI`             | Your Atlas connection string from Step 1 |
| `JWT_SECRET`            | Run `openssl rand -hex 32` to generate   |
| `ADMIN_UNLOCK_CODE`     | Your admin setup code                    |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name               |
| `CLOUDINARY_API_KEY`    | Your Cloudinary API key                  |
| `CLOUDINARY_API_SECRET` | Your Cloudinary API secret               |
| `NODE_ENV`              | `production`                             |

> [!NOTE]
> You do NOT need to set `PORT` — Render automatically provides it via `process.env.PORT`, and your `server/index.ts` already reads from `process.env.PORT || 4000`.

5. Click **"Create Web Service"** → Wait for build
6. Your API is live at: `https://khamarbari-api.onrender.com`

#### Mitigate Cold Starts (Optional)

Render free tier sleeps after 15min → ~30-60s cold start on next request.

1. Go to [uptimerobot.com](https://uptimerobot.com) → Free sign up
2. **"Add New Monitor"** → HTTP(s) → URL: `https://khamarbari-api.onrender.com/api/health`
3. Interval: **5 minutes**

---

### Step 3: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → Log in with GitHub
2. **"Add New..."** → **"Project"** → Import the **same repo**
3. Vercel auto-detects Vite. Verify settings:

| Setting              | Value                           |
| -------------------- | ------------------------------- |
| **Framework Preset** | Vite                            |
| **Build Command**    | `npm run build` (auto-detected) |
| **Output Directory** | `dist` (auto-detected)          |
| **Install Command**  | `npm install` (auto-detected)   |

4. Add **Environment Variable**:

| Key            | Value                                     |
| -------------- | ----------------------------------------- |
| `VITE_API_URL` | `https://khamarbari-api.onrender.com/api` |

> [!IMPORTANT]
> This is the key connection. Your `src/lib/api.ts` already reads `import.meta.env.VITE_API_URL ?? '/api'`. In production, Vite bakes this env var into the built JS at build time, so all API calls go to your Render backend.

5. Click **"Deploy"** → ~1-2 minutes
6. Site live at: `https://your-project.vercel.app`

---

### Step 4: Update CORS on Backend

Your `server/index.ts` currently has `cors({ origin: true })` which allows all origins — this works for deployment. But for production security, restrict it:

```typescript
app.use(
  cors({
    origin: [
      "http://localhost:8080", // local Vite dev
      "https://your-project.vercel.app", // production
      /\.vercel\.app$/, // preview deploys
    ],
    credentials: true,
  }),
);
```

---

## Strategy B: All-in-One on Render (Single URL, No CORS)

If you prefer a single deployment URL where Express serves both the API and the frontend:

### Build Command on Render

```
npm install && npm run build && npx tsc -p server/tsconfig.json
```

This builds both:

- `npm run build` → Vite compiles React to `dist/`
- `npx tsc -p server/tsconfig.json` → TypeScript compiles server to `dist-server/`

### Code Change: Serve Frontend from Express

Add to the bottom of `server/index.ts`, **before** the error handler:

```typescript
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In production, serve the Vite-built frontend
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "../../dist");
  app.use(express.static(clientDist));
  // All non-API routes → index.html (SPA fallback)
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}
```

### Environment on Render

Same as Strategy A env vars, **plus** do NOT set `VITE_API_URL` — the frontend will use the default `/api` since it's served from the same origin.

### Pros/Cons vs Strategy A

|                        | Strategy A (Vercel + Render) | Strategy B (Render only) |
| ---------------------- | ---------------------------- | ------------------------ |
| **Frontend speed**     | ⚡ Vercel global CDN         | ⚠️ Single Render region  |
| **Cold starts affect** | Backend only                 | Everything (site + API)  |
| **CORS**               | Needs config                 | Not needed (same origin) |
| **Simplicity**         | Two dashboards               | One dashboard            |
| **Bandwidth**          | 100GB each                   | 100GB total              |

---

## Free Tier Limits Summary

| Resource                  | Limit                            |
| ------------------------- | -------------------------------- |
| **Render** server hours   | 750/month (~1 always-on service) |
| **Render** bandwidth      | 100GB/month                      |
| **Vercel** bandwidth      | 100GB/month                      |
| **Vercel** deploys        | 100/day                          |
| **Atlas M0** storage      | 512MB                            |
| **Atlas M0** connections  | 500                              |
| **Cloudinary** storage    | 25GB                             |
| **Cloudinary** transforms | 25,000/month                     |

---

## Quick Checklist

- [ ] MongoDB Atlas M0 cluster created with `0.0.0.0/0` network access
- [ ] Backend deployed on Render with correct build/start commands
- [ ] All env vars set on Render (MONGO_URI, JWT_SECRET, CLOUDINARY, etc.)
- [ ] Test `https://your-api.onrender.com/api/health` returns `{"ok":true}`
- [ ] Frontend deployed on Vercel with `VITE_API_URL` pointing to Render
- [ ] Test full signup → login → browse → order flow on production
- [ ] (Optional) UptimeRobot ping set up for cold start mitigation
- [ ] (Optional) CORS restricted to production domain
