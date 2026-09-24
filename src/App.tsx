import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { PwaProvider } from "@/contexts/PwaContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import GuestRoute from "@/components/GuestRoute";
import RouteEffects from "@/components/RouteEffects";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductGridSkeleton from "@/components/ProductGridSkeleton";
import { OfflineNotice, PwaUpdatePrompt } from "@/components/PwaStatus";
import { useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";

const Shop = lazy(() => import("./pages/Shop"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const Cart = lazy(() => import("./pages/Cart"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminDashboard = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminDashboard })));
const AdminProducts = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminProducts })));
const AdminProductCreate = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminProductCreate })));
const AdminProductEdit = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminProductEdit })));
const AdminProductVariants = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminProductVariants })));
const AdminCategories = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminCategories })));
const AdminInventory = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminInventory })));
const AdminPhysicalSales = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminPhysicalSales })));
const AdminDues = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminDues })));
const AdminOrders = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminOrders })));
const AdminNotFound = lazy(() => import("./pages/Admin").then((module) => ({ default: module.AdminNotFound })));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const CustomerProfile = lazy(() => import("./pages/CustomerProfile"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoading() {
  const location = useLocation();
  if (location.pathname === '/shop') {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="container mx-auto flex-1 px-4 py-8">
          <div className="mb-6 h-9 w-56 animate-pulse rounded bg-muted" />
          <div className="mb-3 flex flex-wrap gap-3">
            <div className="h-11 min-w-[200px] flex-1 animate-pulse rounded bg-muted" />
            <div className="h-11 w-full animate-pulse rounded bg-muted sm:w-44" />
            <div className="h-11 w-full animate-pulse rounded bg-muted sm:w-40" />
            <div className="h-11 w-full animate-pulse rounded bg-muted sm:w-48" />
          </div>
          <div className="mb-6 h-11 w-32 animate-pulse rounded-full bg-muted" />
          <ProductGridSkeleton count={12} />
        </main>
        <Footer />
      </div>
    );
  }
  return <div className="flex min-h-screen items-center justify-center text-muted-foreground" role="status">লোড হচ্ছে…</div>;
}

export function InvitePasswordRedirect() {
  const { needsPasswordSetup } = useAuth();
  const location = useLocation();
  return needsPasswordSetup
    && location.pathname !== '/profile'
    && location.pathname !== '/reset-password'
    ? <Navigate to="/profile" replace />
    : null;
}

const App = () => (
  <PwaProvider>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <Sonner />
          <OfflineNotice />
          <PwaUpdatePrompt />
          <BrowserRouter>
            <RouteEffects />
            <InvitePasswordRedirect />
            <Suspense fallback={<PageLoading />}><Routes>
              <Route path="/" element={<Index />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/products/:slug" element={<ProductDetails />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
              <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute roles={['OWNER', 'CUSTOMER']}>
                    <CustomerProfile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute roles={['OWNER']}>
                    <Admin />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="products" element={<AdminProducts />}>
                  <Route path="new" element={<AdminProductCreate />} />
                  <Route path=":productId/edit" element={<AdminProductEdit />} />
                  <Route path=":productId/variants" element={<AdminProductVariants />} />
                </Route>
                <Route path="categories" element={<AdminCategories />} />
                <Route path="inventory" element={<AdminInventory />} />
                <Route path="inventory/purchase" element={<AdminInventory />} />
                <Route path="inventory/adjustment" element={<AdminInventory />} />
                <Route path="inventory/loss" element={<AdminInventory />} />
                <Route path="inventory/reconciliation" element={<AdminInventory />} />
                <Route path="inventory/correction" element={<AdminInventory />} />
                <Route path="physical-sales" element={<AdminPhysicalSales />} />
                <Route path="dues" element={<AdminDues />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="*" element={<AdminNotFound />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes></Suspense>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </PwaProvider>
);

export default App;
