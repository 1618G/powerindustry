/**
 * Dashboard Billing - Subscription and payment management
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCreditCard,
  faReceipt,
  faArrowUpRightFromSquare,
  faCheck,
  faCrown,
} from "@fortawesome/free-solid-svg-icons";

import { requireUser } from "~/utils/auth.server";
import { 
  getActiveSubscription, 
  getActivePlans, 
  getPlanByPriceId,
  getRecentPayments,
  openBillingPortal,
  createCheckoutSession 
} from "~/services/billing.service";
import { getOrganizationForUser } from "~/services/organization.server";

export const meta: MetaFunction = () => [{ title: "Billing & Subscription" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const organization = await getOrganizationForUser(user.id);

  let subscription = null;
  let payments: Awaited<ReturnType<typeof getRecentPayments>> = [];

  if (organization) {
    subscription = await getActiveSubscription(organization.id);
    payments = await getRecentPayments(organization.id);
  }

  const plans = await getActivePlans();

  return json({
    user,
    organization,
    subscription,
    payments,
    plans,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "manage-billing": {
      try {
        const portalUrl = await openBillingPortal(
          user.id,
          `${process.env.APP_URL}/dashboard/billing`
        );
        return redirect(portalUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to open billing portal";
        return json({ error: message }, { status: 400 });
      }
    }

    case "subscribe": {
      const priceId = formData.get("priceId") as string;
      
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

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
}

export default function BillingPage() {
  const { subscription, payments, plans } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const currentPlan = subscription ? plans.find(p => p.stripePriceId === subscription.stripePriceId) : null;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          <FontAwesomeIcon icon={faCreditCard} className="mr-3 text-red-500" />
          Billing & Subscription
        </h1>
        <p className="mt-1 text-gray-400">Manage your subscription and payment methods</p>
      </div>

      {actionData?.error && (
        <div className="mb-6 rounded-lg bg-red-500/10 p-4 text-red-400">
          {actionData.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Current Plan */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Current Plan</h2>

            {subscription ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-gray-800 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/20">
                      <FontAwesomeIcon icon={faCrown} className="text-xl text-red-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">
                        {currentPlan?.name || subscription.plan}
                      </h3>
                      <p className="text-sm text-gray-400">
                        ${(currentPlan?.price || 0) / 100}/{subscription.interval}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm ${
                    subscription.status === "ACTIVE" ? "bg-green-500/20 text-green-400" :
                    subscription.status === "TRIALING" ? "bg-blue-500/20 text-blue-400" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {subscription.status}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-gray-800/50 p-4">
                    <p className="text-sm text-gray-400">Current Period</p>
                    <p className="text-white">
                      {new Date(subscription.currentPeriodStart).toLocaleDateString()} - 
                      {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                  
                  {subscription.cancelAtPeriodEnd && (
                    <div className="rounded-lg bg-yellow-500/10 p-4">
                      <p className="text-sm text-yellow-400">Cancels at period end</p>
                      <p className="text-white">
                        {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                <Form method="post">
                  <input type="hidden" name="intent" value="manage-billing" />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-white hover:bg-gray-700"
                  >
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                    Manage Subscription
                  </button>
                </Form>
              </div>
            ) : (
              <div className="rounded-lg bg-gray-800/50 p-6 text-center">
                <p className="mb-4 text-gray-400">You don't have an active subscription</p>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-6 py-2 font-semibold text-white hover:bg-red-600"
                >
                  View Plans
                </Link>
              </div>
            )}
          </div>

          {/* Payment History */}
          <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              <FontAwesomeIcon icon={faReceipt} className="mr-2 text-gray-400" />
              Payment History
            </h2>

            {payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-lg bg-gray-800 p-4"
                  >
                    <div>
                      <p className="font-medium text-white">
                        ${(payment.amount / 100).toFixed(2)} {payment.currency.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-400">
                        {payment.description || "Subscription payment"}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        payment.status === "SUCCEEDED" ? "bg-green-500/20 text-green-400" :
                        payment.status === "FAILED" ? "bg-red-500/20 text-red-400" :
                        "bg-gray-500/20 text-gray-400"
                      }`}>
                        {payment.status}
                      </span>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500">No payments yet</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 font-semibold text-white">Quick Actions</h3>
            <div className="space-y-3">
              <Form method="post">
                <input type="hidden" name="intent" value="manage-billing" />
                <button
                  type="submit"
                  disabled={isSubmitting || !subscription}
                  className="w-full rounded-lg bg-gray-800 px-4 py-2 text-left text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Update Payment Method
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="manage-billing" />
                <button
                  type="submit"
                  disabled={isSubmitting || !subscription}
                  className="w-full rounded-lg bg-gray-800 px-4 py-2 text-left text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  View Invoices
                </button>
              </Form>
              <Link
                to="/pricing"
                className="block w-full rounded-lg bg-gray-800 px-4 py-2 text-left text-white hover:bg-gray-700"
              >
                {subscription ? "Change Plan" : "View Plans"}
              </Link>
            </div>
          </div>

          {currentPlan && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 font-semibold text-white">Plan Features</h3>
              <ul className="space-y-2">
                {(currentPlan.features as string[])?.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                    <FontAwesomeIcon icon={faCheck} className="text-green-400" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
