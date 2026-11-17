import { useRef } from "react";
import type { ComponentProps } from "react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  useThreadProjection,
  useThreadVisibleTurnItems,
  useThreadStatus,
  useProject,
} from "../../state/entities";
import { useClientSettings } from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import { useIncrementalTimelineEntries } from "../../hooks/useIncrementalTimelineEntries";
import { useRightPanelStore } from "../../rightPanelStore";
import { MessagesTimeline } from "../chat/MessagesTimeline";
import { ExpandedImageDialogHost, openExpandedImagePreview } from "../chat/ExpandedImageDialog";
import type { TimelineEntriesInput } from "../../session-logic";

const empty = Object.freeze([]);
const attachmentUrls = new Map<string, string>();
const noop = () => {};

export function NativeOutput({
  thread,
  visible,
  open,
}: {
  thread: EnvironmentThreadShell;
  visible: boolean;
  open: (thread: EnvironmentThreadShell) => void;
}) {
  const ref = { environmentId: thread.environmentId, threadId: thread.id };
  const target = visible ? ref : null;
  const detail = useThreadProjection(target);
  const items = useThreadVisibleTurnItems(target);
  const phase = useThreadStatus(target);
  const projection = detail?.projection;
  const { resolvedTheme } = useTheme();
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const listRef: ComponentProps<typeof MessagesTimeline>["listRef"] = useRef(null);
  const key = `${thread.environmentId}\0${thread.id}`;
  const input: TimelineEntriesInput = {
    visibleTurnItems: items,
    optimisticMessages: empty,
    anchoredMessages: empty,
    attachmentUrlById: attachmentUrls,
    attempts: projection?.attempts ?? empty,
    nodes: projection?.nodes ?? empty,
    plans: projection?.plans ?? empty,
  };
  const entries = useIncrementalTimelineEntries(key, input);
  const project = useProject({ environmentId: thread.environmentId, projectId: thread.projectId });
  const workspaceRoot = thread.worktreePath ?? project?.workspaceRoot;
  const onImageExpand: ComponentProps<typeof MessagesTimeline>["onImageExpand"] = (preview) =>
    openExpandedImagePreview(key, preview);
  const onFileOpen: ComponentProps<typeof MessagesTimeline>["onFileOpen"] = (file) => {
    useRightPanelStore.getState().openAttachment(ref, file);
    open(thread);
  };
  if (!visible) return null;
  return (
    <>
      <MessagesTimeline
        listRef={listRef}
        timelineEntries={entries}
        turnDiffSummaries={empty}
        runs={projection?.runs ?? empty}
        routeThreadKey={key}
        displayThreadKey={`board:${key}`}
        activeThreadEnvironmentId={thread.environmentId}
        latestRun={thread.latestRun}
        runningRunId={thread.runtime?.activeRunId ?? null}
        isWorking={["running", "preparing", "starting", "queued", "waiting"].includes(
          thread.runtime?.status ?? "idle",
        )}
        liveFollowEnabled
        contentInsetEndAdjustment={0}
        emptyPlaceholderInset={0}
        anchorMessageId={null}
        onAnchorReady={noop}
        onAnchorSizeChanged={noop}
        supportsConversationRollback={false}
        onRevertToTurnCount={noop}
        isRevertingCheckpoint={false}
        announceTurnStatus={false}
        onImageExpand={onImageExpand}
        onFileOpen={onFileOpen}
        onOpenThread={(id) => open({ ...thread, id })}
        onIsAtEndChange={noop}
        resolvedTheme={resolvedTheme}
        timestampFormat={timestampFormat}
        workspaceRoot={workspaceRoot}
        markdownCwd={workspaceRoot}
        hideEmptyPlaceholder={phase !== "live"}
      />
      <ExpandedImageDialogHost threadKey={key} />
    </>
  );
}
