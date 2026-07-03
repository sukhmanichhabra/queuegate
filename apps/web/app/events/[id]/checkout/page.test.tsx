import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from './page';
import { mockQueueStore, resetMocks, mockApi, mockUseRouter } from '../../../../test/test-utils';
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

describe('CheckoutPage', () => {
  beforeEach(() => {
    resetMocks();
    
    // Clear localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
    
    mockApi.get.mockResolvedValue({ data: { title: 'Test Event Title' } });
  });

  it('redirects to event page if no checkoutToken in localStorage', async () => {
    mockQueueStore.checkoutToken = null;
    window.localStorage.getItem = jest.fn().mockReturnValue(null);

    renderWithProvider(<CheckoutPage params={{ id: 'test-event-123' }} />);
    
    await waitFor(() => {
      expect(mockUseRouter().replace).toHaveBeenCalledWith('/events/test-event-123');
    });
  });

  it('renders the event name and Complete Purchase button when a valid token exists', async () => {
    mockQueueStore.checkoutToken = 'valid-token';
    mockQueueStore.entryId = 'entry-123';
    // set future expiresAt
    mockQueueStore.expiresAt = new Date(Date.now() + 600000).toISOString();

    renderWithProvider(<CheckoutPage params={{ id: 'test-event-123' }} />);
    
    expect(await screen.findByText('Test Event Title')).toBeInTheDocument();
    expect(screen.getByText('Complete Purchase')).toBeInTheDocument();
  });

  it('does NOT render any seat selection UI (regression check)', async () => {
    mockQueueStore.checkoutToken = 'valid-token';
    mockQueueStore.entryId = 'entry-123';
    mockQueueStore.expiresAt = new Date(Date.now() + 600000).toISOString();

    renderWithProvider(<CheckoutPage params={{ id: 'test-event-123' }} />);
    
    await screen.findByText('Test Event Title');
    expect(screen.queryByText(/seat selection/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/choose your seat/i)).not.toBeInTheDocument();
  });

  it('calls POST /mock-checkout/complete/:entryId with the correct checkoutToken on button click', async () => {
    mockQueueStore.checkoutToken = 'valid-token';
    mockQueueStore.entryId = 'entry-123';
    mockQueueStore.expiresAt = new Date(Date.now() + 600000).toISOString();
    
    mockApi.post.mockResolvedValue({ data: { success: true } });

    renderWithProvider(<CheckoutPage params={{ id: 'test-event-123' }} />);
    
    const btn = await screen.findByText('Complete Purchase');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/mock-checkout/complete/entry-123', {
        eventId: 'test-event-123',
        checkoutToken: 'valid-token',
      });
    });
  });

  it('shows receipt/success state after a successful checkout response', async () => {
    mockQueueStore.checkoutToken = 'valid-token';
    mockQueueStore.entryId = 'entry-123';
    mockQueueStore.expiresAt = new Date(Date.now() + 600000).toISOString();
    
    mockApi.post.mockResolvedValue({ data: { success: true } });

    renderWithProvider(<CheckoutPage params={{ id: 'test-event-123' }} />);
    
    const btn = await screen.findByText('Complete Purchase');
    fireEvent.click(btn);

    expect(await screen.findByText('TICKETS SECURED!')).toBeInTheDocument();
  });

  it('shows error state after a failed checkout response (403 or 500)', async () => {
    mockQueueStore.checkoutToken = 'valid-token';
    mockQueueStore.entryId = 'entry-123';
    mockQueueStore.expiresAt = new Date(Date.now() + 600000).toISOString();
    
    mockApi.post.mockRejectedValue({
      response: {
        status: 403,
        data: { message: 'token invalid' }
      }
    });

    renderWithProvider(<CheckoutPage params={{ id: 'test-event-123' }} />);
    
    const btn = await screen.findByText('Complete Purchase');
    fireEvent.click(btn);

    expect(await screen.findByText('TOKEN INVALID')).toBeInTheDocument();
  });
});
