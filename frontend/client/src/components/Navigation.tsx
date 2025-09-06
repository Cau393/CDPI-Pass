import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { Menu, User, LogOut, ScanLine, Search } from "lucide-react";

export default function Navigation() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setLocation("/");
    window.location.reload();
  };

  const getUserInitials = (name: string) => {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <nav className="bg-primary shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <button
              onClick={() => setLocation("/")}
              className="flex items-center cursor-pointer"
              data-testid="button-logo"
            >
              <img 
            src="/Marca CDPI negativa 32x32px.svg" 
            alt="CDPI Faculdade Logo" 
            className="h-10 w-auto mr-3" 
              />
              <span className="text-xl font-bold text-white">
                {user?.isAdmin && <span className="text-xs ml-2 bg-white/20 text-white px-2 py-1 rounded">ADMIN</span>}
              </span>
            </button>
          </div>
          
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-6">
              <button
                onClick={() => setLocation("/eventos")}
                className="text-white hover:bg-white/10 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                data-testid="nav-events"
              >
                Eventos
              </button>
              <button
                onClick={() => setLocation("/cortesia")}
                className="text-white hover:bg-white/10 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                data-testid="nav-courtesy"
              >
                Resgate de cortesia
              </button>
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => setLocation("/profile")}
                    className="text-white hover:bg-white/10 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    data-testid="nav-profile"
                  >
                    Área de acesso
                  </button>
                  {user?.isAdmin && (
                    <>
                      <button
                        onClick={() => setLocation("/verificar")}
                        className="text-white hover:bg-white/10 px-3 py-2 rounded-md text-sm font-medium flex items-center transition-colors"
                        data-testid="nav-scanner"
                      >
                        <ScanLine className="h-4 w-4 mr-1" />
                        Verificar QR
                      </button>
                      {user.email === "caueroriz@gmail.com" && (
                        <button
                          onClick={() => setLocation("/cortesia-admin")}
                          className="text-white hover:bg-white/10 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                          data-testid="nav-courtesy-admin"
                        >
                          Gerenciar Cortesias
                        </button>
                      )}
                    </>
                  )}
                </>
              ) : (
                <button
                  onClick={() => setLocation("/login")}
                  className="text-white hover:bg-white/10 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  data-testid="nav-login"
                >
                  Área de acesso
                </button>
              )}
              <button
                onClick={() => setLocation("/eventos")}
                className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                data-testid="nav-search"
              >
                <Search className="h-5 w-5" />
              </button>
              
              {/* User Profile Dropdown for Desktop */}
              {isAuthenticated && user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="p-1 ml-2" data-testid="button-user-menu">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-white text-primary text-sm">
                          {getUserInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <div className="px-2 py-1.5 text-sm font-semibold">
                      {user.name}
                      <div className="text-xs font-normal text-gray-500">{user.email}</div>
                    </div>
                    <DropdownMenuItem
                      onClick={() => setLocation("/profile")}
                      data-testid="menu-profile-desktop"
                    >
                      <User className="h-4 w-4 mr-2" />
                      Meu Perfil
                    </DropdownMenuItem>
                    {user?.isAdmin && (
                      <>
                        <DropdownMenuItem
                          onClick={() => setLocation("/verificar")}
                          data-testid="menu-scanner-desktop"
                        >
                          <ScanLine className="h-4 w-4 mr-2" />
                          Verificar QR
                        </DropdownMenuItem>
                        {user.email === "caueroriz@gmail.com" && (
                          <DropdownMenuItem
                            onClick={() => setLocation("/cortesia-admin")}
                            data-testid="menu-courtesy-admin-desktop"
                          >
                            Gerenciar Cortesias
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="text-red-600"
                      data-testid="menu-logout-desktop"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="flex items-center md:hidden">
            {isAuthenticated && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="p-1 mr-2" data-testid="button-user-menu-mobile">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-white text-primary text-sm">
                        {getUserInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => setLocation("/profile")}
                    data-testid="menu-profile"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Meu Perfil
                  </DropdownMenuItem>
                  {user?.isAdmin && (
                    <>
                      <DropdownMenuItem
                        onClick={() => setLocation("/verificar")}
                        data-testid="menu-scanner"
                      >
                        <ScanLine className="h-4 w-4 mr-2" />
                        Verificar QR
                      </DropdownMenuItem>
                      {user.email === "caueroriz@gmail.com" && (
                        <DropdownMenuItem
                          onClick={() => setLocation("/cortesia-admin")}
                          data-testid="menu-courtesy-admin"
                        >
                          Gerenciar Cortesias
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-red-600"
                    data-testid="menu-logout"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-white hover:bg-white/10 p-2 rounded-md transition-colors"
              data-testid="button-mobile-menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-white/10">
              <button
                onClick={() => {
                  setLocation("/eventos");
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:bg-white/10 block px-3 py-2 rounded-md text-base font-medium w-full text-left transition-colors"
              >
                Eventos
              </button>
              <button
                onClick={() => {
                  setLocation("/cortesia");
                  setIsMobileMenuOpen(false);
                }}
                className="text-white hover:bg-white/10 block px-3 py-2 rounded-md text-base font-medium w-full text-left transition-colors"
              >
                Resgate de cortesia
              </button>
              {!isAuthenticated && (
                <button
                  onClick={() => {
                    setLocation("/login");
                    setIsMobileMenuOpen(false);
                  }}
                  className="text-white hover:bg-white/10 block px-3 py-2 rounded-md text-base font-medium w-full text-left transition-colors"
                >
                  Área de acesso
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}