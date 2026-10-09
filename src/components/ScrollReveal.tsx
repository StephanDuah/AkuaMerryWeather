"use client";

import { useEffect } from "react";

/**
 * Scroll-reveal driver.
 *
 * One IntersectionObserver for the whole page, watching anything marked
 * `data-reveal`. Elements are revealed once and then unobserved, so nothing
 * animates twice and nothing keeps running as the visitor scrolls.
 *
 * The actual motion lives in CSS, inside a `prefers-reduced-motion:
 * no-preference` block. If a visitor has asked for reduced motion, or if
 * JavaScript never runs, the content is fully visible either way - the CSS
 * only hides elements when motion is welcome, and this script marks
 * everything visible immediately in that case.
 */
export function ScrollReveal() {
  useEffect(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"),
    );
    if (targets.length === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      targets.forEach((element) => element.classList.add("is-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      // Start a little before the element arrives, so it has settled by the
      // time it is properly in view.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    targets.forEach((element) => observer.observe(element));

    // A second failsafe alongside the CSS one: if anything is still hidden
    // after two and a half seconds, show it. Cheaper than diagnosing why an
    // observer did not fire on someone else's device.
    const rescue = window.setTimeout(() => {
      for (const element of targets) element.classList.add("is-in");
    }, 2500);

    // Anything already on screen at load should not wait for a scroll.
    requestAnimationFrame(() => {
      targets.forEach((element) => {
        const box = element.getBoundingClientRect();
        if (box.top < window.innerHeight * 0.92) {
          element.classList.add("is-in");
          observer.unobserve(element);
        }
      });
    });

    return () => {
      window.clearTimeout(rescue);
      observer.disconnect();
    };
  }, []);

  return null;
}
