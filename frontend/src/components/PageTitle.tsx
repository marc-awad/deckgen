import { useEffect } from "react";

interface PageTitleProps {
  title: string;
}

// Main heading of a page, also used as the browser tab title
export function PageTitle({ title }: PageTitleProps) {
  useEffect(() => {
    document.title = `${title} · deckgen`;
  }, [title]);

  return (
    // tabIndex={-1}: focusable by the layout on each page change, but not with Tab
    <h1 tabIndex={-1} className="text-2xl font-bold break-words focus:outline-none">
      {title}
    </h1>
  );
}
