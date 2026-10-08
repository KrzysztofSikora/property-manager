import { useEffect, useId, useRef } from 'react';
import { useDeleteProperty } from '../hooks/useDeleteProperty';
import { errorCode } from '../lib/graphql-errors';

export type DeletableProperty = {
  id: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
};

type Props = {
  property: DeletableProperty;
  // Runs on every close (Cancel, Esc, after a delete). The caller unmounts the dialog.
  onClose: () => void;
  onDeleted?: () => void;
  // When set, `PROPERTY_NOT_FOUND` calls it instead of showing "no longer exists".
  onNotFound?: () => void;
};

function failureMessage(error: unknown): string {
  return errorCode(error) === 'PROPERTY_NOT_FOUND'
    ? 'This property no longer exists'
    : 'Could not delete the property, try again';
}

// Mounted = open: the dialog opens as a modal on mount, and any close hands back to `onClose`.
export function DeletePropertyDialog({ property, onClose, onDeleted, onNotFound }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const deleteProperty = useDeleteProperty();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // A gone property handed to `onNotFound` gets no message: the caller leaves the page.
  const handedOff =
    onNotFound !== undefined && errorCode(deleteProperty.error) === 'PROPERTY_NOT_FOUND';

  function confirm() {
    deleteProperty.mutate(property.id, {
      onSuccess: () => {
        onDeleted?.();
        dialogRef.current?.close();
      },
      onError: (error) => {
        if (onNotFound && errorCode(error) === 'PROPERTY_NOT_FOUND') onNotFound();
      },
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onClose={onClose}
      className="m-auto rounded p-6 shadow-lg backdrop:bg-black/40"
    >
      <h2 id={headingId} className="mb-2 text-lg font-bold">
        Delete property?
      </h2>
      <p className="mb-4">
        {property.street}, {property.city}, {property.state} {property.zipCode}
      </p>
      {deleteProperty.isError && !handedOff && (
        <p role="alert" className="mb-4 text-red-700">
          {failureMessage(deleteProperty.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="rounded border px-3 py-1"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={deleteProperty.isPending}
          className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </dialog>
  );
}
