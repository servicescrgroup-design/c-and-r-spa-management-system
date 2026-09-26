"use client";

import { useEffect } from "react";
import { translateText } from "@/lib/i18n/translate-text";

const ATTRIBUTES = ["placeholder", "aria-label", "title"];
const SKIP = "script,style,textarea,code,pre,[data-no-translate],[translate='no']";

/**
 * Shows the staff side in Thai without touching each page: after React
 * renders, it swaps every English text node, placeholder and label that has
 * a Thai entry, and keeps doing so as the page updates. React owns the DOM
 * structure; this only changes text values, so it never conflicts with
 * rendering. Inputs and textareas are left alone so typed data isn't
 * altered.
 */
export function AutoTranslate({ locale }: { locale: "en" | "th" }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    if (locale !== "th") return;

    const skipped = (el: Element | null) => !el || Boolean(el.closest(SKIP));

    const translateNode = (node: Text) => {
      if (skipped(node.parentElement)) return;
      const value = node.nodeValue ?? "";
      const out = translateText(value);
      if (out !== null && out !== value) node.nodeValue = out;
    };

    const translateAttributes = (el: Element) => {
      if (skipped(el)) return;
      for (const name of ATTRIBUTES) {
        const value = el.getAttribute(name);
        if (!value) continue;
        const out = translateText(value);
        if (out !== null && out !== value) el.setAttribute(name, out);
      }
    };

    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return translateNode(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      translateAttributes(root as Element);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) translateNode(node as Text);
        else translateAttributes(node as Element);
        node = walker.nextNode();
      }
    };

    walk(document.body);
    document.querySelectorAll("[data-i18n-pending]").forEach((el) => el.removeAttribute("data-i18n-pending"));

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData") translateNode(m.target as Text);
        else if (m.type === "attributes") translateAttributes(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });

    // Browser dialogs (delete confirmations etc.) don't go through the DOM.
    const originalConfirm = window.confirm;
    const originalAlert = window.alert;
    window.confirm = (message?: string) => originalConfirm.call(window, message ? (translateText(message) ?? message) : message);
    window.alert = (message?: string) => originalAlert.call(window, message ? (translateText(message) ?? message) : message);

    return () => {
      observer.disconnect();
      window.confirm = originalConfirm;
      window.alert = originalAlert;
    };
  }, [locale]);

  return null;
}
