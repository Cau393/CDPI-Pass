import { useLayoutEffect } from "react";
import { Switch, Route, useLocation, useParams, useSearch } from "wouter";
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
import AdminShell from "@/components/AdminShell";
import AdminParticipantsPage from "@/pages/AdminParticipantsPage";
import AdminTemplatesHubPage from "@/pages/AdminTemplatesHubPage";
import AdminEventsHubPage from "@/pages/AdminEventsHubPage";
import AdminEditEventPage from "@/pages/AdminEditEventPage";
import AdminCommercialSalesPage from "@/pages/AdminCommercialSalesPage";
import AdminCourtesiasHubPage from "@/pages/AdminCourtesiasHubPage";
import AdminCourtesyLinkRedemptionsPage from "@/pages/AdminCourtesyLinkRedemptionsPage";
import AdminPrintTerminalPage from "@/pages/AdminPrintTerminalPage";
import CertificateTemplateAdminPage from "@/pages/CertificateTemplateAdminPage";

function AdminEventsNewRedirect() {
  const [, navigate] = useLocation();
  useLayoutEffect(() => {
    navigate("/admin/events?tab=novo", { replace: true });
  }, [navigate]);
  return null;
}

function AdminCourtesyQuotaLegacyRedirect() {
  const [, navigate] = useLocation();
  useLayoutEffect(() => {
    navigate("/admin/cortesias?tab=limite", { replace: true });
  }, [navigate]);
  return null;
}

function AdminCourtesiasLimitePathRedirect() {
  const [, navigate] = useLocation();
  useLayoutEffect(() => {
    navigate("/admin/cortesias?tab=limite", { replace: true });
  }, [navigate]);
  return null;
}

function AdminCourtesyQuotaResgatesLegacyRedirect() {
  const params = useParams<{ linkId?: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  useLayoutEffect(() => {
    const linkId = params.linkId?.trim();
    if (!linkId) return;
    const suffix =
      search.trim() === ""
        ? ""
        : search.startsWith("?")
          ? search
          : `?${search}`;
    navigate(`/admin/cortesias/resgates/${linkId}${suffix}`, { replace: true });
  }, [params.linkId, search, navigate]);
  return null;
}

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
        <Route path="/admin/verificar">
          <AdminRoute>
            <AdminShell>
              <QRScannerPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/templates">
          <AdminRoute>
            <AdminShell>
              <AdminTemplatesHubPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin-test" component={AdminTestPage} />
        <Route path="/cortesia" component={CourtesyRedeemPage} />
        <Route path="/admin/cortesias/envio-em-massa">
          <AdminRoute>
            <AdminShell>
              <CourtesyMassSendingPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/cortesias/resgates/:linkId">
          <AdminRoute>
            <AdminShell>
              <AdminCourtesyLinkRedemptionsPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/cortesias/limite">
          <AdminRoute>
            <AdminCourtesiasLimitePathRedirect />
          </AdminRoute>
        </Route>
        <Route path="/admin/cortesias">
          <AdminRoute>
            <AdminShell>
              <AdminCourtesiasHubPage />
            </AdminShell>
          </AdminRoute>
        </Route>
        <Route path="/admin/courtesy-quota/resgates/:linkId">
          <AdminRoute>
            <AdminCourtesyQuotaResgatesLegacyRedirect />
          </AdminRoute>
        </Route>
        <Route path="/admin/courtesy-quota">
          <AdminRoute>
            <AdminCourtesyQuotaLegacyRedirect />
          </AdminRoute>
        </Route>
        <Route path="/admin/participants">
          <AdminRoute>
            <AdminShell>
              <AdminParticipantsPage />
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
            <AdminEventsNewRedirect />
          </AdminRoute>
        </Route>
        <Route path="/admin/events/certificate-template">
          <AdminRoute>
            <AdminShell>
              <CertificateTemplateAdminPage />
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
              <AdminEventsHubPage />
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
