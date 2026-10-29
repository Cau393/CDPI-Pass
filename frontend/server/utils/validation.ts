export { validateCpf } from "@shared/cpf";

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function formatCpf(cpf: string): string {
  // Remove formatting and add it back
  cpf = cpf.replace(/[^\d]/g, '');
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatPhone(phone: string): string {
  // Remove formatting
  phone = phone.replace(/[^\d]/g, '');
  
  // Add formatting based on length
  if (phone.length === 11) {
    return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (phone.length === 10) {
    return phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  
  return phone;
}

export function validatePhone(phone: string): boolean {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  return cleanPhone.length === 10 || cleanPhone.length === 11;
}
