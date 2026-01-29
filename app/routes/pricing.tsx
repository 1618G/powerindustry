/**
 * Pricing Page - Display subscription plans
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faStar, faRocket, faBuilding } from "@fortawesome/free-solid-svg-icons";

import { getUser } from "~/utils/auth.server";
import { getActivePlans, getActiveSubscription, createCheckoutSession } from "~/services/billing.service";
import { getOrganizationForUser } from "~/services/organization.server";

export const meta: MetaFunction = () => [
  { title: "Pricing" },
  { name: "description", content: "Simple, transparent pricing for everyone" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  const plans = await getActivePlans();

  let activeSubscription = null;
  if (user) {
    const org = await getOrganizationForUser(user.id);
    if (org) {
      activeSubscription = await getActiveSubscription(org.id);
    }
  }

  return json({ plans, user, activeSubscription });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const priceId = formData.get("priceId") as string;
  const user = await getUser(request);

  if (!user) {
    return redirect(`/register?plan=${priceId}`);
  }

  if (!priceId) {
    return json({ error: "Please select a plan" }, { status: 400 });
  }

  try {
    const checkoutUrl = await createCheckoutSession(user.id, priceId);
    return redirect(checkoutUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start checkout";
    return json({ error: message }, { status: 500 });
  }
}

export default function PricingPage() {
  const { plans, user, activeSubscription } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const iconMap: Record<string, typeof faStar> = {
    starter: faStar,
    professional: faRocket,
    enterprise: faBuilding,
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-xl font-bold text-white">
            {process.env.APP_NAME || "ZZA Platform"}
          </Link>
          <nav className="flex items-center gap-4">
            {user ? (
              <Link to="/dashboard" className="text-gray-400 hover:text-white">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-gray-400 hover:text-white">
                  Login
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600"
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="py-20 text-center">
        <h1 className="text-4xl font-bold text-white md:text-5xl">
          Simple, Transparent Pricing
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
          Choose the plan that's right for you. All plans include a 14-day free trial.
        </p>
      </div>

      {actionData?.error && (
        <div className="mx-auto mb-8 max-w-md rounded-lg bg-red-500/10 p-4 text-center text-red-400">
          {actionData.error}
        </div>
      )}

      {/* Plans */}
      <div className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grid gap-8 md:grid-cols-3">
          {plans.map((plan) => {
            const features = (plan.features as string[]) || [];
            const isCurrentPlan = activeSubscription?.stripePriceId === plan.stripePriceId;
            const Icon = iconMap[plan.slug] || faStar;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border ${
                  plan.isPopular
                    ? "border-red-500 bg-gray-900"
                    : "border-gray-800 bg-gray-900"
                } p-8`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-red-500 px-4 py-1 text-sm font-semibold text-white">
                    Most Popular
                  </div>
                )}

                <div className="mb-6 text-center">
                  <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                    plan.isPopular ? "bg-red-500/20" : "bg-gray-800"
                  }`}>
                    <FontAwesomeIcon
                      icon={Icon}
                      className={`text-2xl ${plan.isPopular ? "text-red-400" : "text-gray-400"}`}
                    />
                  </div>
                  <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                  {plan.description && (
                    <p className="mt-2 text-sm text-gray-400">{plan.description}</p>
                  )}
                </div>

                <div className="mb-6 text-center">
                  <span className="text-4xl font-bold text-white">
                    ${(plan.price / 100).toFixed(0)}
                  </span>
                  <span className="text-gray-400">/{plan.interval}</span>
                </div>

                <ul className="mb-8 space-y-3">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-gray-300">
                      <FontAwesomeIcon icon={faCheck} className="text-green-400" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Form method="post">
                  <input type="hidden" name="priceId" value={plan.stripePriceId} />
                  <button
                    type="submit"
                    disabled={isSubmitting || isCurrentPlan}
                    className={`w-full rounded-lg py-3 font-semibold transition ${
                      isCurrentPlan
                        ? "cursor-not-allowed bg-gray-700 text-gray-400"
                        : plan.isPopular
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-gray-800 text-white hover:bg-gray-700"
                    }`}
                  >
                    {isCurrentPlan
                      ? "Current Plan"
                      : isSubmitting
                      ? "Processing..."
                      : user
                      ? "Subscribe"
                      : "Get Started"}
                  </button>
                </Form>
              </div>
            );
          })}
        </div>

        {/* FAQ or Additional Info */}
        <div className="mt-16 text-center">
          <h3 className="text-xl font-semibold text-white">All plans include:</h3>
          <div className="mx-auto mt-6 grid max-w-3xl gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-gray-900 p-4">
              <p className="font-medium text-white">14-day free trial</p>
              <p className="text-sm text-gray-400">Try before you buy</p>
            </div>
            <div className="rounded-lg bg-gray-900 p-4">
              <p className="font-medium text-white">Cancel anytime</p>
              <p className="text-sm text-gray-400">No long-term contracts</p>
            </div>
            <div className="rounded-lg bg-gray-900 p-4">
              <p className="font-medium text-white">Priority support</p>
              <p className="text-sm text-gray-400">We're here to help</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
