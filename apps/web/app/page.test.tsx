import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import LandingPage from './page';
import { resetMocks, mockApi } from '../test/test-utils';
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

describe('LandingPage', () => {
  beforeEach(() => {
    resetMocks();
    mockApi.get.mockResolvedValue({
      data: [
        { id: '1', title: 'Test Event 1', status: 'ON_SALE', queueDepth: 1500 }
      ]
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders hero section', async () => {
    renderWithProvider(<LandingPage />);
    
    expect(await screen.findByText('QUEUEGATE')).toBeInTheDocument();
    expect(screen.getByText(/High-Octane Queue Systems/i)).toBeInTheDocument();
  });

  it('renders catalog link (Enter Lobby)', async () => {
    renderWithProvider(<LandingPage />);
    
    expect(await screen.findByRole('button', { name: /Enter Lobby/i })).toBeInTheDocument();
  });
  
  it('renders total queue depth of ON_SALE events', async () => {
    renderWithProvider(<LandingPage />);
    
    expect(await screen.findByText(/1,500 FANS IN QUEUE/i)).toBeInTheDocument();
  });
});
