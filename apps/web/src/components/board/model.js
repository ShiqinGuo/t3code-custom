export const columns = [
  { id: "idle", label: "待开始" },
  { id: "running", label: "进行中" },
  { id: "attention", label: "待处理" },
  { id: "completed", label: "已完成" },
];

export const threadKey = (t) => `${t.environmentId}/${t.id ?? t.threadId}`;
export const projectKey = (p) => `${p.environmentId}/${p.id ?? p.projectId}`;

export function statusOf(t) {
  if (
    t.hasPendingApprovals ||
    t.hasPendingUserInput ||
    t.pendingSubagentRequest ||
    t.pendingGuestMessageCount > 0
  )
    return { column: "attention", label: t.hasPendingApprovals ? "待批准" : "待回复" };
  const status = t.runtime?.status ?? t.latestRun?.status ?? "idle";
  if (status === "failed" || t.runtime?.lastError) return { column: "attention", label: "失败" };
  if (["running", "preparing", "queued", "starting", "waiting"].includes(status))
    return {
      column: "running",
      label:
        t.blockedOnThreadWait || status === "waiting"
          ? "等待中"
          : status === "queued"
            ? "排队中"
            : "进行中",
    };
  if (t.hasActionableProposedPlan) return { column: "attention", label: "计划待确认" };
  if (
    ["completed", "interrupted", "cancelled", "stopped"].includes(status) ||
    t.settledOverride === "settled"
  )
    return {
      column: "completed",
      label: ["interrupted", "cancelled", "stopped"].includes(status) ? "已停止" : "已完成",
    };
  return { column: "idle", label: "待开始" };
}

export function groupThreads(
  projects,
  threads,
  { query = "", project = "all", archive = false } = {},
) {
  const groups = new Map(
    projects
      .filter((p) => !p.archivedAt || archive)
      .map((p) => [
        projectKey(p),
        {
          ...p,
          key: projectKey(p),
          title: p.isScratch || p.title === "No project" ? "无项目" : p.title,
          columns: Object.fromEntries(columns.map((c) => [c.id, []])),
          count: 0,
        },
      ]),
  );
  const needle = query.trim().toLocaleLowerCase();
  for (const t of threads) {
    if (t.deletedAt || (t.archivedAt && !archive)) continue;
    const key = `${t.environmentId}/${t.projectId}`;
    if (project !== "all" && key !== project) continue;
    const group = groups.get(key);
    if (
      !group ||
      (needle &&
        !`${t.title} ${group.title} ${t.branch ?? ""}`.toLocaleLowerCase().includes(needle))
    )
      continue;
    group.columns[statusOf(t).column].push(t);
    group.count++;
  }
  for (const g of groups.values())
    for (const list of Object.values(g.columns))
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return [...groups.values()]
    .filter((g) => project === "all" || g.key === project)
    .filter((g) => !needle || g.count)
    .sort(
      (a, b) =>
        Number(a.isScratch === true) - Number(b.isScratch === true) ||
        a.title.localeCompare(b.title),
    );
}
