/**
 * Form Security Components - CSRF Protection and Honeypot Fields
 *
 * PURPOSE: Provide reusable components for form security
 *
 * USAGE:
 * <Form method="post">
 *   <CsrfToken token={csrfToken} />
 *   <HoneypotInputs />
 *   {/* form fields *\/}
 * </Form>
 *
 * // In loader
 * const { token: csrfToken } = await generateCsrfToken(request);
 * return json({ csrfToken });
 *
 * // In action
 * await validateCsrfToken(request, formData.get("_csrf"));
 * await requireHumanSubmission(request, formData);
 *
 * LAYER: Components
 */

import { useEffect, useState } from "react";

// ============================================
// CSRF Token Component
// ============================================

interface CsrfTokenProps {
  /** CSRF token from server */
  token: string;
  /** Field name (default: _csrf) */
  name?: string;
}

/**
 * Hidden input for CSRF token
 */
export function CsrfToken({ token, name = "_csrf" }: CsrfTokenProps) {
  return <input type="hidden" name={name} value={token} />;
}

// ============================================
// Honeypot Fields Component
// ============================================

interface HoneypotInputsProps {
  /** Custom field name prefix */
  prefix?: string;
  /** Include timing validation fields */
  includeTiming?: boolean;
}

/**
 * Honeypot fields to catch bots
 * These fields are hidden from users but visible to bots
 */
export function HoneypotInputs({ 
  prefix = "", 
  includeTiming = true 
}: HoneypotInputsProps) {
  // Generate timestamp on client side for timing validation
  const [timestamp, setTimestamp] = useState<string>("");
  const [validation, setValidation] = useState<string>("");

  useEffect(() => {
    // Set timestamp when component mounts
    const ts = Date.now().toString(36);
    setTimestamp(ts);
    
    // Simple client-side validation (server will do real validation)
    const hash = btoa(ts).substring(0, 16);
    setValidation(hash);
  }, []);

  const fieldPrefix = prefix ? `${prefix}_` : "";

  return (
    <>
      {/* 
        Honeypot fields - styled to be invisible but still in DOM 
        Bots will fill these, humans won't see them
      */}
      <div 
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        {/* Fake website field - common target for bots */}
        <label htmlFor={`${fieldPrefix}website_url_field`}>
          Website URL (leave blank)
        </label>
        <input
          type="text"
          id={`${fieldPrefix}website_url_field`}
          name={`${fieldPrefix}website_url_field`}
          autoComplete="off"
          tabIndex={-1}
        />

        {/* Fake email field */}
        <label htmlFor={`${fieldPrefix}contact_email_address`}>
          Contact Email (leave blank)
        </label>
        <input
          type="email"
          id={`${fieldPrefix}contact_email_address`}
          name={`${fieldPrefix}contact_email_address`}
          autoComplete="off"
          tabIndex={-1}
        />

        {/* Fake phone field */}
        <label htmlFor={`${fieldPrefix}phone_number_field`}>
          Phone Number (leave blank)
        </label>
        <input
          type="tel"
          id={`${fieldPrefix}phone_number_field`}
          name={`${fieldPrefix}phone_number_field`}
          autoComplete="off"
          tabIndex={-1}
        />
      </div>

      {/* Timing validation fields */}
      {includeTiming && (
        <>
          <input type="hidden" name="_hp_ts" value={timestamp} />
          <input type="hidden" name="_hp_v" value={validation} />
        </>
      )}
    </>
  );
}

// ============================================
// Combined Form Security Component
// ============================================

interface FormSecurityProps {
  /** CSRF token from server (required for CSRF protection) */
  csrfToken?: string;
  /** Enable honeypot fields (default: true) */
  enableHoneypot?: boolean;
  /** Enable timing validation (default: true) */
  enableTiming?: boolean;
}

/**
 * All-in-one form security component
 * Includes CSRF token and honeypot fields
 */
