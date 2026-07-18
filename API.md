# Khamarbari E-Shop — API Documentation

> **Base URL:** `http://localhost:4000/api`
>
> **Content-Type:** All request/response bodies use `application/json` unless otherwise noted (image uploads use `multipart/form-data`).
>
> **ID normalization:** All MongoDB `_id` fields are returned as `id` (string) in every response.

---

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Role Permission Matrix](#role-permission-matrix)
3. [Error Format](#error-format)
4. [Health Check](#health-check)
5. [Auth Endpoints](#auth-endpoints)
6. [Products](#products)
7. [Categories](#categories)
8. [Orders](#orders)
9. [Image Upload](#image-upload)
10. [Data Models](#data-models)

---

## Authentication & Authorization

### Overview

The system uses **JWT (JSON Web Token)** Bearer authentication. Tokens are issued on login/registration and expire after **7 days**.

### Three Roles

| Role          | Description                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **admin**     | Full access to all endpoints. Can create/manage moderators, reset their passwords, and deactivate their accounts. Created via a special unlock-code-gated registration endpoint.                                     |
| **moderator** | Can read all data, create/edit products & categories, manage orders (status, payment, delivery). **Cannot** delete products/categories, manage users, or change own credentials. Must use a separate login endpoint. |
| **customer**  | Can browse the public storefront, place orders, and view their own order history. Registers via the public registration endpoint.                                                                                    |

### How to Authenticate

Include the JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Account Deactivation

When an admin deactivates a moderator (`isActive = false`), every authenticated request by that moderator will return `403 Forbidden` with message `"Account has been deactivated. Contact your admin."`. The check happens on every request via a database lookup in the auth middleware.

### Public vs Protected Endpoints

- **Public (no auth needed):** `GET /health`, `GET /products`, `GET /products/tags`, `GET /products/:slug`, `GET /categories`, `POST /auth/register`, `POST /auth/login`, `POST /auth/login/moderator`, `POST /auth/register/admin`, `POST /auth/moderator/request-reset`
- **Protected:** All other endpoints require a valid JWT token.

---

## Role Permission Matrix

This matrix shows exactly which role can access each endpoint. Use this as the authoritative reference.

| Endpoint                              | Method | Public | Customer | Moderator | Admin |
| ------------------------------------- | ------ | ------ | -------- | --------- | ----- |
| `/health`                             | GET    | ✅     | ✅       | ✅        | ✅    |
| `/auth/register`                      | POST   | ✅     | —        | —         | —     |
| `/auth/register/admin`                | POST   | ✅     | —        | —         | —     |
| `/auth/login`                         | POST   | ✅     | —        | —         | —     |
| `/auth/login/moderator`               | POST   | ✅     | —        | —         | —     |
| `/auth/moderator/request-reset`       | POST   | ✅     | —        | —         | —     |
| `/auth/me`                            | GET    | ❌     | ✅       | ✅        | ✅    |
| `/auth/register/moderator`            | POST   | ❌     | ❌       | ❌        | ✅    |
| `/auth/moderators`                    | GET    | ❌     | ❌       | ❌        | ✅    |
| `/auth/moderators/:id/reset-password` | PATCH  | ❌     | ❌       | ❌        | ✅    |
| `/auth/moderators/:id/toggle-active`  | PATCH  | ❌     | ❌       | ❌        | ✅    |
| `/auth/moderators/:id`                | DELETE | ❌     | ❌       | ❌        | ✅    |
| `/products`                           | GET    | ✅     | ✅       | ✅        | ✅    |
| `/products/tags`                      | GET    | ✅     | ✅       | ✅        | ✅    |
| `/products/:slug`                     | GET    | ✅     | ✅       | ✅        | ✅    |
| `/products`                           | POST   | ❌     | ❌       | ✅        | ✅    |
| `/products/:id`                       | PUT    | ❌     | ❌       | ✅        | ✅    |
| `/products/:id/stock`                 | PATCH  | ❌     | ❌       | ❌        | ✅    |
| `/products/:id`                       | DELETE | ❌     | ❌       | ❌        | ✅    |
| `/categories`                         | GET    | ✅     | ✅       | ✅        | ✅    |
| `/categories`                         | POST   | ❌     | ❌       | ✅        | ✅    |
| `/categories/:id`                     | PUT    | ❌     | ❌       | ✅        | ✅    |
| `/categories/:id`                     | DELETE | ❌     | ❌       | ❌        | ✅    |
| `/orders`                             | GET    | ❌     | ❌       | ✅        | ✅    |
| `/orders/my`                          | GET    | ❌     | ✅       | ✅        | ✅    |
| `/orders/:id`                         | GET    | ❌     | ❌       | ✅        | ✅    |
| `/orders`                             | POST   | ❌     | ✅       | ✅        | ✅    |
| `/orders/:id/status`                  | PATCH  | ❌     | ❌       | ✅        | ✅    |
| `/orders/:id/payment`                 | PATCH  | ❌     | ❌       | ✅        | ✅    |
| `/orders/:id/delivery`                | PATCH  | ❌     | ❌       | ✅        | ✅    |
| `/upload`                             | POST   | ❌     | ❌       | ✅        | ✅    |
| `/upload/multiple`                    | POST   | ❌     | ❌       | ✅        | ✅    |

> **Key takeaways for an LLM acting as Moderator:**
>
> - You can **read** all products, categories, and orders.
> - You can **create/edit** products and categories, but **cannot delete** them.
> - You can **create orders**, **update order status**, **update payment info**, and **assign delivery** details.
> - You **cannot** manage users, reset passwords, or access admin-only endpoints.
> - You can **upload images** (single or multiple) for product creation.
> - You can **view your own orders** via `GET /orders/my`.

---

## Error Format

All errors return a JSON body with an `error` field:

```json
{
  "error": "Human-readable error message"
}
```

Common HTTP status codes:

| Code  | Meaning                                                               |
| ----- | --------------------------------------------------------------------- |
| `400` | Bad request — missing or invalid parameters                           |
| `401` | Unauthorized — missing or invalid JWT token                           |
| `403` | Forbidden — valid token but insufficient role, or account deactivated |
| `404` | Not found — resource does not exist                                   |
| `409` | Conflict — e.g., email already registered                             |
| `500` | Internal server error                                                 |

---

## Health Check

### `GET /health`

**Auth:** None

**Response `200`**

```json
{ "ok": true }
```

---

## Auth Endpoints

All auth endpoints are prefixed with `/auth`.

---

### `POST /auth/register`

Register a new **customer** account.

**Auth:** None

**Request Body**

```json
{
  "name": "রাহিম উদ্দিন",
  "email": "rahim@example.com",
  "password": "securepassword123"
}
```

| Field      | Type   | Required | Description                        |
| ---------- | ------ | -------- | ---------------------------------- |
| `name`     | string | ✅       | Display name                       |
| `email`    | string | ✅       | Unique email (lowercased, trimmed) |
| `password` | string | ✅       | Min length enforced by schema      |

**Response `201`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "name": "রাহিম উদ্দিন",
    "email": "rahim@example.com",
    "role": "customer"
  }
}
```

**Errors:** `400` missing fields, `409` email already exists.

---

### `POST /auth/register/admin`

Register a new **admin** account. Requires the server's secret unlock code.

**Auth:** None

**Request Body**

```json
{
  "name": "Admin Name",
  "email": "admin@example.com",
  "password": "adminpassword",
  "unlockCode": "SUPER_SECRET_CODE"
}
```

| Field        | Type   | Required | Description                            |
| ------------ | ------ | -------- | -------------------------------------- |
| `name`       | string | ✅       | Display name                           |
| `email`      | string | ✅       | Unique email                           |
| `password`   | string | ✅       | Password                               |
| `unlockCode` | string | ✅       | Must match `ADMIN_UNLOCK_CODE` env var |

**Response `201`** — Same shape as customer register.

**Errors:** `400` missing fields, `403` invalid unlock code, `409` email exists.

---

### `POST /auth/register/moderator`

Create a new **moderator** account. **Admin only.**

**Auth:** `Bearer <admin_token>`

**Request Body**

```json
{
  "name": "মডারেটর নাম",
  "email": "mod@example.com",
  "password": "initialpassword"
}
```

**Response `201`**

```json
{
  "user": {
    "id": "665f1a2b...",
    "name": "মডারেটর নাম",
    "email": "mod@example.com",
    "role": "moderator",
    "isActive": true
  }
}
```

> **Note:** This does NOT return a token. Admin creates the account, then the moderator logs in separately.

**Errors:** `400` missing fields, `401` not authenticated, `403` not admin, `409` email exists.

---

### `POST /auth/login`

Login for **customers** and **admins**. Moderators are rejected (must use `/auth/login/moderator`).

**Auth:** None

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response `200`**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "665f1a2b...",
    "name": "User Name",
    "email": "user@example.com",
    "role": "customer"
  }
}
```

**Errors:** `401` invalid credentials, `403` moderators must use moderator login, `403` account deactivated.

---

### `POST /auth/login/moderator`

Login for **moderators only**. Non-moderator accounts are rejected.

**Auth:** None

**Request Body**

```json
{
  "email": "moderator@example.com",
  "password": "modpassword"
}
```

**Response `200`** — Same shape as customer login, with `role: "moderator"`.

**Errors:** `401` invalid credentials, `403` account deactivated.

---

### `POST /auth/moderator/request-reset`

Moderator requests a password reset. **No authentication required.** This sets a flag on the moderator's account that the admin can see. The admin then manually resets the password.

**Auth:** None

**Request Body**

```json
{
  "email": "moderator@example.com"
}
```

**Response `200`** — Always returns success (does not reveal whether the email exists):

```json
{
  "message": "Password reset request sent to admin. They will contact you soon."
}
```

---

### `GET /auth/me`

Get the currently authenticated user's profile.

**Auth:** `Bearer <token>` (any role)

**Response `200`**

```json
{
  "id": "665f1a2b...",
  "name": "User Name",
  "email": "user@example.com",
  "role": "customer",
  "isActive": true,
  "passwordResetRequested": false,
  "createdAt": "2024-06-01T10:00:00.000Z",
  "updatedAt": "2024-06-01T10:00:00.000Z"
}
```

---

### `GET /auth/moderators`

List all moderator accounts. **Admin only.**

**Auth:** `Bearer <admin_token>`

**Response `200`**

```json
[
  {
    "id": "665f1a2b...",
    "name": "মডারেটর নাম",
    "email": "mod@example.com",
    "role": "moderator",
    "isActive": true,
    "passwordResetRequested": false,
    "createdBy": "665f0a1b...",
    "createdAt": "2024-06-01T10:00:00.000Z",
    "updatedAt": "2024-06-01T10:00:00.000Z"
  }
]
```

---

### `PATCH /auth/moderators/:id/reset-password`

Admin resets a moderator's password. Also clears the `passwordResetRequested` flag.

**Auth:** `Bearer <admin_token>`

**Request Body**

```json
{
  "newPassword": "newSecurePassword"
}
```

**Response `200`**

```json
{
  "message": "Password reset successfully"
}
```

**Errors:** `400` password < 6 chars, `404` moderator not found.

---

### `PATCH /auth/moderators/:id/toggle-active`

Admin enables or disables a moderator account. When disabled (`isActive: false`), the moderator is blocked from every authenticated endpoint.

**Auth:** `Bearer <admin_token>`

**Response `200`** — Returns the updated moderator object.

```json
{
  "id": "665f1a2b...",
  "name": "মডারেটর নাম",
  "email": "mod@example.com",
  "role": "moderator",
  "isActive": false,
  "passwordResetRequested": false,
  "createdAt": "2024-06-01T10:00:00.000Z"
}
```

---

### `DELETE /auth/moderators/:id`

Permanently delete a moderator account. **Admin only.**

**Auth:** `Bearer <admin_token>`

**Response `200`**

```json
{
  "message": "Moderator deleted"
}
```

---

## Products

### `GET /products`

List products with optional filtering, sorting, and pagination.

**Auth:** None (public)

**Query Parameters**

| Parameter  | Type    | Default   | Description                                                                                                       |
| ---------- | ------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| `query`    | string  | —         | Free-text search. Searches `name`, `description`, and `tags` (or `name`/`description` only when `type=category`). |
| `type`     | string  | `product` | Controls search target: `product` or `category`.                                                                  |
| `category` | string  | —         | Filter by `categoryId` (MongoDB ObjectId).                                                                        |
| `tag`      | string  | —         | Filter by exact tag value.                                                                                        |
| `featured` | boolean | —         | `true` = only featured, `false` = exclude featured.                                                               |
| `minPrice` | number  | —         | Minimum price (inclusive).                                                                                        |
| `maxPrice` | number  | —         | Maximum price (inclusive).                                                                                        |
| `sort`     | string  | `newest`  | Sort: `newest`, `oldest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`.                                     |
| `page`     | number  | `1`       | 1-based page number.                                                                                              |
| `limit`    | number  | `20`      | Items per page (1–100).                                                                                           |

**Response `200`**

```json
{
  "data": [
    /* Product[] */
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

### `GET /products/tags`

Returns all distinct tags, sorted alphabetically.

**Auth:** None (public)

**Response `200`**

```json
["dairy", "eggs", "organic", "vegetables"]
```

---

### `GET /products/:slug`

Get a single product by its URL slug.

**Auth:** None (public)

**Response `200`** — A single Product object (see [Data Models](#product-object)).

**Errors:** `404` product not found.

---

### `POST /products`

Create a new product.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request Body** — Full Product object (without `id`). See [Data Models](#product-object) for the schema.

```json
{
  "name": "দেশি মুরগির ডিম",
  "slug": "desi-murgi-dim",
  "description": "তাজা দেশি মুরগির ডিম",
  "price": 120,
  "categoryId": "665f0a1b2c3d4e5f6a7b8c9d",
  "images": ["https://res.cloudinary.com/..."],
  "youtubeLinks": [],
  "attributes": [],
  "stock": 100,
  "featured": false,
  "tags": ["organic", "eggs"]
}
```

**Response `201`** — The created Product object with `id`.

---

### `PUT /products/:id`

Update a product by ID.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request Body** — Partial or full Product object (fields to update).

**Response `200`** — The updated Product object.

**Errors:** `404` product not found.

---

### `PATCH /products/:id/stock`

Update only the stock for a product.

**Auth:** `Bearer <token>` — **admin only**

**Request Body**

```json
{
  "stock": 50
}
```

**Response `200`** — The updated Product object.

---

### `DELETE /products/:id`

Delete a product.

**Auth:** `Bearer <token>` — **admin only**

**Response `200`**

```json
{ "ok": true }
```

---

## Categories

### `GET /categories`

List all categories, sorted alphabetically by name.

**Auth:** None (public)

**Response `200`**

```json
[
  {
    "id": "665f0a1b...",
    "name": "ডিম",
    "slug": "dim"
  }
]
```

---

### `POST /categories`

Create a new category.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request Body**

```json
{
  "name": "ডিম",
  "slug": "dim"
}
```

**Response `201`** — The created Category object with `id`.

---

### `PUT /categories/:id`

Update a category by ID.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request Body** — Partial or full Category fields.

**Response `200`** — The updated Category object.

**Errors:** `404` category not found.

---

### `DELETE /categories/:id`

Delete a category.

**Auth:** `Bearer <token>` — **admin only**

**Response `200`**

```json
{ "ok": true }
```

---

## Orders

### `GET /orders`

List all orders, sorted newest first.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Response `200`** — Array of Order objects (see [Data Models](#order-object)).

```json
[
  /* Order[] */
]
```

---

### `GET /orders/my`

List the currently authenticated user's own orders, sorted newest first.

**Auth:** `Bearer <token>` — **any role** (customer, moderator, admin)

**Important behavior by role:**

- **Customer:** Delivery details (`deliveryTeam`, `deliveryRider`, `deliveryNotes`) are **stripped** from the response. Customer only sees order summary and tracking status.
- **Moderator/Admin:** Full order details including delivery assignment.

**Response `200`** — Array of Order objects (possibly with delivery fields stripped for customers).

---

### `GET /orders/:id`

Get a single order by ID with full details.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Response `200`** — Single Order object.

**Errors:** `404` order not found.

---

### `POST /orders`

Place a new order.

**Auth:** `Bearer <token>` — **any role** (customer, moderator, admin)

The server automatically populates the `placedBy` field from the authenticated user's JWT, recording who placed the order.

**Request Body**

```json
{
  "items": [
    {
      "productId": "665f1a2b...",
      "productName": "দেশি মুরগির ডিম",
      "quantity": 2,
      "selectedAttributes": { "পরিমাণ": "12" },
      "unitPrice": 180
    }
  ],
  "subtotal": 360,
  "shippingCost": 60,
  "discount": 0,
  "total": 420,
  "paymentMethod": "cod",
  "customerName": "রাহিম উদ্দিন",
  "customerPhone": "01712345678",
  "customerAddress": "ঢাকা, বাংলাদেশ",
  "source": "online"
}
```

| Field             | Type       | Required | Description                                                 |
| ----------------- | ---------- | -------- | ----------------------------------------------------------- |
| `items`           | CartItem[] | ✅       | Array of items (see schema below)                           |
| `subtotal`        | number     | ✅       | Sum of item totals                                          |
| `shippingCost`    | number     | ❌       | Default `0`                                                 |
| `discount`        | number     | ❌       | Default `0`                                                 |
| `total`           | number     | ✅       | Final total after shipping and discount                     |
| `paymentMethod`   | string     | ❌       | `"cod"`, `"mobilebank"`, or `"sslcommerz"`. Default `"cod"` |
| `customerName`    | string     | ✅       | Customer's name                                             |
| `customerPhone`   | string     | ✅       | Customer's phone                                            |
| `customerAddress` | string     | ✅       | Delivery address                                            |
| `source`          | string     | ❌       | `"online"`, `"phone"`, or `"offline"`. Default `"online"`   |

> **Auto-populated fields:** `placedBy` (userId, userName, userRole), `status` (defaults to `"pending"`), `paymentStatus` (defaults to `"unpaid"`).

**Response `201`** — The created Order object with `id`.

---

### `PATCH /orders/:id/status`

Update an order's fulfillment status.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request Body**

```json
{
  "status": "confirmed"
}
```

Valid status values: `"pending"`, `"confirmed"`, `"processing"`, `"delivered"`, `"cancelled"`

**Response `200`** — The updated Order object.

---

### `PATCH /orders/:id/payment`

Update an order's payment tracking information.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request Body**

```json
{
  "paymentStatus": "paid",
  "paymentReference": "TXN123456789"
}
```

| Field              | Type   | Required | Description                               |
| ------------------ | ------ | -------- | ----------------------------------------- |
| `paymentStatus`    | string | ❌       | `"unpaid"`, `"paid"`, or `"refunded"`     |
| `paymentReference` | string | ❌       | Transaction ID (e.g., bKash/Nagad TXN ID) |

**Response `200`** — The updated Order object.

---

### `PATCH /orders/:id/delivery`

Assign or update delivery details for an order.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request Body**

```json
{
  "deliveryTeam": "Pathao",
  "deliveryRider": "Karim",
  "deliveryNotes": "ফ্রাজাইল আইটেম, সাবধানে ডেলিভারি করবেন"
}
```

| Field           | Type   | Required | Description                |
| --------------- | ------ | -------- | -------------------------- |
| `deliveryTeam`  | string | ❌       | Delivery company/team name |
| `deliveryRider` | string | ❌       | Assigned rider's name      |
| `deliveryNotes` | string | ❌       | Special instructions       |

**Response `200`** — The updated Order object.

---

## Image Upload

Both endpoints use `multipart/form-data` instead of JSON. Images are uploaded to Cloudinary.

### `POST /upload`

Upload a single image.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request:** `multipart/form-data` with field name `image`.

**Response `200`**

```json
{
  "url": "https://res.cloudinary.com/xxx/image/upload/v1234/khamarbari/abc.jpg"
}
```

---

### `POST /upload/multiple`

Upload up to 10 images at once.

**Auth:** `Bearer <token>` — **admin** or **moderator**

**Request:** `multipart/form-data` with field name `images` (up to 10 files).

**Response `200`**

```json
{
  "urls": [
    "https://res.cloudinary.com/xxx/image/upload/v1234/khamarbari/abc.jpg",
    "https://res.cloudinary.com/xxx/image/upload/v1234/khamarbari/def.jpg"
  ]
}
```

---

## Data Models

### Product Object

```json
{
  "id": "665f1a2b3c4d5e6f7a8b9c0d",
  "name": "দেশি মুরগির ডিম",
  "slug": "desi-murgi-dim",
  "description": "তাজা দেশি মুরগির ডিম, প্রতিদিন সংগ্রহ করা হয়",
  "price": 120,
  "categoryId": "665f0a1b2c3d4e5f6a7b8c9d",
  "images": ["https://res.cloudinary.com/..."],
  "youtubeLinks": ["https://youtu.be/..."],
  "attributes": [
    {
      "name": "পরিমাণ",
      "options": [
        { "label": "৬ পিস", "value": "6", "priceModifier": 0 },
        { "label": "১২ পিস", "value": "12", "priceModifier": 60 }
      ]
    }
  ],
  "stock": 100,
  "featured": true,
  "tags": ["organic", "eggs"],
  "createdAt": "2024-06-01T10:00:00.000Z",
  "updatedAt": "2024-06-01T10:00:00.000Z"
}
```

### Category Object

```json
{
  "id": "665f0a1b2c3d4e5f6a7b8c9d",
  "name": "ডিম",
  "slug": "dim"
}
```

### Order Object

```json
{
  "id": "665f2b3c4d5e6f7a8b9c0e1f",
  "items": [
    {
      "productId": "665f1a2b...",
      "productName": "দেশি মুরগির ডিম",
      "quantity": 2,
      "selectedAttributes": { "পরিমাণ": "12" },
      "unitPrice": 180
    }
  ],
  "subtotal": 360,
  "shippingCost": 60,
  "discount": 0,
  "total": 420,
  "paymentMethod": "cod",
  "paymentStatus": "unpaid",
  "paymentReference": "",
  "status": "pending",
  "customerName": "রাহিম উদ্দিন",
  "customerPhone": "01712345678",
  "customerAddress": "ঢাকা, বাংলাদেশ",
  "source": "online",
  "placedBy": {
    "userId": "665f1a2b...",
    "userName": "রাহিম উদ্দিন",
    "userRole": "customer"
  },
  "deliveryTeam": "",
  "deliveryRider": "",
  "deliveryNotes": "",
  "createdAt": "2024-06-01T10:00:00.000Z",
  "updatedAt": "2024-06-01T10:00:00.000Z"
}
```

### User Object

```json
{
  "id": "665f1a2b...",
  "name": "User Name",
  "email": "user@example.com",
  "role": "customer",
  "isActive": true,
  "passwordResetRequested": false,
  "createdAt": "2024-06-01T10:00:00.000Z",
  "updatedAt": "2024-06-01T10:00:00.000Z"
}
```

> **Note:** The `password` field is never returned in any response. It is bcrypt-hashed in the database.

### Moderator Object

Same as User but always has `role: "moderator"`. Additional relevant fields:

| Field                    | Type    | Description                                                          |
| ------------------------ | ------- | -------------------------------------------------------------------- |
| `isActive`               | boolean | `false` = account deactivated by admin, all API access blocked       |
| `passwordResetRequested` | boolean | `true` = moderator has requested a password reset via the login page |
| `createdBy`              | string  | Admin user ID who created this moderator                             |

### Enum Reference

| Enum           | Valid Values                                                   |
| -------------- | -------------------------------------------------------------- |
| User role      | `admin`, `moderator`, `customer`                               |
| Order status   | `pending`, `confirmed`, `processing`, `delivered`, `cancelled` |
| Payment method | `cod`, `mobilebank`, `sslcommerz`                              |
| Payment status | `unpaid`, `paid`, `refunded`                                   |
| Order source   | `online`, `phone`, `offline`                                   |

---

## Quick Reference for LLM (Moderator Access)

If you are an LLM operating with **moderator-level** credentials, here is your capability summary:

### ✅ You CAN

1. **Read products:** `GET /products`, `GET /products/:slug`, `GET /products/tags`
2. **Create products:** `POST /products` (include images via upload first)
3. **Edit products:** `PUT /products/:id`
4. **Read categories:** `GET /categories`
5. **Create categories:** `POST /categories`
6. **Edit categories:** `PUT /categories/:id`
7. **List all orders:** `GET /orders`
8. **View single order:** `GET /orders/:id`
9. **View your own orders:** `GET /orders/my`
10. **Place orders:** `POST /orders`
11. **Update order status:** `PATCH /orders/:id/status`
12. **Update payment info:** `PATCH /orders/:id/payment`
13. **Assign delivery:** `PATCH /orders/:id/delivery`
14. **Upload images:** `POST /upload`, `POST /upload/multiple`
15. **Get your profile:** `GET /auth/me`

### ❌ You CANNOT

1. Delete products (`DELETE /products/:id` → 403)
2. Delete categories (`DELETE /categories/:id` → 403)
3. Update stock directly (`PATCH /products/:id/stock` → 403)
4. List/manage moderators (`GET /auth/moderators` → 403)
5. Create/delete moderators
6. Reset passwords
7. Access admin-only endpoints

### Workflow: Creating a Product

```
1. Upload images:       POST /upload/multiple (multipart/form-data, field "images")
2. Get categories:      GET /categories  (to find a valid categoryId)
3. Create product:      POST /products   (include image URLs from step 1)
```

### Workflow: Processing an Order

```
1. View all orders:     GET /orders
2. Update status:       PATCH /orders/:id/status     { "status": "confirmed" }
3. Assign delivery:     PATCH /orders/:id/delivery   { "deliveryTeam": "Pathao", "deliveryRider": "Karim" }
4. Mark paid:           PATCH /orders/:id/payment    { "paymentStatus": "paid", "paymentReference": "TXN123" }
5. Mark delivered:      PATCH /orders/:id/status     { "status": "delivered" }
```
