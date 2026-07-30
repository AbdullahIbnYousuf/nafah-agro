# Nafah Agro — Build Instructions

> **Legacy reference only:** this is the original MVP brief. The agreed V1
> scope and implementation rules are in `docs/`.

You are a senior full-stack engineer.
Build a production-ready ecommerce website for an organic food shop called **"Nafah Agro"**.

---

## Tech Stack

| Concern | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS |
| Database | MongoDB |
| Image Storage | Cloudinary |
| Language | Bangla (all UI text must be in Bangla) |
| Theme | Light mode only (no dark mode) |

---

## Color Palette

| Role | Hex |
|---|---|
| Primary | `#004030` |
| Secondary | `#4A9782` |
| Accent | `#DCD0A8` |
| Background | `#FFF9E5` |

> Use these colors consistently in the Tailwind config.

---

## Website Structure

### Homepage (`/`)

Simple hero section with the following contents:

- Logo + Navbar
- Hero title
- Short description
- Two CTA buttons:
  - **"অনলাইনে কিনুন"** → navigates to `/shop`
  - **"আমাদের দোকানে আসুন"** → opens Google Map location

---

### Shop Page (`/shop`)

Displays all products in a product grid.

**Each product card shows:**
- Product image
- Product name
- Price

**Filtering system:**
- Search by product name
- Filter by category
- Filter by price range
- Sorting: low → high, high → low

---

### Product Details Page (`/products/[slug]`)

#### Image Gallery
- Multiple product images (from Cloudinary)
- Admin can add YouTube video links
- YouTube videos appear inside the gallery alongside images

#### Product Info
- Title
- Description
- Price

#### Attribute Selection

Products can have different selectable attributes depending on type. Examples:

| Product | Attribute Options |
|---|---|
| Milk | 1 litre, 2 litre, 5 litre |
| Eggs | Hali (4), Dozen (12) |
| Honey | 250g, 500g, 1kg |

#### Actions
- **Add to Cart**
- **Buy Now**

---

### Cart System

**Features:**
- Add items
- Update quantity
- Remove items
- Show total price

> Cart can be stored using local storage or database session.

---

### Admin Panel

Create protected admin routes starting at `/admin`.

#### Products
- Add product
- Edit product
- Delete product
- Upload images (via Cloudinary)
- Add YouTube video links (shown in product gallery)

#### Categories
- Create categories
- Edit categories
- Delete categories

#### Attributes
- Create attribute types
- Attach attributes to products

#### Stock
- Update stock quantity
- Show low stock warning

#### Orders
- View orders
- Update order status
- Manually create orders (for phone/offline orders)

---

## Other Requirements

- **Slug-based routing** for products. Example: `/products/deshi-murgir-dim`
- **Clean component structure:**
  ```
  components/
  pages/
  lib/
  models/
  api/
  ```
- **API routes** for:
  - Product CRUD
  - Order creation
  - Admin actions
- **Cloudinary** image optimization
- **Responsive design** for mobile, tablet, and desktop

---

## Deliverables

- [ ] Full Next.js project structure
- [ ] MongoDB models
- [ ] API routes
- [ ] Tailwind styling with custom color palette
- [ ] Admin dashboard
- [ ] Product filtering system
- [ ] Attribute-based product options
- [ ] Cart system

> Write clean, modular, and scalable code.
