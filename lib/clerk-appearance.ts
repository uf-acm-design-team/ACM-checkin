// Shared Clerk look-and-feel. Clerk's default components render as an opaque
// white card, which reads as a foreign element on top of the brand gradient +
// particle background. Everything here is expressed in terms of the brand CSS
// variables (see app/globals.css and OrgTheme), so a per-org theme repaints the
// Clerk widgets along with the rest of the page for free.
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
  variables: {
    colorPrimary: "var(--brand-action)",
    colorBackground: "transparent",
    colorForeground: "#ffffff",
    colorPrimaryForeground: "#ffffff",
    colorMutedForeground: "rgba(255,255,255,0.65)",
    colorMuted: "rgba(255,255,255,0.08)",
    colorInput: "rgba(255,255,255,0.1)",
    colorInputForeground: "#ffffff",
    colorBorder: "rgba(255,255,255,0.2)",
    colorRing: "rgba(255,255,255,0.4)",
    colorDanger: "#fda4af",
    colorSuccess: "#6ee7b7",
    colorWarning: "#fcd34d",
    colorNeutral: "#ffffff",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif",
  },
  elements: {
    // The card shell — matches the frosted panels used across the app.
    rootBox: "w-full",
    cardBox: "w-full shadow-2xl",
    card: "bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl w-full",
    headerTitle: "text-white text-xl sm:text-2xl font-bold",
    headerSubtitle: "text-white/70 text-sm",

    // Social / alternate-method buttons.
    socialButtonsBlockButton:
      "bg-white/10 border border-white/25 text-white hover:bg-white/20 transition-colors",
    socialButtonsBlockButtonText: "text-white font-medium",
    dividerLine: "bg-white/20",
    dividerText: "text-white/50",

    // Form fields.
    formFieldLabel: "text-white/80 text-sm font-medium",
    formFieldInput:
      "bg-white/10 border border-white/20 text-white placeholder:text-white/40",
    formFieldInputShowPasswordButton: "text-white/60 hover:text-white",
    formFieldSuccessText: "text-emerald-200",
    formFieldErrorText: "text-rose-200",
    formFieldWarningText: "text-amber-200",
    formFieldHintText: "text-white/50",

    formButtonPrimary:
      "bg-brand-action text-white font-semibold normal-case tracking-normal hover:opacity-90 transition-opacity shadow-lg",
    formButtonReset: "text-white/70 hover:text-white",
    formResendCodeLink: "text-brand-primary hover:opacity-80",

    // OTP / verification code inputs.
    otpCodeFieldInput: "bg-white/10 border border-white/20 text-white",

    // Footer ("Don't have an account? Sign up").
    footer: "bg-transparent border-none",
    footerAction: "bg-transparent",
    footerActionText: "text-white/70",
    footerActionLink: "text-brand-primary font-semibold hover:opacity-80",
    footerPages: "text-white/50",
    footerPagesLink: "text-white/60 hover:text-white",

    // Misc text/links inside flows.
    identityPreview: "bg-white/10 border border-white/20",
    identityPreviewText: "text-white",
    identityPreviewEditButton: "text-brand-primary hover:opacity-80",
    alternativeMethodsBlockButton:
      "bg-white/10 border border-white/25 text-white hover:bg-white/20",
    alternativeMethodsBlockButtonText: "text-white",
    backLink: "text-brand-primary hover:opacity-80",
    selectButton: "bg-white/10 border border-white/20 text-white",
    avatarBox: "ring-2 ring-white/25",

    // Popovers (the UserButton menu) render on the page rather than inside the
    // frosted card, so they need an opaque brand surface to stay legible.
    userButtonPopoverCard:
      "bg-brand-background border border-white/15 shadow-2xl",
    userButtonPopoverMain: "bg-transparent",
    userButtonPopoverActionButton: "text-white/80 hover:bg-white/10",
    userButtonPopoverActionButtonText: "text-white/80",
    userButtonPopoverActionButtonIcon: "text-white/60",
    userButtonPopoverFooter: "hidden",
    userPreviewMainIdentifier: "text-white",
    userPreviewSecondaryIdentifier: "text-white/60",
  },
};
