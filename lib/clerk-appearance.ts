// Shared Clerk look-and-feel.
//
// Clerk's default components already render as a white card, which is now what
// the design system wants -- so this file's job flipped. It used to fight the
// defaults back to white-on-gradient; it now mostly tunes them to match the
// system's own hairlines, slate text ramp, radii, and accent, so the Clerk
// widgets read as part of the app rather than a hosted form dropped into it.
//
// Everything is expressed in the design tokens from app/globals.css. Note that
// the accent here is the product purple on the auth routes -- those live
// outside /[orgSlug], so no org accent is in scope.
//
// `variables` covers Clerk's own design tokens; `elements` handles the pieces
// those tokens don't reach (the card shell, social buttons, popovers).
//
// Not typed as `Appearance`: that type lives in `@clerk/ui`, which this project
// doesn't install, so `ClerkProvider`'s appearance prop resolves to `unknown`
// here. The shape below follows the documented v7 API.
//
// Variable names are the post-2025-07-15 spellings -- `colorText`,
// `colorTextSecondary`, `colorInputText`, `colorInputBackground` and
// `spacingUnit` were renamed and are silently ignored under those old names.
export const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "var(--clerk-accent)",
    colorBackground: "var(--surface)",
    colorForeground: "var(--ink)",
    colorPrimaryForeground: "var(--accent-ink)",
    colorMutedForeground: "var(--ink-muted)",
    colorMuted: "var(--surface-sunken)",
    colorInput: "var(--surface)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--line)",
    colorRing: "var(--accent)",
    colorDanger: "var(--bad)",
    colorSuccess: "var(--good)",
    colorWarning: "var(--warn)",
    colorNeutral: "var(--ink)",
    // The system's control radius, not Clerk's rounder default.
    borderRadius: "6px",
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif",
  },
  elements: {
    // The card shell. One hairline and the system's single elevation -- Clerk's
    // default drops a much heavier shadow, which floats it off the canvas.
    rootBox: "w-full",
    cardBox: "w-full shadow-[var(--shadow-card)]",
    card: "bg-surface border border-line shadow-none w-full",
    headerTitle: "text-ink text-xl sm:text-2xl font-bold tracking-[-0.02em]",
    headerSubtitle: "text-ink-muted text-sm",

    // Social / alternate-method buttons -- the system's secondary button.
    socialButtonsBlockButton:
      "bg-surface border border-line text-ink-strong hover:bg-surface-sunken transition-colors",
    socialButtonsBlockButtonText: "text-ink-strong font-semibold",
    dividerLine: "bg-line",
    dividerText: "text-ink-faint",

    // Form fields.
    formFieldLabel: "text-ink-strong text-[13px] font-semibold",
    formFieldInput:
      "bg-surface border border-line text-ink placeholder:text-ink-faint",
    formFieldInputShowPasswordButton: "text-ink-faint hover:text-ink",
    formFieldSuccessText: "text-good-ink",
    formFieldErrorText: "text-bad",
    formFieldWarningText: "text-warn-ink",
    formFieldHintText: "text-ink-faint",

    formButtonPrimary:
      "bg-accent text-accent-ink font-medium normal-case tracking-normal hover:bg-accent-deep transition-colors shadow-[var(--shadow-raised)]",
    formButtonReset: "text-ink-muted hover:text-ink",
    formResendCodeLink: "text-accent hover:text-accent-deep",

    // OTP / verification code inputs.
    otpCodeFieldInput: "bg-surface border border-line text-ink",

    // Footer ("Don't have an account? Sign up").
    footer: "bg-transparent border-none",
    footerAction: "bg-transparent",
    footerActionText: "text-ink-muted",
    footerActionLink: "text-accent font-semibold hover:text-accent-deep",
    footerPages: "text-ink-faint",
    footerPagesLink: "text-ink-faint hover:text-ink",

    // Misc text/links inside flows.
    identityPreview: "bg-surface-sunken border border-line",
    identityPreviewText: "text-ink",
    identityPreviewEditButton: "text-accent hover:text-accent-deep",
    alternativeMethodsBlockButton:
      "bg-surface border border-line text-ink-strong hover:bg-surface-sunken",
    alternativeMethodsBlockButtonText: "text-ink-strong",
    backLink: "text-accent hover:text-accent-deep",
    selectButton: "bg-surface border border-line text-ink",
    avatarBox: "ring-1 ring-line",

    // Popovers (the UserButton menu) render on the page rather than inside the
    // card, so they need an opaque surface of their own.
    userButtonPopoverCard: "bg-surface border border-line shadow-[var(--shadow-card)]",
    userButtonPopoverMain: "bg-transparent",
    userButtonPopoverActionButton: "text-ink-strong hover:bg-surface-sunken",
    userButtonPopoverActionButtonText: "text-ink-strong",
    userButtonPopoverActionButtonIcon: "text-ink-faint",
    userButtonPopoverFooter: "hidden",
    userPreviewMainIdentifier: "text-ink",
    userPreviewSecondaryIdentifier: "text-ink-muted",
  },
};
