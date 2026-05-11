import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminCreateEventPage from "@/pages/AdminCreateEventPage";
import AdminEventsListPage from "@/pages/AdminEventsListPage";

type EventsTabKey = "list" | "novo";

function tabFromSearch(search: string): EventsTabKey {
  const t = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("tab");
  return t === "novo" ? "novo" : "list";
}

export default function AdminEventsHubPage() {
  const search = useSearch();
  const initialTab = useMemo(() => tabFromSearch(search), [search]);
  const [activeTab, setActiveTab] = useState<EventsTabKey>(initialTab);

  useEffect(() => {
    setActiveTab(tabFromSearch(search));
  }, [search]);

  const handleTabChange = useCallback((v: string) => {
    const next: EventsTabKey = v === "novo" ? "novo" : "list";
    setActiveTab(next);
    const path = next === "novo" ? "/admin/events?tab=novo" : "/admin/events";
    globalThis.history.replaceState(null, "", path);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Eventos</h1>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="novo">Novo evento</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-0">
          <AdminEventsListPage variant="hub" />
        </TabsContent>
        <TabsContent value="novo" className="mt-0">
          <AdminCreateEventPage variant="hub" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
