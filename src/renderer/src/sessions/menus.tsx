import { type MouseEvent, useState } from "react";
import type { Project, SessionRow } from "#protocol";
import { actions } from "#renderer/actions";
import { Icon } from "#renderer/ui/Icon";
import { Menu, type MenuItem, type MenuState } from "#renderer/ui/Menu";
import { DeleteDialog } from "./DeleteDialog";
import { RenameDialog } from "./RenameDialog";

/**
 * Board 2a and 2f: the session and project menus, with their rename and delete dialogs.
 * Used by the sidebar and the All sessions screen. Render `ui` once.
 */
export function useSessionMenus() {
  const [menu, setMenu] = useState<MenuState>();
  const [renaming, setRenaming] = useState<SessionRow>();
  const [deleting, setDeleting] = useState<SessionRow>();

  const sessionItems = (s: SessionRow): MenuItem[] => [
    { label: "Open", icon: <Icon name="external" />, shortcut: "↵", onSelect: () => actions.open(s.cwd, s.path) },
    { label: "Rename…", icon: <Icon name="pencil" />, shortcut: "R", onSelect: () => setRenaming(s) },
    { label: "Fork…", icon: <Icon name="branch" />, shortcut: "F", onSelect: () => actions.openTree(s.cwd, s.path) }, // pick the point in the tree
    { label: "Clone", icon: <Icon name="copy" />, shortcut: "C", onSelect: () => actions.clone(s.cwd, s.path) },
    "sep",
    { label: "Export as HTML", icon: <Icon name="download" />, shortcut: "E", onSelect: () => actions.exportHtml(s.cwd, s.path, s.title) },
    { label: "Share link", icon: <Icon name="link" />, shortcut: "S", disabled: true, onSelect: () => {} }, // uploads the session: not built yet
    { label: "Show in folder", icon: <Icon name="folder" />, onSelect: () => actions.showInFolder(s.path) },
    "sep",
    { label: "Delete…", icon: <Icon name="trash" />, shortcut: "D", danger: true, onSelect: () => setDeleting(s) },
  ];

  const projectItems = (p: Project, sessions: number): MenuItem[] => [
    { label: "New session", icon: <Icon name="plus" />, shortcut: "N", onSelect: () => actions.open(p.cwd) },
    { label: "Show in folder", icon: <Icon name="folder" />, onSelect: () => actions.showInFolder(p.cwd) },
    "sep",
    { label: "Remove from list", icon: <Icon name="x" />, shortcut: "X", danger: true, disabled: sessions > 0, onSelect: () => actions.removeProject(p.cwd) },
    { note: "Only a project with no sessions can be removed. The folder stays on disk." },
  ];

  const at = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY });

  return {
    /** Right-click, or a "more" button (pass its bottom-left corner). */
    sessionMenu: (e: MouseEvent, s: SessionRow, point = at(e)) => {
      e.preventDefault();
      setMenu({ at: point, items: sessionItems(s), label: "Session actions" });
    },
    projectMenu: (e: MouseEvent, p: Project, sessions: number) => {
      e.preventDefault();
      setMenu({ at: at(e), items: projectItems(p, sessions), label: "Project actions" });
    },
    rename: setRenaming,
    remove: setDeleting,
    ui: (
      <>
        {menu && <Menu at={menu.at} items={menu.items} label={menu.label} width={230} onClose={() => setMenu(undefined)} />}
        {renaming && <RenameDialog session={renaming} onClose={() => setRenaming(undefined)} />}
        {deleting && <DeleteDialog session={deleting} onClose={() => setDeleting(undefined)} />}
      </>
    ),
  };
}
