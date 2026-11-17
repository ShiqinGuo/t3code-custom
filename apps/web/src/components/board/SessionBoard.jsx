import R from "react";
import { createPortal } from "react-dom";
import { useRouter } from "@tanstack/react-router";
import { observeResize } from "../../lib/observeResize";
import { useProjects, useThreadShells } from "../../state/entities";
import { createNewThreadHandler } from "../../hooks/useHandleNewThread";
import { Select, SelectTrigger, SelectPopup, SelectItem } from "../ui/select";
import { NativeOutput } from "./NativeOutput";
import { ThreadMenu, ThreadTitleEditor } from "./ThreadMenu";
import { installBoardTheme } from "./theme";
import { columns, threadKey, projectKey, statusOf, groupThreads } from "./model";
import "./board.css";

const h = R.createElement;
const refOf = (t) => ({ environmentId: t.environmentId, threadId: t.id });
const keyOfRef = (ref) => (ref ? `${ref.environmentId}/${ref.threadId}` : "");
function currentRef(router) {
  const parts = router.state.location.pathname.split("/").filter(Boolean);
  return parts.length === 2 && !["draft", "settings", "threads"].includes(parts[0])
    ? { environmentId: decodeURIComponent(parts[0]), threadId: decodeURIComponent(parts[1]) }
    : null;
}
function Icon({ name, size = 15 }) {
  const paths = {
    expand: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5",
    restore: "M8 3v5H3 M16 3v5h5 M3 16h5v5 M21 16h-5v5",
    board: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    close: "m6 6 12 12 M6 18 18 6",
    arrow: "M7 17 17 7 M7 7h10v10",
    plus: "M12 5v14 M5 12h14",
    chevron: "m9 5 7 7-7 7",
    grip: "M8 4v.01 M16 4v.01 M8 12v.01 M16 12v.01 M8 20v.01 M16 20v.01",
    search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    message: "M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z",
  };
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    h("path", { d: paths[name] }),
  );
}
function Button({ icon, children, className = "", ...props }) {
  return h(
    "button",
    { type: "button", className: `t3b-button ${className}`, ...props },
    icon && h(Icon, { name: icon }),
    children,
  );
}
function BoardLauncher({ open, onClick }) {
  const [host, setHost] = R.useState(() => document.querySelector("[data-chat-header]"));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keeps the launcher portal attached to the native header as routes mount and unmount.
  R.useEffect(() => {
    let current = document.querySelector("[data-chat-header]");
    const update = () => {
      const next = document.querySelector("[data-chat-header]");
      if (next !== current) {
        current = next;
        setHost(next);
      }
    };
    setHost(current);
    const observer = new MutationObserver(update);
    observer.observe(document.querySelector("#root"), { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const button = h(
    Button,
    {
      className: `t3b-launcher text-xs${host ? "" : " is-floating"}`,
      icon: "board",
      title: "看板 · Alt+B",
      "aria-pressed": open,
      onClick,
    },
    "看板",
  );
  return host ? createPortal(button, host) : button;
}
function Picker({
  label,
  value,
  options,
  onChange,
  className = "",
  placeholder = label,
  disabled = false,
  onOptionContextMenu,
}) {
  const [popupOpen, setPopupOpen] = R.useState(false);
  return h(
    Select,
    {
      value,
      onValueChange: (v) => v != null && onChange(v),
      items: options,
      disabled,
      open: popupOpen,
      onOpenChange: setPopupOpen,
    },
    h(
      SelectTrigger,
      { "aria-label": label, size: "sm", className: `t3b-picker ${className}` },
      options.find((o) => o.value === value)?.label ?? placeholder,
    ),
    h(
      SelectPopup,
      { alignItemWithTrigger: false, className: "t3b-picker-list" },
      options.map((o) =>
        h(
          SelectItem,
          {
            key: o.value,
            value: o.value,
            onContextMenu: onOptionContextMenu
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPopupOpen(false);
                  onOptionContextMenu(o.value, event);
                }
              : undefined,
          },
          o.label,
        ),
      ),
    ),
  );
}

function ThreadCard({
  thread,
  selected,
  located,
  select,
  open,
  maximized,
  onMaximize,
  onContextMenu,
  renaming,
  onRenameDone,
}) {
  const card = R.useRef(null);
  const [visible, setVisible] = R.useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Tracks card visibility with the browser IntersectionObserver.
  R.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { rootMargin: "120px" },
    );
    observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  const state = statusOf(thread),
    time = new Date(thread.updatedAt);
  return h(
    "article",
    {
      ref: card,
      tabIndex: -1,
      className: `t3b-card ${selected ? "is-selected" : ""} ${located ? "is-located" : ""} ${maximized ? "is-maximized" : ""}`,
      "data-thread-id": thread.id,
      "data-thread-key": threadKey(thread),
      "data-state": state.column,
      onContextMenu: (event) => {
        if (!event.target.closest(".t3b-output,input")) {
          event.preventDefault();
          event.stopPropagation();
          onContextMenu(thread, event);
        }
      },
      onKeyDown: (event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
        ) {
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          onContextMenu(thread, { clientX: box.left, clientY: box.top + 36 });
        }
      },
    },
    h(
      "div",
      { className: "t3b-card-top" },
      renaming
        ? h(ThreadTitleEditor, { thread, onDone: onRenameDone })
        : h(
            "button",
            { className: "t3b-card-title", onClick: () => select(thread), title: thread.title },
            thread.title || "新会话",
          ),
      h(Button, {
        icon: maximized ? "restore" : "expand",
        className: "t3b-icon",
        "aria-label": `${maximized ? "还原" : "放大"}会话：${thread.title}`,
        title: maximized ? "还原" : "放大",
        onClick: onMaximize,
      }),
      h(Button, {
        icon: "arrow",
        className: "t3b-icon",
        "aria-label": `打开会话：${thread.title}`,
        onClick: () => open(thread),
      }),
    ),
    h(
      "div",
      { className: "t3b-card-meta" },
      h("span", { className: "t3b-status", "data-state": state.column }, h("i"), state.label),
      h(
        "time",
        { dateTime: thread.updatedAt, title: time.toLocaleString() },
        time.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) +
          " " +
          time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
      ),
    ),
    h(
      "div",
      { className: "t3b-output", "aria-label": `${thread.title}的输出` },
      h(NativeOutput, { thread, visible, open }),
    ),
    h(
      "div",
      { className: "t3b-card-footer" },
      h(
        "span",
        { title: thread.modelSelection?.model },
        [thread.modelSelection?.model ?? thread.providerInstanceId, thread.branch]
          .filter(Boolean)
          .join(" · "),
      ),
      h(
        Button,
        {
          icon: "message",
          onClick: () => select(thread),
          className: "t3b-reply",
          "aria-label": `回复：${thread.title}`,
        },
        selected ? "已选择" : "回复",
      ),
    ),
  );
}

