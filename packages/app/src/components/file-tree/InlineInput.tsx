import { useCallback, useEffect, useRef } from "react";

interface InlineInputProps {
  depth: number;
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InlineInput({ depth, initialValue, onConfirm, onCancel }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    // Delay focus to avoid React 18 StrictMode double-mount blur issue
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleDone = useCallback(
    (value: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (value.trim()) {
        onConfirm(value.trim());
      } else {
        onCancel();
      }
    },
    [onConfirm, onCancel],
  );

  return (
    <div style={{ paddingLeft: `${8 + depth * 16}px` }}>
      <input
        ref={inputRef}
        className="file-tree-inline-input"
        defaultValue={initialValue}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleDone((e.target as HTMLInputElement).value);
          } else if (e.key === "Escape") {
            if (!handledRef.current) {
              handledRef.current = true;
              onCancel();
            }
          }
        }}
        onBlur={(e) => handleDone(e.target.value)}
      />
    </div>
  );
}
