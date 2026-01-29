/**
 * Feature Flags Admin UI
 * 
 * GET /admin/flags - List and manage feature flags
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Form, useFetcher } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faFlag, 
  faToggleOn, 
  faToggleOff, 
  faPlus,
  faTrash,
  faSpinner,
  faGlobe,
  faBuilding,
} from "@fortawesome/free-solid-svg-icons";
import { requireAdmin } from "~/utils/auth.server";
import { 
  listFlags, 
  createFlag, 
  toggleFlag, 
  deleteFlag,
  type FeatureFlag,
} from "~/services/feature-flags.server";
import { z } from "zod";

// ============================================
// Loader
// ============================================

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const flags = await listFlags();

  return json({ flags });
}

// ============================================
// Action
// ============================================

const createSchema = z.object({
  key: z.string().min(1).regex(/^[a-z_]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "create": {
        const data = createSchema.parse({
          key: formData.get("key"),
          name: formData.get("name"),
          description: formData.get("description"),
        });

        await createFlag({
          ...data,
          createdBy: admin.id,
        });

        return json({ success: true, message: "Flag created" });
      }

      case "toggle": {
        const id = formData.get("id") as string;
        await toggleFlag(id);
        return json({ success: true, message: "Flag toggled" });
      }

      case "delete": {
        const id = formData.get("id") as string;
        await deleteFlag(id);
        return json({ success: true, message: "Flag deleted" });
      }

      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 400 }
    );
  }
}

// ============================================
// Component
// ============================================

export default function AdminFlags() {
  const { flags } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <FontAwesomeIcon icon={faFlag} className="text-2xl text-red-500" />
            <h1 className="text-2xl font-bold text-white">Feature Flags</h1>
          </div>
        </div>

        {/* Create New Flag */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create New Flag</h2>
          <Form method="post" className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input type="hidden" name="intent" value="create" />
            <input
              type="text"
              name="key"
              placeholder="flag_key"
              pattern="[a-z_]+"
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500"
            />
            <input
              type="text"
              name="name"
              placeholder="Display Name"
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500"
            />
            <input
              type="text"
              name="description"
              placeholder="Description (optional)"
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
              ) : (
                <FontAwesomeIcon icon={faPlus} />
              )}
              Create
            </button>
          </Form>
        </div>

        {/* Flags List */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Key</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Name</th>
                  <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Scope</th>
                  <th className="text-center text-gray-400 text-sm font-medium px-6 py-4">Status</th>
                  <th className="text-right text-gray-400 text-sm font-medium px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-500 py-8">
                      No feature flags configured
                    </td>
                  </tr>
                ) : (
                  flags.map((flag) => (
                    <FlagRow key={flag.id} flag={flag} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlagRow({ flag }: { flag: FeatureFlag }) {
  const fetcher = useFetcher();
  const isToggling = fetcher.state !== "idle";

  return (
    <tr className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
      <td className="px-6 py-4">
        <code className="text-sm text-red-400 bg-gray-800 px-2 py-1 rounded">
          {flag.key}
        </code>
      </td>
      <td className="px-6 py-4">
        <div>
          <div className="text-white font-medium">{flag.name}</div>
          {flag.description && (
            <div className="text-sm text-gray-500">{flag.description}</div>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
          <FontAwesomeIcon 
            icon={flag.scope === "GLOBAL" ? faGlobe : faBuilding} 
            className="text-xs"
          />
          {flag.scope}
        </span>
      </td>
      <td className="px-6 py-4 text-center">
        <fetcher.Form method="post" className="inline">
          <input type="hidden" name="intent" value="toggle" />
          <input type="hidden" name="id" value={flag.id} />
          <button
            type="submit"
            disabled={isToggling}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              flag.enabled
                ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
            }`}
          >
            {isToggling ? (
              <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
            ) : (
              <FontAwesomeIcon icon={flag.enabled ? faToggleOn : faToggleOff} />
            )}
            {flag.enabled ? "Enabled" : "Disabled"}
          </button>
        </fetcher.Form>
      </td>
      <td className="px-6 py-4 text-right">
        <fetcher.Form method="post" className="inline">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={flag.id} />
          <button
            type="submit"
            onClick={(e) => {
              if (!confirm(`Delete flag "${flag.key}"?`)) {
                e.preventDefault();
              }
            }}
            className="text-gray-500 hover:text-red-400 transition-colors p-2"
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </fetcher.Form>
      </td>
    </tr>
  );
}