export function FormSecurity({
  csrfToken,
  enableHoneypot = true,
  enableTiming = true,
}: FormSecurityProps) {
  return (
    <>
      {csrfToken && <CsrfToken token={csrfToken} />}
      {enableHoneypot && <HoneypotInputs includeTiming={enableTiming} />}
    </>
  );
}

// ============================================
// Security Context Hook
// ============================================

/**
 * Hook to get form security values from loader data
 * Usage: const { csrfToken } = useFormSecurity(loaderData);
 */
export function useFormSecurity<T extends { csrfToken?: string }>(
  data: T
): { csrfToken?: string } {
  return {
    csrfToken: data.csrfToken,
  };
}

// ============================================
// Form Validation Helper
// ============================================

export interface ValidationError {
  field: string;
  message: string;
}

export interface FormValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
  fieldErrors?: Record<string, string[]>;
}

/**
 * Helper to display form errors
 */
export function FormError({ 
  error, 
  className = "mt-1 text-sm text-red-600" 
}: { 
  error?: string | string[]; 
  className?: string;
}) {
  if (!error) return null;
  
  const errors = Array.isArray(error) ? error : [error];
  
  return (
    <>
      {errors.map((err, i) => (
        <p key={i} className={className} role="alert">
          {err}
        </p>
      ))}
    </>
  );
}

/**
 * Form field wrapper with error handling
 */
export function FormField({
  name,
  label,
  error,
  required = false,
  children,
  className = "",
}: {
  name: string;
  label: string;
  error?: string | string[];
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label 
        htmlFor={name} 
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="mt-1">
        {children}
      </div>
      <FormError error={error} />
    </div>
  );
}

// ============================================
// Rate Limit Message Component
// ============================================

export function RateLimitMessage({
  retryAfter,
  className = "rounded-md bg-yellow-50 p-4",
}: {
  retryAfter?: number;
  className?: string;
}) {
  const [countdown, setCountdown] = useState(retryAfter || 0);

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  if (!retryAfter) return null;

  return (
    <div className={className} role="alert">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg 
            className="h-5 w-5 text-yellow-400" 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path 
              fillRule="evenodd" 
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" 
              clipRule="evenodd" 
            />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">
            Too many attempts
          </h3>
          <div className="mt-2 text-sm text-yellow-700">
            {countdown > 0 ? (
              <p>Please wait {countdown} seconds before trying again.</p>
            ) : (
              <p>You can try again now.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Security Warning Component
// ============================================

export function SecurityWarning({
  title,
  message,
  type = "warning",
  onDismiss,
}: {
  title: string;
  message: string;
  type?: "warning" | "error" | "info";
  onDismiss?: () => void;
}) {
  const colors = {
    warning: {
      bg: "bg-yellow-50",
      border: "border-yellow-400",
      icon: "text-yellow-400",
      title: "text-yellow-800",
      text: "text-yellow-700",
    },
    error: {
      bg: "bg-red-50",
      border: "border-red-400",
      icon: "text-red-400",
      title: "text-red-800",
      text: "text-red-700",
    },
    info: {
      bg: "bg-blue-50",
      border: "border-blue-400",
      icon: "text-blue-400",
      title: "text-blue-800",
      text: "text-blue-700",
    },
  };

  const c = colors[type];

  return (
    <div className={`rounded-md ${c.bg} p-4 border-l-4 ${c.border}`} role="alert">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg 
            className={`h-5 w-5 ${c.icon}`} 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path 
              fillRule="evenodd" 
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" 
              clipRule="evenodd" 
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className={`text-sm font-medium ${c.title}`}>{title}</h3>
          <div className={`mt-2 text-sm ${c.text}`}>
            <p>{message}</p>
          </div>
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <button
              type="button"
              onClick={onDismiss}
              className={`inline-flex rounded-md p-1.5 ${c.bg} ${c.icon} hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path 
                  fillRule="evenodd" 
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
                  clipRule="evenodd" 
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
