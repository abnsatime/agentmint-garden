/**
 * Build-time switches.
 *
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time, so a static export bakes these in:
 * the Pages build leaves them unset, which keeps the diagnostic chrome off the public site.
 */

export const debugEnabled = process.env.NEXT_PUBLIC_DEBUG === "true";

/** The footer state line needs both a request for it and a debug build. */
export function showFooterDiagnostics(requested: boolean, debug: boolean = debugEnabled) {
  return requested && debug;
}
