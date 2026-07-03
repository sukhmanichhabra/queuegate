import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import EventDetailPage from './page';
import { resetMocks, mockApi } from '../../../test/test-utils';
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

describe('EventDetailPage', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders countdown timer using show_date', async () => {
    const futureDate = new Date(Date.now() + 86400000 + 3600000 + 60000).toISOString(); // 1 day, 1 hour, 1 min
    mockApi.get.mockResolvedValue({
      data: {
        title: 'Test Event',
        status: 'UPCOMING',
        show_date: futureDate,
        capacity: 100,
        admitted_count: 0
      }
    });

    renderWithProvider(<EventDetailPage params={{ id: '1' }} />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText(/LOADING EVENT DATA/i)).not.toBeInTheDocument();
    });

    // We should see DAYS, HRS, MIN, SEC
    expect(screen.getByText('DAYS')).toBeInTheDocument();
    expect(screen.getByText('HRS')).toBeInTheDocument();
    
    // Check if the actual calculated values are reasonably rendered.
    // 1 day should show '01'
    const elements = screen.getAllByText('01', { selector: 'span' });
    expect(elements.length).toBeGreaterThan(0);
  });

  it('renders "JOIN QUEUE" button when status is ON_SALE', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        title: 'Test Event',
        status: 'ON_SALE',
        show_date: new Date(Date.now() + 86400000).toISOString(),
      }
    });

    renderWithProvider(<EventDetailPage params={{ id: '1' }} />);
    
    await waitFor(() => {
      expect(screen.queryByText(/LOADING EVENT DATA/i)).not.toBeInTheDocument();
    });

    const joinBtn = await screen.findByRole('button', { name: /join queue/i });
    expect(joinBtn).toBeInTheDocument();
    expect(joinBtn).not.toBeDisabled();
  });

  it('renders "SOLD OUT" state (no join button) when status is SOLD_OUT', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        title: 'Test Event',
        status: 'SOLD_OUT',
        show_date: new Date(Date.now() + 86400000).toISOString(),
      }
    });

    renderWithProvider(<EventDetailPage params={{ id: '1' }} />);
    
    await waitFor(() => {
      expect(screen.queryByText(/LOADING EVENT DATA/i)).not.toBeInTheDocument();
    });

    const soldOutBtn = await screen.findByRole('button', { name: /sold out/i });
    expect(soldOutBtn).toBeInTheDocument();
    expect(soldOutBtn).toBeDisabled();
  });

  it.each([
    ['ON_SALE', 'LIVE ON SALE'],
    ['UPCOMING', 'UPCOMING'],
    ['SOLD_OUT', 'SOLD OUT'],
    ['ENDED', 'ENDED'],
    ['DRAFT', 'ENDED'], // By default fallback
  ])('renders the correct status badge for %s', async (status, expectedBadge) => {
    mockApi.get.mockResolvedValue({
      data: {
        title: 'Test Event',
        status,
        show_date: new Date().toISOString(),
      }
    });

    renderWithProvider(<EventDetailPage params={{ id: '1' }} />);
    
    await waitFor(() => {
      expect(screen.queryByText(/LOADING EVENT DATA/i)).not.toBeInTheDocument();
    });

    // There might be a button with same text, but the badge uses GlassBadge with the text.
    // The test just checks that the text exists. We can look for it generally.
    const elements = screen.getAllByText(expectedBadge, { exact: false });
    expect(elements.length).toBeGreaterThan(0);
  });
});
