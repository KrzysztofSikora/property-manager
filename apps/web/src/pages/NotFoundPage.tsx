import { Link } from 'react-router';
import { CARD, GHOST_BUTTON } from '../lib/ui';

export function NotFoundPage() {
  return (
    <section className={`${CARD} grid justify-items-start gap-3 p-6`}>
      <h1 className="text-[26px] font-bold tracking-tight">Page not found</h1>
      <Link to="/" className={GHOST_BUTTON}>
        Back to properties
      </Link>
    </section>
  );
}