function NativeComposer({ router, threads, selected, onSelect, visible, onClose }) {
  const header = R.useRef(null);
  const [position, setPosition] = R.useState(null),
    [width, setWidth] = R.useState(540),
    [height, setHeight] = R.useState(150);
  const correctTarget = selected
    ? keyOfRef(currentRef(router)) === selected
    : router.state.location.pathname.startsWith("/draft/");
  const available = visible && correctTarget;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Positions the existing native composer using document CSS variables.
  R.useLayoutEffect(() => {
    const root = document.documentElement,
      w = Math.min(width, innerWidth - 32);
    const x = position?.x ?? innerWidth - w - 20,
      y = position?.y ?? innerHeight - height - 68;
    root.dataset.t3BoardComposer = String(available);
    root.style.setProperty("--t3b-dock-x", `${Math.max(12, Math.min(x, innerWidth - w - 12))}px`);
    root.style.setProperty(
      "--t3b-dock-y",
      `${Math.max(108, Math.min(y, innerHeight - height - 58))}px`,
    );
    root.style.setProperty("--t3b-dock-width", `${w}px`);
  }, [available, position, width, height]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Observes the existing native composer DOM size and replacement.
  R.useEffect(() => {
    let current, stopObserving;
    const update = () => {
      const composer = document.querySelector('[data-workspace-area="composer"]');
      if (!composer || composer === current) return;
      current = composer;
      stopObserving?.();
      stopObserving = observeResize(composer, () =>
        setHeight(Math.min(480, composer.getBoundingClientRect().height)),
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.querySelector("#root"), { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      stopObserving?.();
    };
  }, []);
  function pointer(event, resize = false) {
    if (event.button !== 0 || (!resize && event.target.closest("button,[role=combobox]"))) return;
    event.preventDefault();
    event.stopPropagation();
    const box = header.current.getBoundingClientRect(),
      x = event.clientX,
      y = event.clientY;
    const move = (e) =>
      resize
        ? setWidth(Math.max(360, Math.min(innerWidth - 32, width + e.clientX - x)))
        : setPosition({ x: box.x + e.clientX - x, y: box.y + e.clientY - y });
    const end = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end, { once: true });
  }
  if (!visible) return null;
  const options = [
    { value: "__new__", label: "新会话" },
    ...threads
      .filter((t) => !t.deletedAt && !t.archivedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => ({ value: threadKey(t), label: t.title || "新会话" })),
  ];
  return h(
    "div",
    {
      ref: header,
      className: "t3b-composer-header",
      "data-visible": available,
      onPointerDown: (e) => pointer(e),
    },
    h("span", { className: "t3b-drag-handle", title: "拖动输入区" }, h(Icon, { name: "grip" })),
    h(Picker, {
      label: "发送到会话",
      value: selected ?? "__new__",
      options,
      onChange: onSelect,
      className: "t3b-target",
    }),
    h(Button, {
      icon: "close",
      className: "t3b-icon",
      "aria-label": "收起输入区",
      onClick: onClose,
    }),
    h("button", {
      className: "t3b-resize",
      "aria-label": "调整输入区宽度",
      onPointerDown: (e) => pointer(e, true),
    }),
  );
}

export function SessionBoard() {
  const router = useRouter();
  const nativeNewThread = createNewThreadHandler(router);
  const projects = useProjects(),
    threads = useThreadShells();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Installs the board theme into the shared theme library and applies its native palette.
  R.useEffect(installBoardTheme, []);
  const [open, setOpen] = R.useState(localStorage.getItem("t3code:board:open:v2") !== "false");
  const [query, setQuery] = R.useState(""),
    [project, setProject] = R.useState("all");
  const [selected, setSelected] = R.useState(keyOfRef(currentRef(router)) || null),
    [composing, setComposing] = R.useState(false);
  const [error, setError] = R.useState(""),
    [collapsed, setCollapsed] = R.useState(new Set());
  const [maximized, setMaximized] = R.useState(null);
  const [located, setLocated] = R.useState(null);
  const [menuRequest, setMenuRequest] = R.useState(null);
  const [renaming, setRenaming] = R.useState(null);
  function showThreadMenu(thread, event) {
    setMenuRequest({ thread, position: { x: event.clientX, y: event.clientY } });
  }
  const [columnWidths, setColumnWidths] = R.useState(() => {
    try {
      const widths = JSON.parse(localStorage.getItem("t3code:board:columns:v2"));
      if (
        Array.isArray(widths) &&
        widths.length === 4 &&
        widths.every((v) => Number.isFinite(v) && v >= 5)
      )
        return widths;
    } catch {}
    return [25, 25, 25, 25];
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Persists shared column widths in browser storage.
  R.useEffect(() => {
    localStorage.setItem("t3code:board:columns:v2", JSON.stringify(columnWidths));
  }, [columnWidths]);
  const [, forceRoute] = R.useReducer((n) => n + 1, 0);
  const groups = groupThreads(projects, threads, { query, project });
  const expandedProjectCount = groups.filter((group) => !collapsed.has(group.key)).length;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Synchronizes board visibility with document attributes and browser storage.
  R.useEffect(() => {
    document.documentElement.dataset.t3BoardOpen = String(open);
    localStorage.setItem("t3code:board:open:v2", String(open));
    if (!open) document.documentElement.dataset.t3BoardComposer = "false";
  }, [open]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Subscribes to native router changes for composer targeting.
  R.useEffect(
    () =>
      router.subscribe("onResolved", () => {
        const ref = currentRef(router);
        if (ref) setSelected(keyOfRef(ref));
        forceRoute();
      }),
    [],
  );
  async function select(thread, expand = true) {
    setMaximized(null);
    setError("");
    setSelected(threadKey(thread));
    setComposing(expand);
    try {
      await router.navigate({ to: "/$environmentId/$threadId", params: refOf(thread) });
      forceRoute();
    } catch {
      setComposing(false);
      setError("无法打开会话，请重试。");
    }
  }
  async function newThread() {
    setError("");
    setSelected(null);
    setComposing(false);
    try {
      const active = currentRef(router);
      const activeThread = threads.find((t) => threadKey(t) === keyOfRef(active));
      const destination =
        projects.find((p) => projectKey(p) === project) ??
        projects.find(
          (p) =>
            p.environmentId === activeThread?.environmentId && p.id === activeThread?.projectId,
        ) ??
        projects.find((p) => p.isScratch) ??
        projects[0];
      if (!destination) throw Error("No project available");
      const draft = await nativeNewThread({
        environmentId: destination.environmentId,
        projectId: destination.id,
      });
      if (!draft) throw Error("Draft could not be created");
      setComposing(true);
      forceRoute();
    } catch {
      setError("无法新建会话，请重试。");
    }
  }
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Registers the board keyboard shortcuts on the window.
  R.useEffect(() => {
    const key = (e) => {
      if (e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (
        e.key === "Escape" &&
        !document.querySelector(
          '[data-slot="select-popup"],[data-slot="combobox-popup"],[role="dialog"]',
        )
      ) {
        if (maximized) setMaximized(null);
        else if (composing) setComposing(false);
        else setOpen(false);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [composing, maximized]);
  function resizeColumns(event, index) {
    if (event.button !== 0) return;
    event.preventDefault();
    const usable = event.currentTarget.parentElement.getBoundingClientRect().width - 42;
    const startX = event.clientX,
      initial = [...columnWidths],
      pair = initial[index] + initial[index + 1];
    const min = Math.min((160 / usable) * 100, pair / 2 - 1);
    const move = (e) => {
      const left = Math.max(
        min,
        Math.min(pair - min, initial[index] + ((e.clientX - startX) / usable) * 100),
      );
      const next = [...initial];
      next[index] = left;
      next[index + 1] = pair - left;
      setColumnWidths(next);
    };
    const end = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      document.documentElement.classList.remove("t3b-resizing");
    };
    document.documentElement.classList.add("t3b-resizing");
    addEventListener("pointermove", move);
    addEventListener("pointerup", end, { once: true });
  }
  function locateThread(thread, focusCard = true) {
    if (!thread) return;
    const key = threadKey(thread);
    setLocated(key);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = [...document.querySelectorAll(".t3b-card")].find(
          (el) => el.dataset.threadKey === key,
        );
        if (!card) return;
        card.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          block: "start",
          inline: "nearest",
        });
        if (focusCard) card.focus({ preventScroll: true });
      }),
    );
  }
  return h(
    "div",
    { id: "t3-board-root", className: "text-sm" },
    h(BoardLauncher, { open, onClick: () => setOpen((v) => !v) }),
    open &&
      h(
        "section",
        {
          id: "t3-board",
          "aria-label": "会话看板",
          "data-project-layout": expandedProjectCount > 1 ? "multiple" : "single",
        },
        h(
          "header",
          { className: "t3b-toolbar" },
          h("h1", null, "会话"),
          h(
            "label",
            { className: "t3b-search" },
            h(Icon, { name: "search" }),
            h("input", {
              "aria-label": "搜索会话",
              placeholder: "搜索会话",
              value: query,
              onChange: (e) => setQuery(e.target.value),
            }),
          ),
          h(Picker, {
            label: "筛选项目",
            value: project,
            options: [
              { value: "all", label: "全部项目" },
              ...projects.map((p) => ({
                value: projectKey(p),
                label: p.isScratch || p.title === "No project" ? "无项目" : p.title,
              })),
            ],
            onChange: setProject,
          }),
          h("span", { className: "t3b-spacer" }),
          h(Button, { icon: "plus", className: "t3b-primary", onClick: newThread }, "新会话"),
          h(Button, {
            icon: "close",
            className: "t3b-icon",
            "aria-label": "返回会话",
            title: "返回会话 · Alt+B",
            onClick: () => setOpen(false),
          }),
        ),
        error && h("div", { role: "alert", className: "t3b-error" }, error),
        h(
          "div",
          { className: "t3b-scroll" },
          groups.map((group) =>
            h(
              "section",
              {
                className: "t3b-project",
                key: group.key,
                "data-project-key": group.key,
                "data-expanded": !collapsed.has(group.key),
              },
              h(
                "button",
                {
                  className: "t3b-project-heading",
                  "aria-expanded": !collapsed.has(group.key),
                  onClick: () =>
                    setCollapsed((old) => {
                      const next = new Set(old);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    }),
                },
                h(
                  "span",
                  { className: collapsed.has(group.key) ? "" : "is-expanded" },
                  h(Icon, { name: "chevron", size: 13 }),
                ),
                group.title,
                h("span", { className: "t3b-count" }, group.count),
              ),
              !collapsed.has(group.key) &&
                h(
                  "div",
                  {
                    className: "t3b-columns",
                    style: {
                      "--t3b-column-tracks": columnWidths.map((w) => `minmax(0,${w}fr)`).join(" "),
                    },
                  },
                  columns.map((column) =>
                    h(
                      "section",
                      { className: "t3b-column", key: column.id, "data-column": column.id },
                      h(
                        "div",
                        { className: "t3b-column-header" },
                        h(
                          "h2",
                          null,
                          h("i", { "data-state": column.id }),
                          column.label,
                          h("span", { className: "t3b-count" }, group.columns[column.id].length),
                        ),
                        h(Picker, {
                          label: `定位${group.title}的${column.label}会话`,
                          placeholder: "定位会话",
                          value: "",
                          disabled: !group.columns[column.id].length,
                          className: "t3b-thread-index",
                          options: group.columns[column.id].map((thread) => ({
                            value: threadKey(thread),
                            label: thread.title || "新会话",
                          })),
                          onOptionContextMenu: (key, event) =>
                            showThreadMenu(
                              group.columns[column.id].find((thread) => threadKey(thread) === key),
                              event,
                            ),
                          onChange: (key) =>
                            locateThread(
                              group.columns[column.id].find((thread) => threadKey(thread) === key),
                            ),
                        }),
                      ),
                      h(
                        "div",
                        { className: "t3b-cards" },
                        group.columns[column.id].length
                          ? group.columns[column.id].map((thread) =>
                              h(ThreadCard, {
                                key: threadKey(thread),
                                thread,
                                selected: selected === threadKey(thread),
                                located: located === threadKey(thread),
                                onContextMenu: showThreadMenu,
                                renaming: renaming === threadKey(thread),
                                onRenameDone: () => setRenaming(null),
                                select,
                                maximized: maximized === threadKey(thread),
                                onMaximize: () => {
                                  setComposing(false);
                                  setMaximized((v) =>
                                    v === threadKey(thread) ? null : threadKey(thread),
                                  );
                                },
                                open: (thread) => {
                                  select(thread, false);
                                  setOpen(false);
                                },
                              }),
                            )
                          : h("div", { className: "t3b-column-empty", "aria-hidden": true }),
                      ),
                    ),
                  ),
                  [0, 1, 2].map((index) => {
                    const percent = columnWidths.slice(0, index + 1).reduce((a, b) => a + b, 0);
                    return h("div", {
                      key: `divider-${index}`,
                      className: "t3b-column-divider",
                      role: "separator",
                      "aria-label": `调整${columns[index].label}与${columns[index + 1].label}列宽`,
                      "aria-orientation": "vertical",
                      tabIndex: 0,
                      style: {
                        left: `calc(${percent}% + ${14 * (index + 0.5) - 0.42 * percent}px)`,
                      },
                      onPointerDown: (e) => resizeColumns(e, index),
                      onDoubleClick: () => setColumnWidths([25, 25, 25, 25]),
                      onKeyDown: (e) => {
                        if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
                        e.preventDefault();
                        const next = [...columnWidths],
                          delta = e.key === "ArrowLeft" ? -2 : 2;
                        if (next[index] + delta < 10 || next[index + 1] - delta < 10) return;
                        next[index] += delta;
                        next[index + 1] -= delta;
                        setColumnWidths(next);
                      },
                    });
                  }),
                ),
            ),
          ),
          !groups.length &&
            h("div", { className: "t3b-empty" }, query ? "没有匹配的会话" : "暂无项目"),
        ),
      ),
    h(ThreadMenu, {
      request: menuRequest,
      onHandled: () => setMenuRequest(null),
      onRename: (thread) => {
        setMaximized(null);
        setRenaming(threadKey(thread));
        locateThread(thread, false);
      },
    }),
    h(NativeComposer, {
      router,
      threads,
      selected,
      visible: open && composing,
      onClose: () => setComposing(false),
      onSelect: (key) => {
        if (key === "__new__") return newThread();
        const thread = threads.find((t) => threadKey(t) === key);
        if (thread) select(thread);
      },
    }),
  );
}
