/* eslint-disable quotes */
const { JSDOM } = require("jsdom");
const xss = require("xss");
const { escapeAttrValue } = xss;

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (err) {
    return false;
  }
}
const xssOptions = {
  whiteList: {
    // Allow all tags that are allowed by Mantine-RichTextEditor
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
    h4: ["style"],
    h5: ["style"],
    h6: ["style"],
    hr: ["style"],
    p: ["style"],
    span: ["style"],
    a: ["href", "target", "rel", "style"],
    img: ["src", "alt", "title", "width", "height", "style"],
    ul: ["style"],
    ol: ["style"],
    li: ["style"],
    blockquote: ["style"],
    code: ["style"],
    pre: ["style"],
    table: ["style", "border", "cellpadding", "cellspacing"],
    thead: ["style"],
    tbody: ["style"],
    tfoot: ["style"],
    tr: ["class", "style"],
    td: ["class", "style", "colspan", "rowspan", "align", "valign"],
    th: ["class", "style", "colspan", "rowspan", "align", "valign"],
    caption: ["style"],
    strong: ["style"],
    em: ["style"],
    u: ["style"],
    s: ["style"],
    sup: ["style"],
    sub: ["style"],
    mark: ["style"],
    del: ["style"],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script"],
  onTagAttr(tag, name, value) {
    if (name === "href" && !isValidUrl(value)) {
      return `${name}=""`;
    }
    if (["style", "class"].indexOf(name) !== -1) {
      if (
        value.toLowerCase().includes("position:absolute") ||
        value.toLowerCase().includes("position:fixed")
      ) {
        return `${name}=""`;
      }
    }
    return `${name}="${escapeAttrValue(value)}"`;
  },
};

function sanitizeTemplate(template = "") {
  const sanitized = xss(template, xssOptions);
  return sanitized;
}

function stripHtml(input = "") {
  // Check if input is a string
  if (typeof input !== "string") {
    console.error("Input is not a string");
    return input; // or handle the error in another way
  }

  // Replace HTML tags
  const strippedInput = input.replace(/<[^>]*>/g, "");
  return strippedInput;
}

exports.stripHtml = stripHtml;

exports.sanitizeTemplate = sanitizeTemplate;
