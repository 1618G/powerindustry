import { Link } from "@remix-run/react";

interface NavigationProps {
  fixed?: boolean;
}

export function Navigation({ fixed = false }: NavigationProps) {
  const navClass = fixed
    ? "fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-lg"
    : "border-b border-gray-100 bg-white";

  return (
    <nav className={navClass}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="text-xl font-bold text-primary-600">
          ZZA Platform
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/" className="text-gray-600 hover:text-gray-900">
            Home
          </Link>
          <Link to="/about" className="text-gray-600 hover:text-gray-900">
            About
          </Link>
          <Link to="/contact" className="text-gray-600 hover:text-gray-900">
            Contact
          </Link>
          <Link
            to="/login"
            className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}

