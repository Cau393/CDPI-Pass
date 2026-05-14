import { Link, useLocation, useRoute } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  DollarSign,
  FileText,
  FileUp,
  LineChart,
  LogOut,
  Mail,
  Megaphone,
  Printer,
  ScanLine,
  Ticket,
  Users,
} from "lucide-react";

const EVENT_EDIT_PATH =
  /^\/admin\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function NavItem({
  href,
  matchPrefix,
  cortesiasLinksOnly,
  icon: Icon,
  label,
  tooltip,
}: {
  href: string;
  /** Matches active when pathname is under this path (hubs, nested admin routes). */
  matchPrefix?: string;
  /** Active apenas em /admin/cortesias e /admin/cortesias/resgates/… (exc. limite e envio-em-massa). */
  cortesiasLinksOnly?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip: string;
}) {
  const [pathname] = useLocation();
  const [routeActive] = useRoute(href);
  let isActive: boolean;
  if (cortesiasLinksOnly) {
    isActive =
      pathname === "/admin/cortesias" ||
      pathname.startsWith("/admin/cortesias/resgates/");
  } else if (matchPrefix) {
    const p = matchPrefix.split("?")[0];
    if (p === "/admin/cortesias") {
      isActive =
        (pathname === "/admin/cortesias" ||
          pathname.startsWith(`${p}/`)) &&
        !pathname.startsWith("/admin/cortesias/envio-em-massa");
    } else if (p === "/admin/events") {
      isActive =
        pathname === "/admin/events" ||
        pathname === "/admin/events/new" ||
        pathname === "/admin/events/nps" ||
        EVENT_EDIT_PATH.test(pathname);
    } else {
      isActive = pathname === p || pathname.startsWith(`${p}/`);
    }
  } else {
    isActive = !!routeActive;
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
        <Link href={href} className="flex w-full items-center gap-2 overflow-hidden">
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export default function AdminSidebar() {
  const { user } = useAuth();

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-2 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 overflow-hidden rounded-md px-2 py-1 font-semibold text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent"
        >
          <span className="truncate">CDPI Pass</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administração</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem
              href="/admin/verificar"
              icon={ScanLine}
              label="Verificar QR"
              tooltip="Verificar QR"
            />
            <NavItem
              href="/admin/print-terminal"
              icon={Printer}
              label="Terminal de impressão"
              tooltip="Terminal Zebra WebUSB"
            />
            <NavItem
              href="/admin/participants"
              icon={Users}
              label="Participantes"
              tooltip="Participantes"
            />
            <NavItem
              href="/admin/comercial/vendas"
              icon={DollarSign}
              label="Vendas Comercial"
              tooltip="Vendas do Comercial"
            />
            <NavItem
              href="/admin/comunicado/envio-em-massa"
              matchPrefix="/admin/comunicado/envio-em-massa"
              icon={Megaphone}
              label="Envio Comunicado"
              tooltip="Envio em massa de comunicados"
            />
            <NavItem
              href="/admin/templates"
              matchPrefix="/admin/templates"
              icon={FileText}
              label="Templates"
              tooltip="Templates de e-mail (cortesia, lembrete e comunicado)"
            />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Cortesias</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem
              href="/admin/cortesias"
              cortesiasLinksOnly
              icon={Ticket}
              label="Links"
              tooltip="Gerenciar links de cortesia"
            />
              <NavItem
                href="/admin/cortesias/envio-em-massa"
                matchPrefix="/admin/cortesias/envio-em-massa"
                icon={Mail}
                label="Envio em massa"
                tooltip="Envio em massa"
              />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Eventos</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem
              href="/admin/events"
              matchPrefix="/admin/events"
              icon={CalendarDays}
              label="Eventos"
              tooltip="Lista e novos eventos"
            />
            <NavItem
              href="/admin/events/nps"
              matchPrefix="/admin/events/nps"
              icon={LineChart}
              label="Pesquisa NPS"
              tooltip="Exportar respostas NPS"
            />
            <NavItem
              href="/admin/events/certificate-template"
              icon={FileUp}
              label="Template certificado"
              tooltip="Enviar modelo .docx de certificado por evento"
            />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <div className="group-data-[collapsible=icon]:hidden px-2 py-1 text-xs text-sidebar-foreground/80 truncate">
          {user?.name}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Sair</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
