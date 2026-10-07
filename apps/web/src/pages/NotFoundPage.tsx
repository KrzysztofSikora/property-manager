import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/">Back to properties</Link>
    </>
  );
}
