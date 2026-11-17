import { useEffect, useRef } from "react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { useThreadActionMenu } from "../../hooks/useThreadActionMenu";
import { useProject } from "../../state/entities";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { threadEnvironment } from "../../state/threads";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";

export interface ThreadMenuRequest {
  thread: EnvironmentThreadShell;
  position: { x: number; y: number };
}

export function ThreadMenu({
  request,
  onHandled,
  onRename,
}: {
  request: ThreadMenuRequest | null;
  onHandled: () => void;
  onRename: (thread: EnvironmentThreadShell) => void;
}) {
  const thread = request?.thread;
  const project = useProject(
    thread ? { environmentId: thread.environmentId, projectId: thread.projectId } : null,
  );
  const { openMenu } = useThreadActionMenu({
    threadRef: thread ? { environmentId: thread.environmentId, threadId: thread.id } : null,
    projectCwd: project?.workspaceRoot ?? null,
    onStartRename: () => {
      if (thread) requestAnimationFrame(() => onRename(thread));
    },
    canShareWithGuest: false,
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Hands a committed picker/card context request to the native menu service.
  useEffect(() => {
    if (!request) return;
    openMenu(request.position);
    onHandled();
  }, [request, openMenu, onHandled]);
  return null;
}

export function ThreadTitleEditor({
  thread,
  onDone,
}: {
  thread: EnvironmentThreadShell;
  onDone: () => void;
}) {
  const update = useOrchestrationCommand(threadEnvironment.updateMetadata);
  const finished = useRef(false);
  const commit = (title: string) => {
    if (finished.current) return;
    finished.current = true;
    const trimmed = title.trim();
    onDone();
    if (!trimmed) {
      toastManager.add({ type: "warning", title: "Thread title cannot be empty" });
      return;
    }
    if (trimmed !== thread.title)
      void update({
        environmentId: thread.environmentId,
        input: { threadId: thread.id, title: trimmed },
      });
  };
  return (
    <Input
      aria-label="会话名称"
      defaultValue={thread.title}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finished.current = true;
          onDone();
        }
      }}
    />
  );
}
