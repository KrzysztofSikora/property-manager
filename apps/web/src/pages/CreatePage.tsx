import { addressSchema } from '@property-manager/shared';
import { type SubmitEvent, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateProperty } from '../hooks/useCreateProperty';
import { type AddressField, createErrorMessage, fieldErrors } from '../lib/graphql-errors';

type FieldMessages = Partial<Record<AddressField, string>>;

const FIELDS: { name: AddressField; label: string; inputMode?: 'numeric' }[] = [
  { name: 'street', label: 'Street' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State' },
  { name: 'zipCode', label: 'Zip code', inputMode: 'numeric' },
];

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

// No `maxLength`: the browser would cut pasted text silently (a 6-digit zip would pass), so
// over-long input reaches the shared schema and gets its message.
export function CreatePage() {
  const navigate = useNavigate();
  const createProperty = useCreateProperty();
  const idPrefix = useId();
  const [fieldMessages, setFieldMessages] = useState<FieldMessages>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);

  // `onSubmit`, not `<form action>`: React resets uncontrolled inputs after an action, and the
  // entered values must stay on an error (FR-13 AC3).
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFieldMessages({});
    setFormMessage(null);

    const parsed = addressSchema.safeParse({
      street: formText(data, 'street'),
      city: formText(data, 'city'),
      state: formText(data, 'state'),
      zipCode: formText(data, 'zipCode'),
    });
    if (!parsed.success) {
      const { fieldErrors: issues } = z.flattenError(parsed.error);
      setFieldMessages({
        street: issues.street?.[0],
        city: issues.city?.[0],
        state: issues.state?.[0],
        zipCode: issues.zipCode?.[0],
      });
      return;
    }

    // The normalized address is sent: it is the value that was validated.
    createProperty.mutate(parsed.data, {
      onSuccess: (id) => {
        void navigate(`/properties/${id}`);
      },
      onError: (error) => {
        const fromServer = fieldErrors(error);
        if (Object.keys(fromServer).length > 0) setFieldMessages(fromServer);
        else setFormMessage(createErrorMessage(error));
      },
    });
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">New property</h1>

      <form noValidate onSubmit={submit} className="flex max-w-md flex-col gap-3">
        {FIELDS.map(({ name, label, inputMode }) => {
          const message = fieldMessages[name];
          const messageId = `${idPrefix}-${name}-message`;
          return (
            <div key={name} className="flex flex-col text-sm">
              <label htmlFor={`${idPrefix}-${name}`}>{label}</label>
              <input
                id={`${idPrefix}-${name}`}
                name={name}
                inputMode={inputMode}
                aria-invalid={message === undefined ? undefined : true}
                aria-describedby={message === undefined ? undefined : messageId}
                className="rounded border px-2 py-1 aria-invalid:border-red-700"
              />
              {message !== undefined && (
                <p id={messageId} className="text-red-700">
                  {message}
                </p>
              )}
            </div>
          );
        })}

        {formMessage !== null && (
          <p role="alert" className="text-red-700">
            {formMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={createProperty.isPending}
          className="self-start rounded bg-gray-800 px-3 py-1 text-white disabled:opacity-60"
        >
          {createProperty.isPending ? 'Creating…' : 'Create property'}
        </button>
      </form>
    </>
  );
}
