/** Simplified Chinese update-page dictionary. */
export const zh = {
  nav: '应用更新',
  title: '应用更新',
  intro: '从 Oasisfish 的公开 GitHub Release 检查并安装新版本。',
  currentVersion: '当前版本',
  availableVersion: '可用版本',
  checking: '正在检查更新…',
  upToDate: '当前已是最新版本。',
  available: '发现新版本，可以下载安装。',
  downloading: '正在下载更新…',
  downloaded: '更新已下载，可以重启安装。',
  installing: '正在启动安装程序…',
  unsupported: '当前运行方式不支持检查更新。',
  loadError: '无法读取更新状态。',
  check: '检查更新',
  download: '下载更新',
  install: '重启并安装',
  retry: '重试',
  installerNotice: 'Windows 可能要求你确认安装程序。应用数据会被保留。',
  progress: '下载进度',
} satisfies Record<string, string>

/** Update-page dictionary key union. */
export type DesktopUpdateLocaleKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  nav: 'App Updates',
  title: 'App Updates',
  intro: 'Check and install releases published by the public Oasisfish GitHub repository.',
  currentVersion: 'Current version',
  availableVersion: 'Available version',
  checking: 'Checking for updates…',
  upToDate: 'You are using the latest version.',
  available: 'A new version is ready to download.',
  downloading: 'Downloading…',
  downloaded: 'The update is downloaded and ready to install.',
  installing: 'Starting the installer…',
  unsupported: 'Updates are unavailable for this build.',
  loadError: 'Could not read the update status.',
  check: 'Check for updates',
  download: 'Download update',
  install: 'Restart and install',
  retry: 'Try again',
  installerNotice: 'Windows may ask you to confirm the installer. Your app data will be kept.',
  progress: 'Download progress',
} satisfies Record<DesktopUpdateLocaleKey, string>
