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
import CourtesyMassSendingPage from "@/pages/CourtesyMassSendingPage";
import CertificateTemplateAdminPage from "@/pages/CertificateTemplateAdminPage";
import AdminShell from "@/components/AdminShell";
import AdminParticipantsPage from "@/pages/AdminParticipantsPage";
import AdminCourtesyTemplatePage from "@/pages/AdminCourtesyTemplatePage";
import AdminCreateEventPage from "@/pages/AdminCreateEventPage";
import AdminEventsListPage from "@/pages/AdminEventsListPage";
import AdminEditEventPage from "@/pages/AdminEditEventPage";
import AdminCommercialSalesPage from "@/pages/AdminCommercialSalesPage";
import AdminCourtesyQuotaPage from "@/pages/AdminCourtesyQuotaPage";
import AdminPrintTerminalPage from "@/pages/AdminPrintTerminalPage";

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
            <AdminShell>
              <QRScannerPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/enviar-template">
          <AdminRoute>
            <AdminShell>
              <CertificateTemplateAdminPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin-test" component={AdminTestPage} />
        <Route path="/cortesia" component={CourtesyRedeemPage} />
        <Route path="/cortesia-admin">
          <AdminRoute>
            <AdminShell>
              <CourtesyAdminPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/courtesy-quota">
          <AdminRoute>
            <AdminShell>
              <AdminCourtesyQuotaPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/cortesia-envio-em-massa">
          <AdminRoute>
            <AdminShell>
              <CourtesyMassSendingPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/participants">
          <AdminRoute>
            <AdminShell>
              <AdminParticipantsPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/courtesy-template">
          <AdminRoute>
            <AdminShell>
              <AdminCourtesyTemplatePage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/comercial/vendas">
          <AdminRoute>
            <AdminShell>
              <AdminCommercialSalesPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/print-terminal">
          <AdminRoute>
            <AdminShell>
              <AdminPrintTerminalPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/events/new">
          <AdminRoute>
            <AdminShell>
              <AdminCreateEventPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/events/:id">
          <AdminRoute>
            <AdminShell>
              <AdminEditEventPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/events">
          <AdminRoute>
            <AdminShell>
              <AdminEventsListPage />
            </AdminShell>
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