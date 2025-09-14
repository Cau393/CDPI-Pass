import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import HomePage from "@/pages/HomePage";
import EventsPage from "@/pages/EventsPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import ProfilePage from "@/pages/ProfilePage";
import VerifyCodePage from "@/pages/VerifyCodePage";
import EventDetailsPage from "@/pages/EventDetailsPage";
import QRScannerPage from "@/pages/QRScannerPage";
import AdminTestPage from "@/pages/AdminTestPage";
import CourtesyRedeemPage from "@/pages/CourtesyRedeemPage";
import CourtesyAdminPage from "@/pages/CourtesyAdminPage";
import NotFound from "@/pages/not-found";
import Navigation from "@/components/Navigation";
import AdminRoute from "@/components/AdminRoute";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/eventos" component={EventsPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyCodePage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/event/:id" component={EventDetailsPage} />
        <Route path="/verificar">
          <AdminRoute>
            <QRScannerPage />
          </AdminRoute>
        </Route>
        <Route path="/admin-test" component={AdminTestPage} />
        <Route path="/cortesia" component={CourtesyRedeemPage} />
        <Route path="/cortesia-admin">
          <AdminRoute>
            <CourtesyAdminPage />
          </AdminRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-gray-50">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
