import sanitizeHtml from "sanitize-html";

const allowedClasses = new Set([
  "text-align-left",
  "text-align-center",
  "text-align-right",
  "text-align-justify",
  "image-size-small",
  "image-size-medium",
  "image-size-large",
  "image-size-full",
  "image-align-left",
  "image-align-center",
  "image-align-right",
]);

function sanitizeClassList(value: string) {
  return value
    .split(/\s+/)
    .filter((item) => allowedClasses.has(item))
    .join(" ");
}

export function sanitizeRichText(content: string) {
  return sanitizeHtml(content.trim(), {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "h2",
      "h3",
      "h4",
      "img",
    ],
    allowedAttributes: {
      p: ["class"],
      h2: ["class"],
      h3: ["class"],
      h4: ["class"],
      blockquote: ["class"],
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedClasses: {
      p: ["text-align-left", "text-align-center", "text-align-right", "text-align-justify"],
      h2: ["text-align-left", "text-align-center", "text-align-right", "text-align-justify"],
      h3: ["text-align-left", "text-align-center", "text-align-right", "text-align-justify"],
      h4: ["text-align-left", "text-align-center", "text-align-right", "text-align-justify"],
      blockquote: ["text-align-left", "text-align-center", "text-align-right", "text-align-justify"],
      img: [
        "image-size-small",
        "image-size-medium",
        "image-size-large",
        "image-size-full",
        "image-align-left",
        "image-align-center",
        "image-align-right",
      ],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          class: sanitizeClassList(attribs.class ?? ""),
        },
      }),
    },
  });
}
