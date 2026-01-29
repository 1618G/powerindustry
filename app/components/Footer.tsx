import { Link } from "@remix-run/react";

export function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-gray-600">
            © {new Date().getFullYear()} ZZA Platform. All rights reserved.
          </div>
          <div className="flex gap-6">
            <Link to="/about" className="text-gray-600 hover:text-gray-900">
              About
            </Link>
            <Link to="/contact" className="text-gray-600 hover:text-gray-900">
              Contact
            </Link>
            <Link to="/terms" className="text-gray-600 hover:text-gray-900">
              Terms
            </Link>
            <Link to="/privacy" className="text-gray-600 hover:text-gray-900">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

