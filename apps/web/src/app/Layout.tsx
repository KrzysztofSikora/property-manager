import { Link, NavLink, Outlet } from 'react-router';
import { HouseIcon, PlusIcon } from '../components/icons';

export function Layout() {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 px-3.5 py-2.5 sm:flex-nowrap sm:gap-7 sm:px-6 sm:py-3">
          <div className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="grid size-7 place-items-center rounded-[7px] bg-ink text-surface">
              <HouseIcon className="size-4" />
            </span>
            <span className="hidden sm:inline">Property Manager</span>
          </div>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-[7px] px-3 py-1.5 font-medium no-underline ${
                  isActive ? 'bg-ground text-ink' : 'text-muted hover:text-ink'
                }`
              }
            >
              Properties
            </NavLink>
          </nav>
          <div className="flex-1" />
          <Link
            to="/properties/new"
            className="inline-flex items-center gap-1.5 rounded-control bg-accent px-3.5 py-2 font-semibold whitespace-nowrap text-white hover:bg-accent/90"
          >
            <PlusIcon className="size-4" />
            New property
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1080px] gap-5 px-3.5 pt-5 pb-7 sm:px-6 sm:pt-7 sm:pb-9">
        <Outlet />
      </main>
    </>
  );
}
