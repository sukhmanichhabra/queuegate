import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AdminDashboardPage from './page';
import { resetMocks, mockApi, mockUseRoleGuard } from '../../../test/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderWithProvider = (ui: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    resetMocks();
    mockApi.get.mockImplementation((url) => {
      if (url === '/admin/events') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/admin/kafka-health') {
        return Promise.resolve({ data: { connected: true } });
      }
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders dashboard components when authorized', async () => {
    mockUseRoleGuard.mockReturnValue({ isAuthorized: true });
    
    renderWithProvider(<AdminDashboardPage />);
    
    expect(await screen.findByText('SYSTEM OVERVIEW')).toBeInTheDocument();
    expect(screen.getByText('OPS ADMIN LIVE MONITOR')).toBeInTheDocument();
  });

  it('renders verifying access state if not authorized', () => {
    mockUseRoleGuard.mockReturnValue({ isAuthorized: false });
    
    renderWithProvider(<AdminDashboardPage />);
    
    expect(screen.getByText(/Verifying OPS_ADMIN clearance/i)).toBeInTheDocument();
    expect(screen.queryByText('SYSTEM OVERVIEW')).not.toBeInTheDocument();
  });
});
