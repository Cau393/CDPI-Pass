import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import HomePage from "@/pages/HomePage";

// ---- Mocks ----

// Mock React Query
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

// Mock API client
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock useToast
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}));

// Mock router
vi.mock('wouter', () => ({
  useLocation: vi.fn(),
}));

// ---- Imports AFTER mocks ----
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

describe('<HomePage />', () => {
  const mockSetLocation = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useLocation as vi.Mock).mockReturnValue(['/', mockSetLocation]);
    (useToast as vi.Mock).mockReturnValue({ toast: mockToast });
  });

  it('renders main event and handles unauthenticated buy click', async () => {
    const fakeEvent = {
      id: 1,
      title: 'Workshop 360°',
      description: 'Evento incrível',
      date: new Date(Date.now() + 86400000).toISOString(),
      location: 'Goiânia',
      price: '100.00',
      imageUrl: null,
    };

    (useAuth as vi.Mock).mockReturnValue({ isAuthenticated: false });

    (useQuery as vi.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'events') {
        return {
          data: { results: [fakeEvent] },
          isLoading: false,
          isError: false,
        };
      }
      return { data: null, isLoading: false };
    });

    render(<HomePage />);

    // Wait for the main event to appear
    const title = await screen.findByText('Workshop 360°');
    expect(title).toBeInTheDocument();

    // Button should be visible
    const buyButton = screen.getByTestId('button-buy-main');
    expect(buyButton).toBeInTheDocument();

    // Click it
    fireEvent.click(buyButton);

    // Should show toast about login
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Login necessário',
        })
      );
    });

    // Should navigate to login
    expect(mockSetLocation).toHaveBeenCalledWith('/login');
  });

  it('shows "Nenhum evento principal disponível" when no events', () => {
    (useAuth as vi.Mock).mockReturnValue({ isAuthenticated: true });
    (useQuery as vi.Mock).mockReturnValue({
      data: { results: [] },
      isLoading: false,
      isError: false,
    });

    render(<HomePage />);

    expect(screen.getByText('Nenhum evento principal disponível')).toBeInTheDocument();
  });
});
