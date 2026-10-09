import type { ReactNode } from "react";

/**
 * Splits a heading into lines that can be revealed one at a time.
 *
 * The effect is the most persuasive piece of motion on a page like this: each
 * line sits inside its own clipping box and rises from underneath, so the
 * type reads as being uncovered rather than flown in.
 *
 * Three things make this version safe to use on a marketing site, and all
 * three are usually got wrong.
 *
 * **The text stays real text.** The lines are decided here, on the server,
 * from a written array — not by measuring the rendered heading in the
 * browser and chopping it up. Nothing is injected after paint, so there is no
 * flash of unstyled heading and no layout shift.
 *
 * **A screen reader hears one heading.** The visible spans are hidden from
 * the accessibility tree and the whole phrase is exposed once, so the
 * heading is announced as "A cleaning company built around evidence, not
 * promises" rather than as three unrelated fragments.
 *
 * **It degrades to nothing.** The clipping and the transform live inside a
 * `prefers-reduced-motion: no-preference` block. With motion reduced, or
 * with JavaScript disabled, every line is simply visible in its normal
 * position; the markup needs no repair.
 */
export function Lines({
  lines,
  spoken,
  className,
  as: Tag = "span",
}: {
  /** One entry per visual line. Keep them short enough not to wrap. */
  lines: ReactNode[];
  /**
   * The whole heading as one phrase, for screen readers.
   *
   * Required whenever any line contains markup rather than plain text,
   * because markup cannot be flattened to a sentence reliably from here.
   * Omit it only when every line is a plain string.
   */
  spoken?: string;
  className?: string;
  as?: "span" | "div";
}) {
  const everyLineIsText = lines.every((line) => typeof line === "string");

  const phrase =
    spoken ??
    (everyLineIsText
      ? lines.join(" ").replace(/\s+/g, " ").trim()
      : null);

  /*
   * The visible lines are hidden from the accessibility tree ONLY when there
   * is a complete phrase to read in their place.
   *
   * The first version derived that phrase by keeping the plain-text lines and
   * discarding any line containing markup, which silently dropped words: the
   * hero's middle line is emphasised, so a screen reader was read "A cleaning
   * company not promises." The heading had lost the word the sentence turns
   * on, and nothing said so. Now a heading with markup and no `spoken` simply
   * leaves its visible lines readable - slightly choppier, but complete.
   */
  const hideVisibleLines = phrase !== null;

  return (
    <Tag
      className={["lines", className].filter(Boolean).join(" ")}
      data-reveal="lines"
    >
      {phrase && <span className="sr-only">{phrase}</span>}
      {lines.map((line, index) => (
        <span
          className="line"
          key={index}
          aria-hidden={hideVisibleLines ? true : undefined}
        >
          <span>{line}</span>
        </span>
      ))}
    </Tag>
  );
}
