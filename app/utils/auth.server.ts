import bcrypt from "bcryptjs";
import { redirect } from "@remix-run/node";
import { db } from "~/lib/prisma";
import { getSession, commitSession, destroySession } from "./session.server";

const SALT_ROUNDS = 12;

// ============================================
// Password Utilities
// ============================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ============================================
// User Authentication
// ============================================

export async function verifyLogin(
  email: string,
  password: string
): Promise<{ id: string; email: string; role: string } | null> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive || !user.passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  // Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

// ============================================
// User Creation
// ============================================

export async function createUser({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name?: string;
}) {
  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      profile: {
        create: {},
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  return user;
}

export async function emailExists(email: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  return !!user;
}

// ============================================
// Session Management
// ============================================

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

  // Create database session for tracking
  const expiresAt = new Date(
    Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000
  );

  await db.session.create({
    data: {
      userId,
      expiresAt,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
      userAgent: request.headers.get("user-agent"),
    },
  });

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session, {
        maxAge: remember ? 60 * 60 * 24 * 30 : undefined, // 30 days if remember
      }),
    },
  });
}

export async function getUserId(request: Request): Promise<string | null> {
  const session = await getSession(request);
  const userId = session.get("userId");
  return typeof userId === "string" ? userId : null;
}

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
        select: { avatar: true },
      },
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export async function requireUserId(
  request: Request,
  redirectTo: string = new URL(request.url).pathname
): Promise<string> {
  const userId = await getUserId(request);
  if (!userId) {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/login?${searchParams}`);
  }
  return userId;
}

export async function requireUser(request: Request) {
  const user = await getUser(request);
  if (!user) {
    throw redirect("/login");
  }
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await getUser(request);
  if (!user) {
    throw redirect("/login");
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw redirect("/dashboard?error=unauthorized");
  }
  return user;
}

export async function logout(request: Request) {
  const session = await getSession(request);
  const userId = session.get("userId");

  // Clean up database sessions
  if (userId) {
    await db.session.deleteMany({
      where: { userId },
    });
  }

  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

// ============================================
// Password Reset
// ============================================

export async function updatePassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);

  await db.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function createPasswordResetToken(
  email: string
): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });

  if (!user) {
    return null;
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.passwordReset.deleteMany({
    where: { userId: user.id },
  });

  await db.passwordReset.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  return token;
}

export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: string } | null> {
  const resetToken = await db.passwordReset.findUnique({
    where: { token },
    select: {
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!resetToken || resetToken.expiresAt < new Date() || resetToken.usedAt) {
    return null;
  }

  return { userId: resetToken.userId };
}

export async function usePasswordResetToken(token: string): Promise<void> {
  await db.passwordReset.update({
    where: { token },
    data: { usedAt: new Date() },
  });
}
