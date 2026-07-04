import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MerchantDashboardPage from './page';
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

describe('MerchantDashboardPage', () => {
  beforeEach(() => {
    resetMocks();
    mockApi.get.mockImplementation((url) => {
      if (url === '/merchants/events') {
        return Promise.resolve({
          data: [
            { id: '1', title: 'Test Event 1', status: 'ON_SALE' }
          ]
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders dashboard components when authorized', async () => {
    mockUseRoleGuard.mockReturnValue({ isAuthorized: true });
    
    renderWithProvider(<MerchantDashboardPage />);
    
    expect(await screen.findByText('MERCHANT DASHBOARD')).toBeInTheDocument();
    expect(await screen.findByText('Test Event 1')).toBeInTheDocument();
  });

  it('renders verifying access state (redirect handled by hook) if not authorized', () => {
    mockUseRoleGuard.mockReturnValue({ isAuthorized: false });
    
    renderWithProvider(<MerchantDashboardPage />);
    
    expect(screen.getByText(/Verifying access/i)).toBeInTheDocument();
    expect(screen.queryByText('MERCHANT DASHBOARD')).not.toBeInTheDocument();
  });
});
