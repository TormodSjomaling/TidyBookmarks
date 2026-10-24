// Sample data for the `npm run dev:web` browser preview: loose bookmarks on
// both roots, and folders nested up to three levels deep.
import type { BookmarkNode, FolderMetaMap } from "../lib/types";

let nextId = 100;
const bookmark = (title: string, url: string): BookmarkNode => ({ id: String(nextId++), title, url });
const folder = (title: string, children: BookmarkNode[]): BookmarkNode => ({ id: String(nextId++), title, children });

export const sampleRoots: BookmarkNode[] = [
  {
    id: "1",
    title: "Bookmarks bar",
    children: [
      bookmark("Google", "https://www.google.com/"),
      bookmark("GitHub", "https://github.com/"),
      bookmark("YouTube", "https://www.youtube.com/"),
      folder("Work", [
        bookmark("Jira", "https://jira.example.com/"),
        bookmark("Confluence", "https://confluence.example.com/"),
        bookmark("Calendar", "https://calendar.example.com/"),
        folder("Clients", [
          folder("Acme Corp", [
            bookmark("Acme staging", "https://staging.acme.example/"),
            bookmark("Acme admin", "https://admin.acme.example/"),
            folder("Docs", [
              bookmark("API reference", "https://docs.acme.example/api"),
              bookmark("Runbook", "https://docs.acme.example/runbook"),
              bookmark("Architecture", "https://docs.acme.example/architecture"),
            ]),
          ]),
          folder("Globex", [
            bookmark("Globex dashboard", "https://dashboard.globex.example/"),
            folder("Environments", [
              bookmark("Dev", "https://dev.globex.example/"),
              bookmark("Test", "https://test.globex.example/"),
              bookmark("Prod", "https://globex.example/"),
            ]),
          ]),
          folder("Initech", [
            bookmark("Initech portal", "https://portal.initech.example/"),
            bookmark("TPS reports", "https://tps.initech.example/"),
          ]),
          folder("Umbrella", [bookmark("Umbrella intranet", "https://intranet.umbrella.example/")]),
        ]),
        folder("Tools", [
          bookmark("Figma", "https://www.figma.com/"),
          bookmark("Vercel", "https://vercel.com/"),
          bookmark("Sentry", "https://sentry.io/"),
        ]),
      ]),
      folder("Personal", [
        bookmark("Bank", "https://bank.example.com/"),
        folder("Recipes", [
          bookmark("Carbonara", "https://recipes.example.com/carbonara"),
          bookmark("Green curry", "https://recipes.example.com/green-curry"),
        ]),
        folder("Travel", [
          folder("Japan", [
            bookmark("Rail pass", "https://japanrail.example/"),
            bookmark("Kyoto hotels", "https://hotels.example.com/kyoto"),
          ]),
          bookmark("Flights", "https://flights.example.com/"),
        ]),
      ]),
      folder("Old side project", [bookmark("Project board", "https://board.example.com/side-project")]),
    ],
  },
  {
    id: "2",
    title: "Other bookmarks",
    children: [
      bookmark("LinkedIn", "https://www.linkedin.com/"),
      folder("Reading", [
        bookmark("Hacker News", "https://news.ycombinator.com/"),
        bookmark("Lobsters", "https://lobste.rs/"),
        folder("Blogs", [
          bookmark("Overreacted", "https://overreacted.io/"),
          bookmark("Julia Evans", "https://jvns.ca/"),
        ]),
      ]),
    ],
  },
];

const idOf = (title: string, nodes: BookmarkNode[] = sampleRoots): string | undefined => {
  for (const node of nodes) {
    if (node.title === title) return node.id;
    const hit = idOf(title, node.children ?? []);
    if (hit) return hit;
  }
  return undefined;
};

// Two archived clients (shown as an "N archived" summary) and one lone
// archived folder at the top level.
export const sampleFolderMeta: FolderMetaMap = {
  [idOf("Initech")!]: { archived: true, collapsed: true, lastArchivedAt: 1_700_000_000_000 },
  [idOf("Umbrella")!]: { archived: true, collapsed: true, lastArchivedAt: 1_710_000_000_000 },
  [idOf("Old side project")!]: { archived: true, collapsed: true, lastArchivedAt: 1_720_000_000_000 },
};
