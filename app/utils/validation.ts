import { z } from "zod";

// ============================================
// Base Field Schemas
// ============================================

// Email validation
export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .max(255, "Email is too long")
  .email("Invalid email address")
  .transform((email) => email.toLowerCase().trim());

// Password validation (for registration/reset)
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character");

// Simple password (for login - no format requirements)
export const loginPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .max(128, "Password is too long");

// Name validation
export const nameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be less than 100 characters")
  .regex(/^[a-zA-Z\s\-'.]+$/, "Name contains invalid characters")
  .transform((name) => name.trim())
  .optional();

// Phone validation (E.164 format)
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number")
  .optional()
  .or(z.literal(""));

// URL validation
export const urlSchema = z
  .string()
  .url("Invalid URL")
  .max(2048, "URL is too long")
  .optional()
  .or(z.literal(""));

// Slug validation
export const slugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(50, "Slug is too long")
  .regex(/^[a-z0-9\-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens");

// UUID validation
export const uuidSchema = z
  .string()
  .uuid("Invalid ID format");

// ============================================
// Sanitization Helpers
// ============================================

/**
 * Remove potential XSS characters
 */
export const sanitizedStringSchema = z
  .string()
  .transform((str) => 
    str
      .replace(/[<>]/g, "") // Remove angle brackets
      .replace(/javascript:/gi, "") // Remove javascript: protocol
      .replace(/on\w+=/gi, "") // Remove event handlers
      .trim()
  );

/**
 * Safe HTML content (for rich text fields)
 */
export const safeHtmlSchema = z
  .string()
  .transform((str) => {
    // Basic sanitization - consider using DOMPurify for production
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "")
      .trim();
  });

// ============================================
// Form Schemas
// ============================================

// Login schema
export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
  remember: z.boolean().optional().default(false),
  redirectTo: z.string().optional().default("/dashboard"),
  // Security fields (optional)
  _csrf: z.string().optional(),
});

// Registration schema
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
    name: nameSchema,
    acceptTerms: z.boolean().refine((val) => val === true, {
      message: "You must accept the terms and conditions",
    }),
    marketing: z.boolean().optional().default(false),
    // Security fields
    _csrf: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// Contact form schema
export const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: emailSchema,
  subject: z.string().max(200, "Subject is too long").optional(),
  message: sanitizedStringSchema
    .pipe(z.string()
      .min(10, "Message must be at least 10 characters")
      .max(5000, "Message must be less than 5000 characters")),
  // Security fields
  _csrf: z.string().optional(),
});

// Profile update schema
export const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100).optional(),
  bio: sanitizedStringSchema.pipe(z.string().max(500, "Bio must be less than 500 characters")).optional(),
  phone: phoneSchema,
  company: z.string().max(100, "Company must be less than 100 characters").optional(),
  jobTitle: z.string().max(100, "Job title must be less than 100 characters").optional(),
  location: z.string().max(100, "Location must be less than 100 characters").optional(),
  website: urlSchema,
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
});

// Password change schema
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

// Forgot password schema
export const forgotPasswordSchema = z.object({
  email: emailSchema,
  _csrf: z.string().optional(),
});

// Reset password schema
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Token is required"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ============================================
// Organization Schemas
// ============================================

export const organizationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: slugSchema.optional(), // Auto-generated if not provided
  type: z.enum(["BUSINESS", "ENTERPRISE", "NONPROFIT", "GOVERNMENT"]).optional(),
  taxId: z.string().max(50).optional(),
  website: urlSchema,
  phone: phoneSchema,
  billingEmail: emailSchema.optional(),
});

export const invitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
  message: z.string().max(500).optional(),
});

// ============================================
// API Schemas
// ============================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const searchSchema = z.object({
  query: z.string().max(200).optional(),
  filters: z.record(z.string()).optional(),
});

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.from && data.to) {
      return data.from <= data.to;
    }
    return true;
  },
  { message: "Start date must be before end date" }
);

// ============================================
// Validation Utilities
// ============================================

/**
 * Parse form data with a Zod schema
 */
export function parseFormData<T extends z.ZodType>(
  schema: T,
  formData: FormData
): z.SafeParseReturnType<z.input<T>, z.output<T>> {
  const data: Record<string, unknown> = {};
  
  for (const [key, value] of formData.entries()) {
    // Handle checkbox values
    if (value === "on") {
      data[key] = true;
    } 
    // Handle multiple values (arrays)
    else if (data[key] !== undefined) {
      if (Array.isArray(data[key])) {
        (data[key] as unknown[]).push(value);
      } else {
        data[key] = [data[key], value];
      }
    } else {
      data[key] = value;
    }
  }
  
  return schema.safeParse(data);
}

/**
 * Convert Zod errors to field errors object
 */
export function formatZodErrors(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/**
 * Create a validation result from a Zod parse result
 */
export function createValidationResult<T>(
  result: z.SafeParseReturnType<unknown, T>
): { success: true; data: T } | { success: false; errors: Record<string, string[]> } {
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error) };
}

// ============================================
// Type exports
// ============================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type OrganizationInput = z.infer<typeof organizationSchema>;
export type InvitationInput = z.infer<typeof invitationSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

