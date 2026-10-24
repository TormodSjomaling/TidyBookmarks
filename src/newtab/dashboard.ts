import { createContext, useContext, type MutableRefObject } from "react";
import type { DragUnit } from "../lib/dnd";
import type { ParentMap } from "../lib/tree";
import type { FolderMetaMap, Settings } from "../lib/types";
import type { UpdateFolderMeta } from "./hooks";

export interface Dashboard {
  folderMeta: FolderMetaMap;
  updateFolderMeta: UpdateFolderMeta;
  settings: Settings;
  // Normalized search query; empty when not searching. While non-empty,
  // archived styling, collapse toggling and drag-and-drop are all disabled.
  query: string;
  parents: ParentMap;
  // The item currently being dragged, if any. A ref rather than state: it's
  // read synchronously by dragover handlers and never drives rendering.
  dragged: MutableRefObject<DragUnit | null>;
  // While searching, the matching bookmark Enter would open; arrow keys move it.
  activeResultId: string | null;
}

export const DashboardContext = createContext<Dashboard | null>(null);

export function useDashboard(): Dashboard {
  const dashboard = useContext(DashboardContext);
  if (!dashboard) throw new Error("useDashboard must be used inside DashboardContext");
  return dashboard;
}

export function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}
