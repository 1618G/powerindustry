/**
 * Database Seed Script
 * 
 * Seeds the database with demo users for testing.
 * Run with: pnpm db:seed
 * 
 * IMPORTANT: Customize this file for your platform's specific user roles
 * after running create-new-project.sh
 */

import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

// Default password for all demo users
const DEFAULT_PASSWORD = "Demo123!";

// ============================================
// DEMO USERS - Customize for your platform
// ============================================
// These users will appear as quick-login buttons on the login page.
// Update the roles and emails to match your platform's user types.
//
// Common patterns:
// - SaaS: ADMIN, USER, MANAGER
// - Marketplace: ADMIN, SELLER, BUYER
// - Training: ADMIN, TRAINER, TRAINEE
// - Multi-tenant: SUPER_ADMIN, OWNER, MANAGER, MEMBER

const DEMO_USERS = [
  {
    email: "admin@example.com",
    name: "Admin User",
    role: "ADMIN",
    description: "Full admin access - manage users, settings, system health",
  },
  {
    email: "user@example.com",
    name: "Demo User",
    role: "USER",
    description: "Standard user dashboard",
  },
];

async function main() {
  console.log("🌱 Starting database seed...\n");

  const hashedPassword = await argon2.hash(DEFAULT_PASSWORD);

  for (const userData of DEMO_USERS) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (existingUser) {
      console.log(`⏭️  User already exists: ${userData.email}`);
      continue;
    }

    try {
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          passwordHash: hashedPassword,
          role: userData.role as any,
          emailVerified: true,
          isActive: true,
          profile: {
            create: {
              bio: `Demo ${userData.role.toLowerCase()} account for testing`,
            },
          },
        },
      });

      console.log(`✅ Created user: ${user.email} (${userData.role})`);
    } catch (error: any) {
      // Handle schema variations gracefully
      if (error.message?.includes("Unknown argument")) {
        console.log(`⚠️  Schema mismatch - trying simplified create for ${userData.email}`);
        
        // Try with minimal fields
        const user = await prisma.user.create({
          data: {
            email: userData.email,
            passwordHash: hashedPassword,
            // Add common fields that might exist
            ...(userData.name ? { name: userData.name } : {}),
          } as any,
        });
        
        console.log(`✅ Created user (minimal): ${user.email}`);
      } else {
        throw error;
      }
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Database seeded successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Demo Credentials:");
  console.log("─────────────────");
  for (const user of DEMO_USERS) {
    console.log(`  ${user.role.padEnd(10)} | ${user.email} | ${DEFAULT_PASSWORD}`);
  }
  console.log("\n");
  console.log("📝 Note: Update prisma/seed.ts to add more role-specific users");
  console.log("   and customize DEMO_USERS in app/routes/login.tsx\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    console.error("\n💡 If you see 'Unknown argument' errors, your schema may");
    console.error("   have different fields. Update prisma/seed.ts to match.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
