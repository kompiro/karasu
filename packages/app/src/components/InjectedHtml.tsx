import { useMemo, type HTMLAttributes, type Ref } from "react";

type Common = Omit<HTMLAttributes<HTMLElement>, "children" | "dangerouslySetInnerHTML"> & {
  /** The markup to inject. Re-injected only when this string changes. */
  html: string;
};

export type InjectedHtmlProps =
  | (Common & { as?: "div"; ref?: Ref<HTMLDivElement> })
  | (Common & { as: "span"; ref?: never });

/**
 * The only place in the app that injects markup into the DOM (#2789, #2800).
 * Lint forbids `dangerouslySetInnerHTML`, `innerHTML` and friends everywhere
 * else, and only the files listed in `.oxlintrc.json` may import this
 * component, so a new surface that injects markup fails lint until it is
 * listed there.
 *
 * The `{ __html }` object is memoized on the string. react-dom 19.2 re-assigned
 * `innerHTML` whenever the object was a new one, without comparing the
 * string, so an inline literal re-parsed the markup on every render and threw
 * away any state a parent had applied to the injected nodes (#2789).
 * react-dom 19.3 compares the string first; the memo keeps this component
 * correct either way. The DOM is replaced exactly when `html` changes, so an
 * effect that applies state to the injected nodes lists `html` (the same
 * string) in its dependencies.
 */
export function InjectedHtml(props: InjectedHtmlProps) {
  const { html, as, ref, ...rest } = props;
  const inner = useMemo(() => ({ __html: html }), [html]);
  if (as === "span") return <span {...rest} dangerouslySetInnerHTML={inner} />;
  return <div {...rest} ref={ref} dangerouslySetInnerHTML={inner} />;
}
