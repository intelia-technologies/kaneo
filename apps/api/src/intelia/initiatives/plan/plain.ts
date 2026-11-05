// MF-02 (software-factory): a task's description opens with a paragraph
// «**En llano.** …» that explains it to a person without context, then a
// blank line. Older tasks may lack it.
const MARKER = "**En llano.**";
// The gateway caps the paragraph at 600 characters; older text is cut there.
const MAX_CHARS = 600;

/** The «en llano» paragraph of a description, without its marker; or null. */
export function plainParagraph(description: string | null): string | null {
  const text = (description ?? "").replace(/\r\n/g, "\n").trimStart();
  if (!text.startsWith(MARKER)) return null;
  const paragraph = text
    .slice(MARKER.length)
    .split(/\n\s*\n/)[0]!
    .trim();
  if (paragraph === "") return null;
  return paragraph.length > MAX_CHARS
    ? `${paragraph.slice(0, MAX_CHARS - 1).trimEnd()}…`
    : paragraph;
}
