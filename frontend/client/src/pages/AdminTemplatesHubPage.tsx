import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminCourtesyTemplatePage from "@/pages/AdminCourtesyTemplatePage";
import AdminReminderTemplatePage from "@/pages/AdminReminderTemplatePage";
import AdminCommunicateTemplatePage from "@/pages/AdminCommunicateTemplatePage";

export type TemplatesTabKey = "cortesia" | "lembrete" | "comunicado";

function tabFromSearch(search: string): TemplatesTabKey {
  const t = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("tab");
  if (t === "lembrete") return "lembrete";
  if (t === "comunicado") return "comunicado";
  return "cortesia";
}

export default function AdminTemplatesHubPage() {
  const search = useSearch();
  const initialTab = useMemo(() => tabFromSearch(search), [search]);
  const [activeTab, setActiveTab] = useState<TemplatesTabKey>(initialTab);

  useEffect(() => {
    setActiveTab(tabFromSearch(search));
  }, [search]);

  const handleTabChange = useCallback((v: string) => {
    const next: TemplatesTabKey =
      v === "lembrete" ? "lembrete" : v === "comunicado" ? "comunicado" : "cortesia";
    setActiveTab(next);
    const path =
      next === "lembrete"
        ? "/admin/templates?tab=lembrete"
        : next === "comunicado"
          ? "/admin/templates?tab=comunicado"
          : "/admin/templates";
    globalThis.history.replaceState(null, "", path);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Templates</h1>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6 flex flex-wrap gap-1">
          <TabsTrigger value="cortesia">E-mail cortesia</TabsTrigger>
          <TabsTrigger value="lembrete">E-mail lembrete (resgate)</TabsTrigger>
          <TabsTrigger value="comunicado">E-mail comunicado</TabsTrigger>
        </TabsList>
        <TabsContent value="cortesia" className="mt-0">
          <AdminCourtesyTemplatePage embeddedInHub />
        </TabsContent>
        <TabsContent value="lembrete" className="mt-0">
          <AdminReminderTemplatePage embeddedInHub />
        </TabsContent>
        <TabsContent value="comunicado" className="mt-0">
          <AdminCommunicateTemplatePage embeddedInHub />
        </TabsContent>
      </Tabs>
    </div>
  );
}
