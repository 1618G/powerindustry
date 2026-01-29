import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getUser } from "~/utils/session.server";

import "./styles/tailwind.css";

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
  },
];

export const meta: MetaFunction = () => [
  { title: "ZZA Platform" },
  { name: "description", content: "Welcome to ZZA Platform - Your solution awaits." },
  { name: "viewport", content: "width=device-width, initial-scale=1" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  return json({ user });
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="h-full bg-gray-50 antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <title>Error - ZZA Platform</title>
      </head>
      <body className="h-full bg-gray-50">
        <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
          <div className="mx-auto max-w-md text-center">
            <h1 className="text-4xl font-bold text-gray-900">Oops!</h1>
            <p className="mt-4 text-lg text-gray-600">
              Something went wrong. Please try again later.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-primary-600 px-6 py-3 text-white hover:bg-primary-700"
            >
              Go Home
            </a>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

