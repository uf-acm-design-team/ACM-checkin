// The implementation lives with the edge functions so Deno can import it too;
// see supabase/functions/_shared/email-match.ts.
export {
  escapeLikePattern,
  hasUnescapableWildcard,
  sameEmail,
} from "../supabase/functions/_shared/email-match";
