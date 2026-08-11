/**
 * Where "back to sign in" leads.
 *
 * A company signs in at its own address, `/{slug}/login`, which carries its logo and
 * colours. Every route that pushed someone back to sign in sent them to the generic
 * `/login` instead, so signing out dropped people onto an unbranded page belonging to
 * nobody, and they had to remember and retype their own company's URL. Being made to
 * type a URL to get back to where you already were is the app forgetting something it
 * was told, and asking you to make up the difference.
 *
 * The slug is remembered the moment it is known, from the address someone signed in
 * at or from the account the server returned, and it outlives sign-out on purpose:
 * the point is to still know it once the session is gone. It is a company's public
 * name, not a credential, and it is already sitting in the address bar.
 */

const KEY = 'companySlug'

export function rememberCompany(slug?: string | null): void {
  if (!slug) return
  try {
    localStorage.setItem(KEY, slug)
  } catch {
    // Private browsing, or storage full. Losing this costs a retyped URL, not a login.
  }
}

/** For signing in somewhere that is not a company, so the next redirect is honest. */
export function forgetCompany(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing worth reporting */
  }
}

export function rememberedCompany(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** The sign-in page this browser should return to. */
export function companyLoginPath(): string {
  const slug = rememberedCompany()
  return slug ? `/${slug}/login` : '/login'
}
