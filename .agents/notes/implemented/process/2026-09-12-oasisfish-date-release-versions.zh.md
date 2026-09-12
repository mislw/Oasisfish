# Agent Note: Oasisfish 日期版本号

Status: implemented

[English](2026-09-12-oasisfish-date-release-versions.md) | 中文

## 问题

Oasisfish 桌面版需要用版本号标识产品大版本、发布日期和当天的修改次数。Windows 可执行文件元数据的每段数字不能超过 65535，因此不能把八位日期直接放进一个数字段。

## 决策

Oasisfish 桌面版标准版本使用 `V.YYYYMMDD.T`，其中 `V` 是正数大版本，`YYYYMMDD` 是有效日历日期，`T` 是当天的正数修订次数。桌面包版本、应用版本、安装包文件名、更新元数据、Git 标签和 GitHub Release 都使用这个标准值。

`apps/desktop/package.json` 还以 `V.YYYY.MMDD.T` 形式保存 `shortVersion` 和 `shortVersionWindows`，其中 `MMDD` 段移除前导零。Electron Builder 用该值写入 Windows 可执行文件元数据，同时在用户和更新器识别版本的其他位置保留标准包版本。`apps/desktop/scripts/validate-release-tag.mjs` 会在发布前拒绝无效日期、非正数大版本或修订号、不匹配的标签，以及不一致的 Windows 元数据。

## 考虑过的替代方案

**把 `YYYYMMDD` 直接写入 Windows 文件版本。** Windows 资源版本段无法表示超过 65535 的值，因此可执行文件元数据会构建失败或被错误归一化。

**所有位置只使用 Windows 兼容版本。** `V.YYYY.MMDD.T` 隐去了用户要求的连续发布日期，并会让安装包、更新器、标签和 Release 标识偏离产品版本约定。

## 后果

同一个版本同时具有标准公开版本和等价的 Windows 资源版本。发布时必须一起更新三个包字段，发布工作流会在构建前验证它们的对应关系。标准版本仍是有效 SemVer，因此 Electron Updater 可以按大版本、日期和修订号排序。
