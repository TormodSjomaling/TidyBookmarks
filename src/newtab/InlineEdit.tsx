import { useEffect, useRef } from "react";

interface Props {
  initialValue: string;
  className: string;
  // Called with the trimmed value on Enter or blur.
  onCommit: (value: string) => void;
  // Called on Escape.
  onCancel: () => void;
}

// A text input that replaces a title in place while renaming. Focuses and
// selects its contents on mount.
export function InlineEdit({ initialValue, className, onCommit, onCancel }: Props) {
  const input = useRef<HTMLInputElement>(null);
  // Enter/Escape unmount the input, and Chrome fires blur on a focused element
  // as it's removed. Without this guard that blur would commit a second time,
  // or commit the edit that Escape just cancelled.
  const finished = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit) onCommit(input.current?.value.trim() ?? "");
    else onCancel();
  };

  return (
    <input
      ref={input}
      type="text"
      className={className}
      defaultValue={initialValue}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
