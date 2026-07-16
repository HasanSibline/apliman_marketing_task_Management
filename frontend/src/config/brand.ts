/**
 * Single source of truth for platform branding.
 * Rename here to rebrand the whole app (title, loading screen, sidebar, etc.).
 * Per-company white-labelling (logo + primary color) overrides this at runtime.
 */
export const BRAND = {
  /** Short platform name shown in the shell (sidebar, loading). */
  name: 'Aura',
  /** Full product name for titles/marketing surfaces. */
  fullName: 'Aura Operations',
  /** Tagline. */
  tagline: 'Making Intelligent Work Simple',
  /** Underlying vendor. */
  vendor: 'Apliman',
  /** In-app AI assistant sub-brand. */
  assistant: 'Aura Assistant',
  /** Default brand color (used when a company has not set its own). */
  defaultColor: '#2563eb',
} as const;

export type Brand = typeof BRAND;
