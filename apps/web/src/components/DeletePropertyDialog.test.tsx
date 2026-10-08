import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import { describe, expect, it, vi } from 'vitest';
import type { DeletePropertyMutationVariables } from '../graphql/graphql';
import { listItem } from '../test/fixtures';
import { api, server } from '../test/msw';
import { renderWithProviders } from '../test/render';
import { DeletePropertyDialog } from './DeletePropertyDialog';

const property = listItem({ id: 'id-7', street: '7 Elm St', city: 'Austin', state: 'TX' });

// Serves `DeleteProperty` with `respond` and records the id of every request.
function serveDelete(respond: (id: string) => Response | Promise<Response>) {
  const ids: string[] = [];
  server.use(
    api.mutation<object, DeletePropertyMutationVariables>('DeleteProperty', ({ variables }) => {
      // Codegen types an `ID` input as `string | number`. The app sends strings.
      const id = String(variables.id);
      ids.push(id);
      return respond(id);
    }),
  );
  return ids;
}

function renderDialog() {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  renderWithProviders(
    <DeletePropertyDialog property={property} onClose={onClose} onDeleted={onDeleted} />,
  );
  return { onClose, onDeleted };
}

describe('DeletePropertyDialog', () => {
  it('opens as a modal on mount, named by its heading, with the address', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Delete property?' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveTextContent('7 Elm St, Austin, TX 85268');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Cancel closes the dialog without sending DeleteProperty', async () => {
    const ids = serveDelete((id) => HttpResponse.json({ data: { deleteProperty: id } }));
    const user = userEvent.setup();
    const { onClose, onDeleted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(ids).toEqual([]);
  });

  it('Delete sends the id, is disabled while pending, then reports the delete and closes', async () => {
    const ids = serveDelete(async (id) => {
      await delay(50);
      return HttpResponse.json({ data: { deleteProperty: id } });
    });
    const user = userEvent.setup();
    const { onClose, onDeleted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await expect.poll(() => onClose.mock.calls.length).toBe(1);
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(ids).toEqual(['id-7']);
  });

  it('a failed delete keeps the dialog open, re-enables Delete and does not report a delete', async () => {
    serveDelete(() => HttpResponse.error());
    const user = userEvent.setup();
    const { onClose, onDeleted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete the property, try again',
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
