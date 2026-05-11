import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CourtesyAdminPage from "@/pages/CourtesyAdminPage";
import AdminCourtesyQuotaPage from "@/pages/AdminCourtesyQuotaPage";

type CortesiasTabKey = "links" | "limite";

function tabFromSearch(search: string): CortesiasTabKey {
  const t = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("tab");
  return t === "limite" ? "limite" : "links";
}

export default function AdminCourtesiasHubPage() {
  const search = useSearch();
  const initialTab = useMemo(() => tabFromSearch(search), [search]);
  const [activeTab, setActiveTab] = useState<CortesiasTabKey>(initialTab);

  useEffect(() => {
    setActiveTab(tabFromSearch(search));
  }, [search]);

  const handleTabChange = useCallback((v: string) => {
    const next: CortesiasTabKey = v === "limite" ? "limite" : "links";
    setActiveTab(next);
    const path =
      next === "limite"
        ? "/admin/cortesias?tab=limite"
        : "/admin/cortesias";
    globalThis.history.replaceState(null, "", path);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Cortesias</h1>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="links">Links</TabsTrigger>
          <TabsTrigger value="limite">Limite por código</TabsTrigger>
        </TabsList>
        <TabsContent value="links" className="mt-0">
          <CourtesyAdminPage variant="hub" />
        </TabsContent>
        <TabsContent value="limite" className="mt-0">
          <AdminCourtesyQuotaPage variant="hub" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
