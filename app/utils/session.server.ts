import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { db } from "~/lib/prisma";

// Session storage configuration
export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET!],
    secure: process.env.NODE_ENV === "production",
  },
});

// Get session from request
export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

// Commit session to response
export async function commitSession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.commitSession(session);
}

// Destroy session
export async function destroySession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.destroySession(session);
}

// Get user ID from session
export async function getUserId(request: Request): Promise<string | null> {
  const session = await getSession(request);
  const userId = session.get("userId");
  return userId ?? null;
}

// Get user from session
export async function getUser(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
      isActive: true,
      profile: {
        select: {
          avatar: true,
          bio: true,
        },
      },
    },
  });

  return user;
}

// Require user to be logged in
export async function requireUserId(
  request: Request,
  redirectTo: string = new URL(request.url).pathname
) {
  const userId = await getUserId(request);
  if (!userId) {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/login?${searchParams}`);
  }
  return userId;
}

// Require user with full data
export async function requireUser(request: Request) {
  const userId = await requireUserId(request);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
      isActive: true,
      profile: true,
    },
  });

  if (!user || !user.isActive) {
    throw redirect("/login");
  }

  return user;
}

// Require admin role
export async function requireAdmin(request: Request) {
  const user = await requireUser(request);

  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw redirect("/dashboard");
  }

  return user;
}

// Require super admin role
export async function requireSuperAdmin(request: Request) {
  const user = await requireUser(request);

  if (user.role !== "SUPER_ADMIN") {
    throw redirect("/dashboard");
  }

  return user;
}

// Create user session
export async function createUserSession({
  request,
  userId,
  remember,
  redirectTo,
}: {
  request: Request;
  userId: string;
  remember: boolean;
  redirectTo: string;
}) {
  const session = await getSession(request);
  session.set("userId", userId);

  // Update last login
  await db.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session, {
        maxAge: remember
          ? 60 * 60 * 24 * 30 // 30 days
          : 60 * 60 * 24 * 7, // 7 days
      }),
    },
  });
}

// Logout user
export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}

