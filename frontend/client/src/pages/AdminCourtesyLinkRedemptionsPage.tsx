import { useMemo } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import CourtesyLinkRedemptionsTable from "@/components/admin/CourtesyLinkRedemptionsTable";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSearch(search: string): { code: string; eventId: string } {
  if (!search.trim()) {
    return { code: "", eventId: "" };
  }
  const q = search.startsWith("?") ? search.slice(1) : search;
  const sp = new URLSearchParams(q);
  return {
    code: sp.get("code") ?? "",
    eventId: sp.get("eventId") ?? "",
  };
}

export default function AdminCourtesyLinkRedemptionsPage() {
  const params = useParams<{ linkId?: string }>();
  const linkId = params.linkId?.trim() ?? "";
  const [, navigate] = useLocation();
  const searchRaw = useSearch();
  const queryClient = useQueryClient();

  const { code, eventId } = useMemo(() => {
    if (!searchRaw) {
      return parseSearch("");
    }
    const qs = searchRaw.startsWith("?") ? searchRaw : `?${searchRaw}`;
    return parseSearch(qs);
  }, [searchRaw]);

  const valid = UUID.test(linkId) && UUID.test(eventId);

  if (!valid) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admin/cortesias">Cortesias</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Resgatantes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <p className="text-sm text-muted-foreground">
          Link ou evento inválido. Volte ao{" "}
          <Link className="underline" href="/admin/cortesias?tab=limite">
            limite por código
          </Link>{" "}
          e abra a lista a partir da busca por código.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/cortesias">Cortesias</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/cortesias?tab=limite">Limite por código</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Resgatantes</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <p className="text-sm text-muted-foreground">Admin / Cortesias</p>
        <h1 className="text-2xl font-bold tracking-tight">Resgatantes do link</h1>
        <p className="text-sm text-muted-foreground">
          Mesma lista e ações do envio em massa (aba Visualizar). Código na barra
          acima da tabela quando os dados carregam.
        </p>
      </div>

      <CourtesyLinkRedemptionsTable
        link={{ id: linkId, code }}
        eventId={eventId}
        onBack={() => navigate("/admin/cortesias?tab=limite")}
        onCancellationSuccess={() =>
          queryClient.invalidateQueries({
            queryKey: ["/api/admin/courtesy-links", "lookup"],
          })
        }
      />
    </div>
  );
}
