# Khamarbari E-Shop

A production-ready ecommerce website for **Khamarbari**, an organic food shop. The UI is in Bangla.

**Live repo:** https://github.com/version3-omnichannel/Ecommerce-Store-for-API-Endpoint.git

---

## Tech Stack

| Concern | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Backend | Express.js + TypeScript |
| Database | MongoDB (Mongoose) |
| Image Storage | Cloudinary |
| Routing | React Router DOM v6 |

---

## Prerequisites

- **Node.js** v18 or higher
- **MongoDB** — local instance or MongoDB Atlas URI
- **Cloudinary** account (free tier works)

---

## Environment Setup

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Express server port
PORT=4000

# MongoDB connection string
MONGO_URI=mongodb://localhost:27017/khamarbari

# Allowed frontend origin (for CORS)
CLIENT_URL=http://localhost:8080

# Cloudinary credentials (from cloudinary.com dashboard)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Frontend API base URL (must match backend PORT)
VITE_API_URL=http://localhost:4000
```

---

## Installation

```bash
npm install
```

---

## Running the App

You need **two terminals** — one for the backend, one for the frontend.

### Terminal 1 — Backend (Express API)

```bash
npm run server
```

Starts the Express server with hot-reload on `http://localhost:4000`.

### Terminal 2 — Frontend (Vite dev server)

```bash
npm run dev
```

Starts the React app on `http://localhost:8080`.

The frontend proxies all `/api` requests to the backend automatically.

---

## Seeding the Database

To populate the database with sample products, categories, and data:

```bash
npm run seed
```

Run this **after** the backend is connected to MongoDB.

---

## Building for Production

```bash
# Build the frontend
npm run build

# Preview the production build locally
npm run preview
```

The built frontend outputs to `dist/`. Serve `dist/` with a static host (e.g. Nginx, Vercel) and deploy the Express server separately.

---

## Project Structure

```
khamarbari-e-shop/
├── server/                  # Express backend
│   ├── models/              # Mongoose schemas (Product, Category, Order)
│   ├── routes/              # API route handlers
│   ├── index.ts             # Server entry point
│   ├── seed.ts              # Database seeder
│   └── env.ts               # Env validation
├── src/                     # React frontend
│   ├── components/          # Reusable UI components
│   │   └── ui/              # shadcn/ui primitives
│   ├── contexts/            # React context (CartContext)
│   ├── hooks/               # Custom hooks
│   ├── lib/                 # API client, types, utilities
│   └── pages/               # Page components (Home, Shop, Admin, Cart, etc.)
├── public/                  # Static assets
├── .env.example             # Environment variable template
└── instruction.md           # Original project spec
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/products` | List all products |
| POST | `/api/products` | Create a product (admin) |
| PUT | `/api/products/:id` | Update a product (admin) |
| DELETE | `/api/products/:id` | Delete a product (admin) |
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create a category (admin) |
| GET | `/api/orders` | List all orders (admin) |
| POST | `/api/orders` | Place an order |
| PUT | `/api/orders/:id` | Update order status (admin) |
| POST | `/api/upload` | Upload image to Cloudinary |

---

## Pages

| Route | Description |
|---|---|
| `/` | Homepage with hero and CTAs |
| `/shop` | Product grid with search, filter, sort |
| `/products/:slug` | Product detail with gallery, attributes, add to cart |
| `/cart` | Cart with quantity management and totals |
| `/admin` | Admin dashboard (products, categories, orders, stock) |

---

## Running Tests

```bash
# Unit tests (Vitest)
npm run test

# Unit tests in watch mode
npm run test:watch
```

---

## Color Palette

| Role | Hex |
|---|---|
| Primary | `#004030` |
| Secondary | `#4A9782` |
| Accent | `#DCD0A8` |
| Background | `#FFF9E5` |
