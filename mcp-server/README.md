---
docid: 300.7.mcp-server-readme
id: feature-diskcleanup-mcp-server
title: feature: DiskCleanUp MCP Server
project: DiskCleanUp
description: Gives Claude Desktop a dotnetcommand and powershellcommand tool scoped to this project.
status: active
tags: [readme, feature, diskcleanup]
category: 300.7 — Getting Started
created: 2026-02-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: mcp-server/README.md
---
# feature: DiskCleanUp MCP Server

Gives Claude Desktop a `dotnet_command` and `powershell_command` tool scoped to this project.

## Setup (one time)

```powershell
cd mcp-server
npm install
```text
## Registration

The `.vscode/mcp.json` file registers the server with Claude Desktop automatically when you open this project.

## Tools

| Tool | Example |
|------|---------|
| `dotnet_command` | `build`, `run`, `build --configuration Release` |
| `powershell_command` | `Get-Process`, `Remove-Item .\bin -Recurse` |

---

## What it does

_TODO: one paragraph describing the single responsibility of this file._

---

## Internal architecture

```text
activate()
  └── TODO: describe call flow
```text
---

## Manual test

1. TODO: step one
2. TODO: step two
3. TODO: expected result
