---
title: 用 CLI 和 AI 助手发布内容
date: 2026-10-04
summary: 从离线转换和预演开始，再给 AI 助手授权范围有限的发布令牌。
tags: [CLI, AI, 使用指南]
---

# 用 CLI 和 AI 助手发布内容

## 离线预演

在项目根目录运行，无需账号或网络访问：

```powershell
npm run site -- help
npm run site -- schema essays
npm run site -- publish --file docs/examples/first-post.md --path 我的文章/first-post --dry-run
```

CLI 可以准备 Markdown、Obsidian、HTML、DOCX 与本地图片。转换保留代码和 LaTeX，并移除 Obsidian 隐藏注释。转换后的正文与图片仍需要检查。

## 给发布授权

在管理台「Token 与账户」创建令牌，为文章发布选择 `essays:write` 和 `media:write`；管理分类时增加 `folders:write`。设置合理到期时间，完成后可撤销。

```powershell
$env:SITE_URL='http://localhost:3001'
npm run site -- publish --file docs/examples/first-post.md --path 我的文章/first-post --status published --token-file C:/private/site-token.txt
```

这里的 token 文件由你在本机单独准备，不随项目发布。开发服务的 API 端口也是 3001。更新已有记录需要最新 revision，避免覆盖其他页面的编辑。

## 安装 AI Skill

```powershell
npm run skill:install
```

这会把 `personal-site-cms` 安装到当前 Codex 的 skills 目录，并关联这份项目。让助手先查看 schema、准备内容和 dry-run，再通过授权的 CLI 发布。完整操作见项目 `tools/skills/personal-site-cms/`。

Windows PowerShell 可以使用中文路径；git-bash 调原生 Windows 程序时，中文内容通过 UTF-8 文件或 stdin 传递。
