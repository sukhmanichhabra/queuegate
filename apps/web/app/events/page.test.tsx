import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventsCatalogPage from './page';
import { resetMocks, mockApi, mockUseRouter } from '../../test/test-utils';
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

describe('EventsCatalogPage', () => {
  beforeEach(() => {
    resetMocks();
    mockApi.get.mockResolvedValue({
      data: [
        { id: '1', title: 'Live Event 1', status: 'ON_SALE', capacity: 100, admitted_count: 50 },
        { id: '2', title: 'Future Event', status: 'UPCOMING', capacity: 200, admitted_count: 0 },
        { id: '3', title: 'Past Event', status: 'ENDED', capacity: 50, admitted_count: 50 },
      ]
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders the grid of events from API', async () => {
    renderWithProvider(<EventsCatalogPage />);
    
    // Wait for the skeleton/loading to finish
    await waitFor(() => {
      expect(screen.queryByText(/NO EVENTS FOUND/i)).not.toBeInTheDocument();
    });

    // Check all events are rendered
    expect(await screen.findByText('Live Event 1')).toBeInTheDocument();
    expect(screen.getByText('Future Event')).toBeInTheDocument();
    expect(screen.getByText('Past Event')).toBeInTheDocument();
  });

  it('allows filtering by status', async () => {
    renderWithProvider(<EventsCatalogPage />);
    
    // Wait for the initial load
    expect(await screen.findByText('Live Event 1')).toBeInTheDocument();

    // Click UPCOMING filter
    const upcomingBtn = screen.getByRole('button', { name: /^UPCOMING$/ });
    fireEvent.click(upcomingBtn);

    await waitFor(() => {
      expect(screen.queryByText('Live Event 1')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Future Event')).toBeInTheDocument();
    expect(screen.queryByText('Past Event')).not.toBeInTheDocument();

    // Click ON_SALE (labeled LIVE ON SALE) filter
    const onSaleBtn = screen.getByRole('button', { name: /^LIVE ON SALE$/ });
    fireEvent.click(onSaleBtn);

    await waitFor(() => {
      expect(screen.queryByText('Future Event')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Live Event 1')).toBeInTheDocument();
  });

  it('navigates to event details when clicking an event card', async () => {
    renderWithProvider(<EventsCatalogPage />);
    
    const eventCardTitle = await screen.findByText('Live Event 1');
    fireEvent.click(eventCardTitle);
    
    expect(mockUseRouter().push).toHaveBeenCalledWith('/events/1');
  });
});
