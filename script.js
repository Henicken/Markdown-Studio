// ------------------------------------------
// 1. Get the elements we need from the page
// ------------------------------------------

const markdownInput = document.getElementById("markdown-input");
const htmlOutput = document.getElementById("html-output");
const preview = document.getElementById("preview");

const characterCount = document.getElementById("character-count");
const wordCount = document.getElementById("word-count");
const lineCount = document.getElementById("line-count");

const clearButton = document.getElementById("clear-btn");
const copyButton = document.getElementById("copy-html-btn");
const statusMessage = document.getElementById("status-message");


// ------------------------------------------
// 2. Convert special characters into HTML-safe text
// ------------------------------------------

function escapeHTML(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


// ------------------------------------------
// 3. Handle inline Markdown formatting
// ------------------------------------------

function convertInlineMarkdown(text) {
  // Preserve escaped Markdown characters so they remain literal.
  const escapedCharacters = [];

  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, (match, character) => {
    const placeholder = `MARKDOWNESCAPE${escapedCharacters.length}END`;

    escapedCharacters.push(character);

    return placeholder;
  });

  // Escape HTML before adding our own HTML elements.
  let html = escapeHTML(text);

  // Images must be converted before links.
  // Otherwise, an image could be mistaken for a normal link.
  html = html.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|[^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (match, alt, src, title) => {
      const safeTitle = title ? ` title="${title}"` : "";

      return `<img src="${src}" alt="${alt}"${safeTitle}>`;
    }
  );

  // Links: [text](https://example.com)
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|[^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (match, label, url, title) => {
      const safeTitle = title ? ` title="${title}"` : "";

      return `<a href="${url}"${safeTitle}>${label}</a>`;
    }
  );

  // Email addresses written inside angle brackets.
  html = html.replace(
    /&lt;([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})&gt;/gi,
    '<a href="mailto:$1">$1</a>'
  );

  // URLs that are written without Markdown link syntax.
  html = html.replace(
    /(^|\s)(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
    '$1<a href="$2">$2</a>'
  );

  // Bold text using double asterisks.
  html = html.replace(
    /\*\*(?=\S)(.+?)(?<=\S)\*\*/g,
    "<strong>$1</strong>"
  );

  // Bold text using double underscores.
  html = html.replace(
    /__(?=\S)(.+?)(?<=\S)__/g,
    "<strong>$1</strong>"
  );

  // Handle a common nested case such as:
  // **this is a *quote***
  html = html.replace(
    /\*\*(.*?)\*(.*?)\*\*\*/g,
    "<strong>$1<em>$2</em></strong>"
  );

  // Italic text using asterisks.
  html = html.replace(
    /(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g,
    "$1<em>$2</em>"
  );

  // Italic text using underscores.
  html = html.replace(
    /(^|[^_])_(?!\s)(.+?)(?<!\s)_(?!_)/g,
    "$1<em>$2</em>"
  );

  // Strikethrough: ~~removed text~~
  html = html.replace(
    /~~(?=\S)(.+?)(?<=\S)~~/g,
    "<del>$1</del>"
  );

  // Inline code: `const answer = 42`
  // Protect its contents from later formatting.
  const inlineCode = [];

  html = html.replace(/`([^`]+)`/g, (match, code) => {
    const placeholder = `INLINECODE${inlineCode.length}END`;

    inlineCode.push(`<code>${code}</code>`);

    return placeholder;
  });

  // Restore inline code after formatting.
  html = html.replace(
    /INLINECODE(\d+)END/g,
    (match, index) => inlineCode[Number(index)]
  );

  // Restore escaped Markdown characters.
  html = html.replace(
    /MARKDOWNESCAPE(\d+)END/g,
    (match, index) => escapeHTML(escapedCharacters[Number(index)])
  );

  return html;
}


// ------------------------------------------
// 4. Convert a Markdown table into HTML
// ------------------------------------------

function convertTable(lines) {
  const rows = lines.map((line) => {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  });

  if (rows.length < 2) {
    return null;
  }

  // A Markdown separator row contains dashes and optional colons.
  const separatorPattern = /^:?-{3,}:?$/;

  const separatorRow = rows[1];

  const isSeparator = separatorRow.every((cell) => {
    return separatorPattern.test(cell);
  });

  if (!isSeparator) {
    return null;
  }

  const headings = rows[0];

  const headerHTML = headings
    .map((cell) => `<th>${convertInlineMarkdown(cell)}</th>`)
    .join("");

  const bodyHTML = rows
    .slice(2)
    .map((row) => {
      const cells = headings.map((heading, index) => {
        const cell = row[index] || "";

        return `<td>${convertInlineMarkdown(cell)}</td>`;
      });

      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${headerHTML}</tr></thead><tbody>${bodyHTML}</tbody></table>`;
}


// ------------------------------------------
// 5. Convert Markdown into HTML
// ------------------------------------------

function convertMarkdown() {
  const markdownText = markdownInput.value;

  if (!markdownText.trim()) {
    return "";
  }

  // Keep fenced code blocks safe from other Markdown rules.
  const codeBlocks = [];

  let text = markdownText.replace(
    /^```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm,
    (match, language, code) => {
      const className = language
        ? ` class="language-${language}"`
        : "";

      const codeHTML =
        `<pre><code${className}>${escapeHTML(code.replace(/\n$/, ""))}</code></pre>`;

      const placeholder = `CODEBLOCK${codeBlocks.length}END`;

      codeBlocks.push(codeHTML);

      return placeholder;
    }
  );

  // Normalize Windows and Unix line endings.
  text = text.replace(/\r\n?/g, "\n");

  const lines = text.split("\n");
  const output = [];

  let paragraph = [];
  let listItems = [];
  let listType = null;

  // Add any text we've collected as a paragraph.
  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }

    const content = paragraph
      .map((line) => convertInlineMarkdown(line))
      .join("<br>\n");

    output.push(`<p>${content}</p>`);

    paragraph = [];
  }

  // Finish the current list before starting another block.
  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    const itemsHTML = listItems
      .map((item) => `<li>${convertInlineMarkdown(item)}</li>`)
      .join("\n");

    output.push(`<${listType}>\n${itemsHTML}\n</${listType}>`);

    listItems = [];
    listType = null;
  }

  // Process the document one line at a time.
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    // Empty lines separate Markdown blocks.
    if (/^\s*$/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }

    // Restore fenced code blocks.
    const codeMatch = line.match(/^CODEBLOCK(\d+)END$/);

    if (codeMatch) {
      flushParagraph();
      flushList();

      output.push(line);

      continue;
    }

    // Headings: # through ######.
    const headingMatch = line.match(/^(#{1,6})[ \t]+(.+?)\s*#*\s*$/);

    if (headingMatch) {
      flushParagraph();
      flushList();

      const level = headingMatch[1].length;
      const content = convertInlineMarkdown(headingMatch[2]);

      output.push(`<h${level}>${content}</h${level}>`);

      continue;
    }

    // Horizontal rules: ---, ***, or ___.
    if (/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/.test(line)) {
      flushParagraph();
      flushList();

      output.push("<hr>");

      continue;
    }

    // Blockquotes: > A quotation
    const quoteMatch = line.match(/^[ \t]*>[ \t]?(.*)$/);

    if (quoteMatch) {
      flushParagraph();
      flushList();

      const quoteText = convertInlineMarkdown(quoteMatch[1]);

      output.push(`<blockquote>${quoteText}</blockquote>`);

      continue;
    }

    // Task lists: - [ ] or - [x]
    const taskMatch = line.match(
      /^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]+(.*)$/
    );

    if (taskMatch) {
      flushParagraph();

      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }

      const checked = taskMatch[1].toLowerCase() === "x";

      const checkbox = checked
        ? '<input type="checkbox" checked disabled>'
        : '<input type="checkbox" disabled>';

      listItems.push(`${checkbox}${convertInlineMarkdown(taskMatch[2])}`);

      continue;
    }

    // Unordered lists: - item, * item, or + item.
    const unorderedMatch = line.match(/^[ \t]*[-*+][ \t]+(.+)$/);

    if (unorderedMatch) {
      flushParagraph();

      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }

      listItems.push(unorderedMatch[1]);

      continue;
    }

    // Ordered lists: 1. item or 2. item.
    const orderedMatch = line.match(/^[ \t]*\d+[.)][ \t]+(.+)$/);

    if (orderedMatch) {
      flushParagraph();

      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }

      listItems.push(orderedMatch[1]);

      continue;
    }

    // Tables: collect consecutive lines containing pipes.
    if (line.includes("|") && index + 1 < lines.length) {
      const tableLines = [line];

      let nextIndex = index + 1;

      while (
        nextIndex < lines.length &&
        lines[nextIndex].includes("|") &&
        !/^\s*$/.test(lines[nextIndex])
      ) {
        tableLines.push(lines[nextIndex]);
        nextIndex++;
      }

      const tableHTML = convertTable(tableLines);

      if (tableHTML) {
        flushParagraph();
        flushList();

        output.push(tableHTML);

        index = nextIndex - 1;

        continue;
      }
    }

    // Anything else belongs to the current paragraph.
    flushList();
    paragraph.push(line);
  }

  // Finish anything left after the final line.
  flushParagraph();
  flushList();

  let html = output.join("\n");

  // Restore fenced code blocks after converting the other content.
  html = html.replace(
    /CODEBLOCK(\d+)END/g,
    (match, index) => codeBlocks[Number(index)]
  );

  return html;
}


// ------------------------------------------
// 6. Update the page while the user types
// ------------------------------------------

function updatePreview() {
  const markdown = markdownInput.value;
  const html = convertMarkdown();

  // Show HTML as text in the output panel.
  htmlOutput.textContent = html;

  // Render the generated HTML in the preview panel.
  preview.innerHTML = html;

  // Update editor statistics.
  characterCount.textContent =
    `${markdown.length} ${markdown.length === 1 ? "character" : "characters"}`;

  const words = markdown.trim()
    ? markdown.trim().split(/\s+/).length
    : 0;

  wordCount.textContent =
    `${words} ${words === 1 ? "word" : "words"}`;

  const lines = markdown ? markdown.split(/\r\n?|\n/).length : 0;

  lineCount.textContent =
    `${lines} ${lines === 1 ? "line" : "lines"}`;
}


// ------------------------------------------
// 7. Clear the editor
// ------------------------------------------

clearButton.addEventListener("click", () => {
  markdownInput.value = "";

  updatePreview();

  statusMessage.textContent = "Editor cleared.";

  markdownInput.focus();
});


// ------------------------------------------
// 8. Copy the generated HTML
// ------------------------------------------

copyButton.addEventListener("click", async () => {
  const html = htmlOutput.textContent;

  if (!html.trim()) {
    statusMessage.textContent = "There is no HTML to copy yet.";
    return;
  }

  try {
    await navigator.clipboard.writeText(html);

    statusMessage.textContent = "HTML copied to your clipboard.";
  } catch (error) {
    // Clipboard access may be blocked in some browser contexts.
    statusMessage.textContent =
      "Copy failed. Select the HTML output and copy it manually.";
  }
});


// ------------------------------------------
// 9. Connect the editor to the live preview
// ------------------------------------------

markdownInput.addEventListener("input", updatePreview);


// ------------------------------------------
// 10. Show the initial example immediately
// ------------------------------------------

updatePreview();