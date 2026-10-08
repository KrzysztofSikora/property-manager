import { addressSchema } from '@property-manager/shared';
import { type SubmitEvent, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useCreateProperty } from '../hooks/useCreateProperty';
import { type AddressField, createErrorMessage, fieldErrors } from '../lib/graphql-errors';
import { CARD, CONTROL as BASE_CONTROL, FIELD_LABEL } from '../lib/ui';

type FieldMessages = Partial<Record<AddressField, string>>;

const CONTROL = `${BASE_CONTROL} aria-invalid:border-danger`;

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
  const formRef = useRef<HTMLFormElement>(null);

  // Focus goes to the first invalid input after its message renders, so a screen reader reads
  // the message through `aria-describedby`. Every failed validation sets a new object, so a
  // repeated failure moves focus again.
  useEffect(() => {
    const first = FIELDS.find(({ name }) => fieldMessages[name] !== undefined);
    if (first === undefined) return;
    const input = formRef.current?.elements.namedItem(first.name);
    if (input instanceof HTMLInputElement) input.focus();
  }, [fieldMessages]);

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
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-[26px] font-bold tracking-tight">New property</h1>
        <p className="mt-0.5 text-muted">
          The current weather for the address is stored when the property is created.
        </p>
      </div>

      <section className={`${CARD} mx-auto w-full max-w-md p-5 sm:p-6`}>
        <form ref={formRef} noValidate onSubmit={submit} className="grid gap-4">
          {FIELDS.map(({ name, label, inputMode }) => {
            const message = fieldMessages[name];
            const messageId = `${idPrefix}-${name}-message`;
            return (
              <div key={name} className="grid min-w-0 gap-1">
                <label htmlFor={`${idPrefix}-${name}`} className={FIELD_LABEL}>
                  {label}
                </label>
                <input
                  id={`${idPrefix}-${name}`}
                  name={name}
                  inputMode={inputMode}
                  aria-invalid={message === undefined ? undefined : true}
                  aria-describedby={message === undefined ? undefined : messageId}
                  className={name === 'zipCode' ? `${CONTROL} font-mono` : CONTROL}
                />
                {message !== undefined && (
                  <p id={messageId} className="text-sm text-danger">
                    {message}
                  </p>
                )}
              </div>
            );
          })}

          {formMessage !== null && (
            <p role="alert" className="rounded-control bg-danger-soft px-4 py-3 text-danger">
              {formMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={createProperty.isPending}
            className="justify-self-start rounded-control bg-accent px-3.5 py-2 font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {createProperty.isPending ? 'Creating…' : 'Create property'}
          </button>
        </form>
      </section>
    </>
  );
}
