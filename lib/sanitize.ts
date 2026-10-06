import * as React from "react";

// Allowed HTML tags for announcements and syllabus rich text
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "span",
]);

// Allowed attributes per tag
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  span: new Set(["class", "className"]),
  code: new Set(["class", "className"]),
  pre: new Set(["class", "className"]),
};

/**
 * Sanitizes rich text HTML by removing dangerous tags (<script>, <iframe>, <style>, etc.),
 * stripping dangerous attributes (all on* event handlers), and enforcing a strict whitelist
 * of safe formatting tags.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";

  // 1. Remove dangerous blocks completely (including their inner contents)
  let clean = dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, "")
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "");

  // 2. Parse tags and strip disallowed tags and attributes
  clean = clean.replace(/<\/?([a-zA-Z0-9]+)(\s+[^>]*)?\/?>/g, (match, rawTagName, rawAttrs) => {
    const tagName = rawTagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      // Disallowed tag -> strip tag completely
      return "";
    }

    const isClosing = match.startsWith("</");
    if (isClosing) {
      return `</${tagName}>`;
    }

    if (!rawAttrs) {
      return `<${tagName}>`;
    }

    // Parse attributes
    const allowedAttrsForTag = ALLOWED_ATTRS[tagName] || new Set();
    const cleanAttrs: string[] = [];

    // Extract attributes like name="value" or name='value'
    const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

      // NEVER allow event handlers
      if (attrName.startsWith("on")) {
        continue;
      }

      if (!allowedAttrsForTag.has(attrName)) {
        continue;
      }

      // Check URL attributes
      if (attrName === "href") {
        const trimmed = attrValue.trim().toLowerCase();
        // Disallow dangerous schemes like javascript:, data:, vbscript:
        if (
          trimmed.startsWith("javascript:") ||
          trimmed.startsWith("data:") ||
          trimmed.startsWith("vbscript:")
        ) {
          continue;
        }
        cleanAttrs.push(`href="${escapeAttr(attrValue)}"`);
      } else if (attrName === "target") {
        cleanAttrs.push('target="_blank"');
        cleanAttrs.push('rel="noopener noreferrer"');
      } else if (attrName === "title") {
        cleanAttrs.push(`title="${escapeAttr(attrValue)}"`);
      }
    }

    // If tag is <a> and target was not set, still ensure rel if target="_blank"
    if (tagName === "a" && cleanAttrs.some((a) => a.includes('target="_blank"'))) {
      if (!cleanAttrs.some((a) => a.includes("rel="))) {
        cleanAttrs.push('rel="noopener noreferrer"');
      }
    }

    const attrsString = cleanAttrs.length > 0 ? " " + cleanAttrs.join(" ") : "";
    return `<${tagName}${attrsString}>`;
  });

  return clean.trim();
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * SafeHtml component for rendering sanitized rich text.
 * Guarantees that unsafe markup like <script> is never rendered or executed.
 */
export function SafeHtml({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const sanitized = React.useMemo(() => sanitizeHtml(html), [html]);

  return React.createElement("div", {
    className,
    dangerouslySetInnerHTML: { __html: sanitized },
  });
}
