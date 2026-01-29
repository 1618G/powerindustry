/**
 * OAuth Provider Selection - Choose social login provider
 */

import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle, faGithub, faMicrosoft } from "@fortawesome/free-brands-svg-icons";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

import { Navigation, Footer } from "~/components";
import { getEnabledProviders } from "~/services/oauth.server";

export const meta: MetaFunction = () => [{ title: "Sign in with Social Account" }];

export async function loader() {
  const providers = getEnabledProviders();
  return { providers };
}

export default function OAuthPage() {
  const providerConfig = {
    google: {
      name: "Google",
      icon: faGoogle,
      color: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-300",
    },
    github: {
      name: "GitHub",
      icon: faGithub,
      color: "bg-gray-900 hover:bg-gray-800 text-white",
    },
    microsoft: {
      name: "Microsoft",
      icon: faMicrosoft,
      color: "bg-blue-600 hover:bg-blue-700 text-white",
    },
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Sign in with Social Account</h1>
            <p className="mt-2 text-gray-600">Choose your preferred sign-in method</p>
          </div>

          <div className="mt-8 space-y-4">
            {Object.entries(providerConfig).map(([key, config]) => (
              <a
                key={key}
                href={`/auth/${key}`}
                className={`flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 font-medium transition ${config.color}`}
              >
                <FontAwesomeIcon icon={config.icon} className="h-5 w-5" />
                Continue with {config.name}
              </a>
            ))}
          </div>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">Or</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <Link to="/auth/magic" className="btn-secondary w-full">
                Sign in with Magic Link
              </Link>
              <Link to="/login" className="btn-secondary w-full">
                Sign in with Email & Password
              </Link>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">
              <FontAwesomeIcon icon={faArrowLeft} className="mr-1" />
              Back to login
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

