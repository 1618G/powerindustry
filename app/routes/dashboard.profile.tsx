/**
 * Dashboard Profile - Edit user profile information
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faEnvelope,
  faPhone,
  faBuilding,
  faBriefcase,
  faGlobe,
  faMapMarkerAlt,
  faSave,
  faCamera,
} from "@fortawesome/free-solid-svg-icons";

import { requireUser } from "~/utils/auth.server";
import { getUserWithProfile, updateProfile } from "~/services/settings.service";
import { nameSchema, phoneSchema, urlSchema } from "~/services/security.server";
import { z } from "zod";

export const meta: MetaFunction = () => [{ title: "Profile Settings" }];

const profileSchema = z.object({
  name: nameSchema.optional().or(z.literal("")),
  phone: phoneSchema,
  company: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  website: urlSchema,
  bio: z.string().max(500).optional(),
  timezone: z.string().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const userWithProfile = await getUserWithProfile(user.id);

  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    },
    profile: userWithProfile?.profile || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();

  const data = {
    name: formData.get("name") as string,
    phone: formData.get("phone") as string,
    company: formData.get("company") as string,
    jobTitle: formData.get("jobTitle") as string,
    location: formData.get("location") as string,
    website: formData.get("website") as string,
    bio: formData.get("bio") as string,
    timezone: formData.get("timezone") as string,
  };

  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) {
    return json({ error: parsed.error.errors[0]?.message || "Invalid data" }, { status: 400 });
  }

  try {
    await updateProfile(user.id, data);
    return json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Profile update error:", error);
    return json({ error: "Failed to update profile" }, { status: 500 });
  }
}

export default function ProfilePage() {
  const { user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          <FontAwesomeIcon icon={faUser} className="mr-3 text-red-500" />
          Profile Settings
        </h1>
        <p className="mt-1 text-gray-400">Manage your personal information</p>
      </div>

      {actionData?.success && (
        <div className="mb-6 rounded-lg bg-green-500/10 p-4 text-green-400">
          {actionData.message}
        </div>
      )}

      {actionData?.error && (
        <div className="mb-6 rounded-lg bg-red-500/10 p-4 text-red-400">
          {actionData.error}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900">
        {/* Avatar Section */}
        <div className="border-b border-gray-800 p-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={user.name || "Avatar"}
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-800 text-2xl font-bold text-gray-400">
                  {(user.name || user.email)[0].toUpperCase()}
                </div>
              )}
              <button
                type="button"
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
              >
                <FontAwesomeIcon icon={faCamera} className="h-3 w-3" />
              </button>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{user.name || "No name set"}</h3>
              <p className="text-gray-400">{user.email}</p>
              {!user.emailVerified && (
                <span className="mt-1 inline-block rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                  Email not verified
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Form */}
        <Form method="post" className="p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                <FontAwesomeIcon icon={faUser} className="mr-2 text-gray-500" />
                Full Name
              </label>
              <input
                type="text"
                name="name"
                defaultValue={user.name || ""}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                <FontAwesomeIcon icon={faEnvelope} className="mr-2 text-gray-500" />
                Email
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2.5 text-gray-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                <FontAwesomeIcon icon={faPhone} className="mr-2 text-gray-500" />
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                defaultValue={profile?.phone || ""}
                placeholder="+1 234 567 8900"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                <FontAwesomeIcon icon={faBuilding} className="mr-2 text-gray-500" />
                Company
              </label>
              <input
                type="text"
                name="company"
                defaultValue={profile?.company || ""}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                <FontAwesomeIcon icon={faBriefcase} className="mr-2 text-gray-500" />
                Job Title
              </label>
              <input
                type="text"
                name="jobTitle"
                defaultValue={profile?.jobTitle || ""}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                <FontAwesomeIcon icon={faMapMarkerAlt} className="mr-2 text-gray-500" />
                Location
              </label>
              <input
                type="text"
                name="location"
                defaultValue={profile?.location || ""}
                placeholder="City, Country"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                <FontAwesomeIcon icon={faGlobe} className="mr-2 text-gray-500" />
                Website
              </label>
              <input
                type="url"
                name="website"
                defaultValue={profile?.website || ""}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Timezone
              </label>
              <select
                name="timezone"
                defaultValue={profile?.timezone || "UTC"}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time (US)</option>
                <option value="America/Chicago">Central Time (US)</option>
                <option value="America/Denver">Mountain Time (US)</option>
                <option value="America/Los_Angeles">Pacific Time (US)</option>
                <option value="Europe/London">London</option>
                <option value="Europe/Paris">Paris</option>
                <option value="Europe/Berlin">Berlin</option>
                <option value="Asia/Tokyo">Tokyo</option>
                <option value="Asia/Shanghai">Shanghai</option>
                <option value="Australia/Sydney">Sydney</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Bio
              </label>
              <textarea
                name="bio"
                rows={4}
                defaultValue={profile?.bio || ""}
                placeholder="Tell us a bit about yourself..."
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-6 py-2.5 font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faSave} />
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
