# 定制版更新

定制源码位于 `custom/session-board` 分支。`custom/release.json` 记录官方基线和定制版发布仓库。

GitHub 仓库的默认分支设为 `custom/session-board`，启用 `Custom T3 Code update` workflow。它每六小时检查官方稳定版，也支持手动指定 `upstream_tag`。

流程会合并官方版本、检查原生组件接口、运行会话操作测试，再构建 Windows 安装包和配套 WSL 运行时。安装包和 `latest.yml` 全部构建成功后才发布新 Release。合并冲突或检查失败会显示在 Actions 中，更新入口继续读取上一次发布的版本。

首次安装定制版安装包后，应用中原有的更新按钮读取定制仓库的 Release。后续更新继续使用同一个按钮。

## 本地维护

在仓库根目录执行以下命令。Vite+ 使用仓库声明的 Node.js 和 pnpm 版本。

```powershell
vp install --frozen-lockfile
vp exec node custom/update.mjs status
vp exec node custom/update.mjs sync latest
vp run --filter @t3tools/web typecheck
vp run --filter @t3tools/web build
```

手动同步前先提交本地修改。合并冲突时脚本撤销本次合并并列出冲突文件，保留原定制分支。

构建 Windows 安装包时传入同版本 Linux CLI 归档，供 WSL 使用。

```powershell
vp exec node custom/update.mjs build --wsl-runtime C:/build/t3-0.1.9-linux-x64.tar.gz --output-dir C:/build/custom-release
```

定制构建跳过随包预生成的服务端编译缓存，使 Windows 包符合上游的散文件数量限制。服务端按正常流程在运行时生成缓存。

## 发布配置

`custom/release.json` 中的 `updateRepository` 必须指向自己的发布仓库。GitHub Actions 使用当前仓库作为更新源，借助 workflow 的 `GITHUB_TOKEN` 上传发布文件。

默认流水线生成未签名的个人 Windows 安装包。首次安装由使用者启动。若需要代码签名，按上游发布文档配置自己的签名身份。

合并较新上游版本后如出现接口变化，先修复对应源码并通过检查，再手动重新运行 workflow。
