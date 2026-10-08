import { Link, Outlet } from 'react-router';

export function Layout() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between border-b pb-4">
        <nav className="flex gap-4">
          <Link to="/" className="font-semibold">
            Properties
          </Link>
          <Link to="/properties/new">New property</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
