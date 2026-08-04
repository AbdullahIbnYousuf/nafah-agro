import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

const Index = lazy(() => import("./pages/Index"));
const Shop = lazy(() => import("./pages/Shop"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const Cart = lazy(() => import("./pages/Cart"));
const Admin = lazy(() => import("./pages/Admin"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const CustomerProfile = lazy(() => import("./pages/CustomerProfile"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoading() {
  return <div className="flex min-h-screen items-center justify-center text-muted-foreground" role="status">লোড হচ্ছে…</div>;
}

function InvitePasswordRedirect() {
  const { needsPasswordSetup } = useAuth();
  const location = useLocation();
  return needsPasswordSetup && location.pathname !== '/profile'
    ? <Navigate to="/profile" replace />
    : null;
}

const App = () => (
  <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <Sonner />
          <BrowserRouter>
            <InvitePasswordRedirect />
            <Suspense fallback={<PageLoading />}><Routes>
              <Route path="/" element={<Index />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/products/:slug" element={<ProductDetails />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
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
              />
              <Route path="*" element={<NotFound />} />
            </Routes></Suspense>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
  </TooltipProvider>
);

export default App;
