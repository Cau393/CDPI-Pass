import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, Calendar, MapPin, CreditCard, Ticket, User as UserIcon, Shield, AlertTriangle, RefreshCw, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import type { User, Order, CourtesyLink } from "@shared/schema";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";


export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user: currentUser, isAuthenticated } = useAuth();
  const [showFirstConfirmation, setShowFirstConfirmation] = useState(false);
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [hasChangedSensitiveFields, setHasChangedSensitiveFields] = useState(false);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  // Cooldown timer effect
  useEffect(() => {
    if (cooldownTime > 0) {
      const timer = setTimeout(() => {
        setCooldownTime((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownTime]);

  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
  queryKey: ["/api/orders", currentPage],
  queryFn: async () => {
    const response = await apiRequest("GET", `/api/orders?page=${currentPage}`);
    return response.json();
  },
  enabled: isAuthenticated,
  staleTime: 0,
  gcTime: 0,
});

  const orders = ordersData?.orders;
  const totalPages = ordersData?.totalPages;

  // Update form when user data changes
  const profileForm = useForm({
    defaultValues: currentUser || {},
  });

  useEffect(() => {
    if (currentUser) {
      profileForm.reset(currentUser);
    }
  }, [currentUser]);

  const passwordForm = useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      // Add password if sensitive fields were changed
      const payload = hasChangedSensitiveFields 
        ? { ...data, currentPassword: profilePassword }
        : data;
      const response = await apiRequest("PUT", "/api/users/profile", payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram salvas com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/auth/me"] });
      setProfilePassword("");
      setHasChangedSensitiveFields(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar perfil",
        description: error.message,
        variant: "destructive",
      });
      setProfilePassword("");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("PUT", "/api/users/profile/password", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Senha alterada",
        description: "Sua senha foi alterada com sucesso.",
      });
      passwordForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao alterar senha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users/auth/resend-code");
    },
    onSuccess: () => {
      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para confirmar seu email.",
      });
      setCooldownTime(30); // Set 30 seconds cooldown
      queryClient.invalidateQueries({ queryKey: ["/api/users/auth/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await apiRequest("DELETE", "/api/users/profile", { password });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Conta excluída",
        description: "Sua conta foi permanentemente excluída.",
      });
      // Clear auth data and redirect to home
      localStorage.removeItem("token");
      queryClient.clear();
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir conta",
        description: error.message,
        variant: "destructive",
      });
      setDeletePassword("");
    },
  });

  const onUpdateProfile = (data: any) => {
    // Check if trying to change sensitive fields without password
    if (hasChangedSensitiveFields && !profilePassword) {
      toast({
        title: "Senha necessária",
        description: "Digite sua senha para confirmar alterações em informações sensíveis.",
        variant: "destructive",
      });
      return;
    }
    updateProfileMutation.mutate(data);
  };

  // Monitor form changes for sensitive fields
  const checkSensitiveFieldChanges = () => {
    const formValues = profileForm.getValues();
    const sensitiveFields = ['name', 'email', 'phone'] as const;
    
    const hasChanges = sensitiveFields.some(field => {
      const currentValue = formValues[field];
      const originalValue = currentUser?.[field as keyof User];
      return currentValue !== undefined && currentValue !== originalValue;
    });
    
    setHasChangedSensitiveFields(hasChanges);
  };

  const onChangePassword = (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (data.newPassword !== data.confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  };

  const handleDeleteAccount = () => {
    if (!deletePassword) {
      toast({
        title: "Erro",
        description: "Digite sua senha para confirmar a exclusão.",
        variant: "destructive",
      });
      return;
    }
    deleteAccountMutation.mutate(deletePassword);
    setShowFinalConfirmation(false);
    setShowFirstConfirmation(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500 text-white">Confirmado</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500 text-white">Aguardando Pagamento</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: string | number) => {
    const value = typeof amount === "string" ? parseFloat(amount) : amount;
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getUserInitials = (name: string) => {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  if (!isAuthenticated || !currentUser) {
    return null;
  }

  const cancelOrderMutation = useMutation({
  mutationFn: (orderId: string) => {
    return apiRequest("DELETE", `/api/orders/${orderId}/cancel`);
  },
  onSuccess: () => {
    toast({
      title: "Pedido cancelado",
      description: "Seu pedido foi cancelado com sucesso.",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
  },
  onError: (error: Error) => {
    toast({
      title: "Erro ao cancelar",
      description: error.message,
      variant: "destructive",
    });
  },
});

const handleCancelOrder = (orderId: string) => {
  // Here you would open an AlertDialog for confirmation
  // On confirmation, call:
  cancelOrderMutation.mutate(orderId);
};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Profile Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6 text-center">
              <Avatar className="w-20 h-20 mx-auto mb-4">
                <AvatarFallback className="bg-primary text-white text-2xl font-bold">
                  {getUserInitials(currentUser.name)}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-xl font-semibold text-gray-900 mb-1" data-testid="text-user-name">
                {currentUser.name}
              </h3>
              <p className="text-gray-600 mb-4" data-testid="text-user-email">
                {currentUser.email}
              </p>
              {!currentUser.emailVerified && (
                <div className="space-y-3">
                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                    Email não verificado
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resendVerificationMutation.mutate()}
                    disabled={cooldownTime > 0 || resendVerificationMutation.isPending}
                    className="w-full"
                    data-testid="button-resend-verification"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {cooldownTime > 0 
                      ? `Aguarde ${cooldownTime}s` 
                      : resendVerificationMutation.isPending 
                        ? "Enviando..." 
                        : "Reenviar Email"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Profile Content */}
        <div className="lg:col-span-3">
          <Tabs defaultValue="orders" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="orders" className="flex items-center gap-2" data-testid="tab-orders">
                <Ticket className="h-4 w-4" />
                Meus Ingressos
              </TabsTrigger>
              <TabsTrigger value="profile" className="flex items-center gap-2" data-testid="tab-profile">
                <UserIcon className="h-4 w-4" />
                Informações Pessoais
              </TabsTrigger>
              <TabsTrigger value="security" className="flex items-center gap-2" data-testid="tab-security">
                <Shield className="h-4 w-4" />
                Segurança
              </TabsTrigger>
            </TabsList>

            {/* Orders Tab */}
            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de Ingressos</CardTitle>
                </CardHeader>
                <CardContent>
                  {ordersLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse border border-gray-200 rounded-lg p-4">
                          <div className="h-4 bg-gray-300 rounded mb-2"></div>
                          <div className="h-3 bg-gray-300 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                        </div>
                      ))}
                    </div>
                  ) : orders?.length === 0 ? (
                    <div className="text-center py-8">
                      <Ticket className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600" data-testid="text-no-orders">
                        Você ainda não possui ingressos.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        {orders?.map((order: any) => (
                          <div
                            key={order.id}
                            className="border border-gray-200 rounded-lg p-4 hover:border-primary transition-colors"
                            data-testid={`order-${order.id}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex-1">
                                <h4 className="font-semibold text-gray-900 mb-2" data-testid={`text-event-title-${order.id}`}>
                                  {order.event?.title || "Evento"}
                                </h4>
                                <div className="flex items-center text-sm text-gray-600 mb-2">
                                  <Calendar className="h-4 w-4 mr-2" />
                                  <span data-testid={`text-event-date-${order.id}`}>
                                    {order.event?.date ? formatDate(order.event.date) : "Data não disponível"}
                                  </span>
                                  <MapPin className="h-4 w-4 ml-4 mr-2" />
                                  <span data-testid={`text-event-location-${order.id}`}>
                                    {order.event?.location || "Local não disponível"}
                                  </span>
                                </div>
                                <div className="flex items-center mb-2">
                                  <span className="text-sm text-gray-500 mr-2">Status:</span>
                                  {getStatusBadge(order.status)}
                                </div>
                              </div>
                              <div className="flex items-center space-x-4 mt-4 sm:mt-0">
                                <div className="text-right">
                                  <div className="text-lg font-semibold text-primary" data-testid={`text-order-price-${order.id}`}>
                                    {formatCurrency(order.amount)}
                                  </div>
                                  <div className="text-xs text-gray-500" data-testid={`text-order-date-${order.id}`}>
                                    Comprado em {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                                  </div>
                                </div>
                                {order.status === "paid" && order.qrCodeData ? (
                                  <div className="flex gap-2">
                                    <Button
                                      className="bg-primary hover:bg-secondary"
                                      size="sm"
                                      onClick={() => {
                                        // Create download link for QR code
                                        const link = document.createElement('a');
                                        link.href = order.qrCodeData;
                                        link.download = `ingresso-${order.id}.png`;
                                        link.click();
                                      }}
                                      data-testid={`button-download-${order.id}`}
                                    >
                                      <Download className="h-4 w-4 mr-2" />
                                      Baixar QR Code
                                    </Button>
                                    {order.qrCodeUsed && currentUser?.isAdmin && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                          try {
                                            await apiRequest("POST", `/api/reset-ticket/${order.id}`);
                                            toast({
                                              title: "Ticket resetado",
                                              description: "Ingresso pode ser verificado novamente",
                                            });
                                            refetchOrders();
                                          } catch (error) {
                                            toast({
                                              title: "Erro",
                                              description: "Erro ao resetar ticket",
                                              variant: "destructive",
                                            });
                                          }
                                        }}
                                        data-testid={`button-reset-${order.id}`}
                                      >
                                        Resetar Ingresso
                                      </Button>
                                    )}
                                  </div>
                                ) : order.status === "pending" && order.asaasPaymentId ? (
                                  <div className="flex gap-2">
                                    {order.status === 'pending' && (
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleCancelOrder(order.id)} // You will create this handler
                                        disabled={cancelOrderMutation.isPending}
                                      >
                                        Cancelar Pedido
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          const response = await apiRequest("POST", `/api/orders/${order.id}/check-status`);
                                          const data = await response.json();
                                          toast({
                                            title: "Status verificado",
                                            description: data.message,
                                          });
                                          refetchOrders();
                                        } catch (error) {
                                          toast({
                                            title: "Erro",
                                            description: "Erro ao verificar status do pagamento",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                      data-testid={`button-check-status-${order.id}`}
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <Pagination className="mt-6">
                          <PaginationContent>
                            <PaginationItem>
                              <Button
                                variant="outline"
                                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                              >
                                <ChevronLeft className="h-4 w-4 mr-2" />
                                Anterior
                              </Button>
                            </PaginationItem>
                            <PaginationItem>
                              <span className="text-sm font-medium px-4">
                                Page {currentPage} of {totalPages}
                              </span>
                            </PaginationItem>
                            <PaginationItem>
                              <Button
                                variant="outline"
                                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                              >
                                Próxima
                                <ChevronRight className="h-4 w-4 ml-2" />
                              </Button>
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Profile Tab */}
            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>Informações Pessoais</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={profileForm.handleSubmit(onUpdateProfile)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                          Nome Completo
                        </Label>
                        <Input
                          id="name"
                          {...profileForm.register("name")}
                          onChange={(e) => {
                            profileForm.register("name").onChange(e);
                            checkSensitiveFieldChanges();
                          }}
                          data-testid="input-profile-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-2">
                          CPF
                        </Label>
                        <Input
                          id="cpf"
                          {...profileForm.register("cpf")}
                          readOnly
                          className="bg-gray-50"
                          data-testid="input-profile-cpf"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                          E-mail
                        </Label>
                        <Input
                          id="email"
                          {...profileForm.register("email")}
                          onChange={(e) => {
                            profileForm.register("email").onChange(e);
                            checkSensitiveFieldChanges();
                          }}
                          data-testid="input-profile-email"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                          Telefone
                        </Label>
                        <Input
                          id="phone"
                          {...profileForm.register("phone")}
                          onChange={(e) => {
                            profileForm.register("phone").onChange(e);
                            checkSensitiveFieldChanges();
                          }}
                          data-testid="input-profile-phone"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                        Endereço Completo
                      </Label>
                      <Textarea
                        id="address"
                        {...profileForm.register("address")}
                        rows={3}
                        data-testid="input-profile-address"
                      />
                    </div>
                    
                    {hasChangedSensitiveFields && (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800 mb-3">
                          Você está alterando informações sensíveis. Digite sua senha para confirmar:
                        </p>
                        <Label htmlFor="profile-password" className="block text-sm font-medium text-gray-700 mb-2">
                          Senha Atual
                        </Label>
                        <Input
                          id="profile-password"
                          type="password"
                          value={profilePassword}
                          onChange={(e) => setProfilePassword(e.target.value)}
                          placeholder="Digite sua senha para confirmar"
                          data-testid="input-profile-password"
                        />
                      </div>
                    )}
                    
                    <Button
                      type="submit"
                      className="bg-primary hover:bg-secondary"
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-update-profile"
                    >
                      {updateProfileMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security">
              <Card>
                <CardHeader>
                  <CardTitle>Segurança da Conta</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-6">
                    <div>
                      <Label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
                        Senha Atual
                      </Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        {...passwordForm.register("currentPassword", { required: true })}
                        data-testid="input-current-password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                        Nova Senha
                      </Label>
                      <Input
                        id="newPassword"
                        type="password"
                        {...passwordForm.register("newPassword", { required: true, minLength: 6 })}
                        data-testid="input-new-password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                        Confirmar Nova Senha
                      </Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        {...passwordForm.register("confirmPassword", { required: true })}
                        data-testid="input-confirm-password"
                      />
                    </div>
                    
                    <Button
                      type="submit"
                      className="bg-primary hover:bg-secondary"
                      disabled={changePasswordMutation.isPending}
                      data-testid="button-change-password"
                    >
                      {changePasswordMutation.isPending ? "Alterando..." : "Alterar Senha"}
                    </Button>
                  </form>

                  <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h3 className="text-lg font-medium text-red-800 mb-2">Excluir Conta</h3>
                    <p className="text-sm text-red-600 mb-4">
                      Esta ação não pode ser desfeita. Todos os seus dados serão permanentemente removidos.
                    </p>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => setShowFirstConfirmation(true)}
                      data-testid="button-delete-account"
                    >
                      Excluir Conta
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* First Confirmation Dialog */}
      <AlertDialog open={showFirstConfirmation} onOpenChange={setShowFirstConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Tem certeza que deseja excluir sua conta?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação é <strong>irreversível</strong> e resultará em:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Exclusão permanente de todos os seus dados pessoais</li>
                <li>Cancelamento de todos os ingressos não utilizados</li>
                <li>Perda de acesso ao histórico de eventos</li>
                <li>Impossibilidade de recuperar a conta no futuro</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                setShowFirstConfirmation(false);
                setShowFinalConfirmation(true);
              }}
            >
              Continuar com a exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Final Confirmation Dialog with Password */}
      <AlertDialog open={showFinalConfirmation} onOpenChange={setShowFinalConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">
              Confirmação Final - Exclusão de Conta
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm font-medium text-red-800">
                  ⚠️ ÚLTIMA CHANCE: Após confirmar, sua conta será excluída IMEDIATAMENTE e não poderá ser recuperada.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delete-password">
                  Digite sua senha para confirmar a exclusão:
                </Label>
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Sua senha atual"
                  data-testid="input-delete-password"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeletePassword("");
                setShowFinalConfirmation(false);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={!deletePassword || deleteAccountMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteAccountMutation.isPending ? "Excluindo..." : "Excluir minha conta permanentemente"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
