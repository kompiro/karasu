/**
 * Where visitors leave feedback: a new discussion in the "Feedback" category of
 * GitHub Discussions (#3689). `category=` preselects the category, and GitHub
 * shows its form only when `.github/DISCUSSION_TEMPLATE/<slug>.yml` has the same
 * slug, so a test keeps the two together.
 */
export const FEEDBACK_CATEGORY_SLUG = "feedback";

export const FEEDBACK_DISCUSSION_URL = `https://github.com/kompiro/karasu/discussions/new?category=${FEEDBACK_CATEGORY_SLUG}`;
