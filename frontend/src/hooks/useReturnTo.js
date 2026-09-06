import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Where a "back" control should actually go.
 *
 * THE BUG THIS FIXES
 * Lists keep their state in the URL — `/sessions?status=COMPLETED&page=3`.
 * Detail pages linked back to a hardcoded `/sessions`, so filtering a list,
 * paging into it, opening a row and pressing Back dropped the counsellor onto
 * an unfiltered page 1. With a long list that is not a cosmetic annoyance; it
 * means losing your place every time you look at something.
 *
 * So a list passes where it was in `state.from` when it links out, and the
 * detail page returns exactly there.
 *
 * The fallback matters just as much: somebody arriving from a bookmark, an
 * email link, or a page refresh has no `from`, and `navigate(-1)` would take
 * them out of the application entirely — or, on a fresh tab, nowhere at all.
 * They get the sensible list URL instead.
 */
export function useReturnTo(fallback) {
  const navigate = useNavigate();
  const location = useLocation();

  const target = location.state?.from || fallback;

  const goBack = useCallback(() => {
    // replace: false — going back should be an ordinary navigation, so
    // Forward still works afterwards.
    navigate(target);
  }, [navigate, target]);

  // Exposed so a page that forwards elsewhere can pass the origin along
  // rather than dropping it (see SessionDetail's redirect to the report).
  return { target, goBack, state: location.state };
}

/**
 * The value a list passes to its outgoing links, so they can come back to it.
 *
 * Includes the query string, because that is where the filter, page and sort
 * live — the whole point of remembering.
 */
export function useReturnState() {
  const location = useLocation();
  return { from: location.pathname + location.search };
}
