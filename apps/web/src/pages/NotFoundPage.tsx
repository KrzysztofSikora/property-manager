import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="grid justify-items-start gap-3 rounded-card border border-line bg-surface p-6">
      <h1 className="text-[26px] font-bold tracking-tight">Page not found</h1>
      <Link
        to="/"
        className="inline-flex items-center rounded-control border border-line bg-surface px-3.5 py-2 font-semibold hover:bg-ground"
      >
        Back to properties
      </Link>
    </section>
  );
}
