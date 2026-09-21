import { render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { EQueryProvider } from './query';

function IdentityProbe({ name }: { name: string }) {
  const identity = useQuery({
    queryKey: ['identity-sensitive'],
    queryFn: async () => name,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return <span>{identity.data ?? 'loading'}</span>;
}

describe('EQueryProvider identity boundary', () => {
  it('does not reuse cached doctor data after the authenticated tree remounts', async () => {
    const first = render(
      <EQueryProvider>
        <IdentityProbe name="林知远" />
      </EQueryProvider>,
    );
    expect(await screen.findByText('林知远')).toBeInTheDocument();
    first.unmount();

    render(
      <EQueryProvider>
        <IdentityProbe name="许清" />
      </EQueryProvider>,
    );
    expect(await screen.findByText('许清')).toBeInTheDocument();
    expect(screen.queryByText('林知远')).not.toBeInTheDocument();
  });
});
