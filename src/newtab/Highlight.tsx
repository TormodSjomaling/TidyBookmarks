import { splitMatches } from "../lib/tree";
import { useDashboard } from "./dashboard";

// `text` with the parts matching the current search marked.
export function Highlight({ text }: { text: string }) {
  const { query } = useDashboard();
  if (!query) return text;
  return splitMatches(text, query).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : part.text));
}
