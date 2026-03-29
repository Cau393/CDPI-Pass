import { Link, useRoute } from "wouter";
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
  CalendarPlus,
  FileText,
  FileUp,
  LogOut,
  Mail,
  ScanLine,
  Ticket,
  Users,
} from "lucide-react";

function NavItem({
  href,
  icon: Icon,
  label,
  tooltip,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip: string;
}) {
  const [isActive] = useRoute(href);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={!!isActive} tooltip={tooltip}>
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
              href="/verificar"
              icon={ScanLine}
              label="Verificar QR"
              tooltip="Verificar QR"
            />
            <NavItem
              href="/enviar-template"
              icon={FileUp}
              label="Template certificado"
              tooltip="Template certificado"
            />
            <NavItem
              href="/cortesia-admin"
              icon={Ticket}
              label="Cortesias"
              tooltip="Cortesias"
            />
            <NavItem
              href="/cortesia-envio-em-massa"
              icon={Mail}
              label="Envio em massa"
              tooltip="Envio em massa"
            />
            <NavItem
              href="/admin/courtesy-template"
              icon={FileText}
              label="Template e-mail cortesia"
              tooltip="Template e-mail cortesia"
            />
            <NavItem
              href="/admin/participants"
              icon={Users}
              label="Participantes"
              tooltip="Participantes"
            />
            <NavItem
              href="/admin/events"
              icon={CalendarDays}
              label="Eventos"
              tooltip="Eventos"
            />
            <NavItem
              href="/admin/events/new"
              icon={CalendarPlus}
              label="Novo evento"
              tooltip="Novo evento"
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
