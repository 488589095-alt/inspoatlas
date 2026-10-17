import type { ReactNode, SVGProps } from "react";

export type WorkspaceIconName =
  | "add"
  | "analyze"
  | "archive"
  | "arrange"
  | "ask"
  | "chevron"
  | "close"
  | "connect"
  | "fit"
  | "folder"
  | "map"
  | "mic"
  | "note"
  | "redo"
  | "search"
  | "trash"
  | "undo"
  | "upload";

type WorkspaceIconProps = SVGProps<SVGSVGElement> & { name: WorkspaceIconName; size?: number };

const paths: Record<WorkspaceIconName, ReactNode> = {
  add: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  analyze: <><path d="m12 3 1.8 6.7L20.5 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" /><path d="m18.2 3 .6 2.2L21 6l-2.2.8-.6 2.2L17.4 6l-2.2-.8 2.2-.8.8-2.2Z" /></>,
  archive: <><path d="M4 5.5h16v13H4z" /><path d="M8 5.5V3.5h8v2" /><path d="M8 10h8" /><path d="M10 14h4" /></>,
  arrange: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 17h6" /><path d="M17 14v6" /></>,
  ask: <><path d="M5 5.5h14v10H10l-5 4v-14Z" /><path d="M8.5 10.5h7" /></>,
  chevron: <path d="m9 5 6 7-6 7" />,
  close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  connect: <><path d="M8 8h-1.5A3.5 3.5 0 0 0 3 11.5v1A3.5 3.5 0 0 0 6.5 16H8" /><path d="M16 8h1.5a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1-3.5 3.5H16" /><path d="M8 12h8" /></>,
  fit: <><path d="M8 4H4v4" /><path d="M16 4h4v4" /><path d="M20 16v4h-4" /><path d="M4 16v4h4" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  folder: <><path d="M3.5 6.5h6l1.5 2H20.5v10H3.5z" /><path d="M3.5 6.5v-2h5l1 2" /></>,
  map: <><path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" /><path d="M9 4v14" /><path d="M15 6v14" /></>,
  mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" /><path d="M8.5 21h7" /></>,
  note: <><path d="M5 3.5h10l4 4v13H5z" /><path d="M15 3.5v4h4" /><path d="M8.5 12h7" /><path d="M8.5 15.5h5" /></>,
  redo: <><path d="M18 7h-7a6 6 0 1 0 5.2 9" /><path d="m18 7-3-3" /><path d="m18 7-3 3" /></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
  trash: <><path d="M4.5 7h15" /><path d="M9 7V4.5h6V7" /><path d="m6.5 7 .8 13h9.4l.8-13" /><path d="M10 10.5v5.5" /><path d="M14 10.5v5.5" /></>,
  undo: <><path d="M6 7h7a6 6 0 1 1-5.2 9" /><path d="m6 7 3-3" /><path d="m6 7 3 3" /></>,
  upload: <><path d="M12 15V4" /><path d="m8 8 4-4 4 4" /><path d="M5 14v5h14v-5" /></>,
};

export function WorkspaceIcon({ name, size = 18, className, ...props }: WorkspaceIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.65}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
