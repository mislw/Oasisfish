/** Copy dictionaries for Wallpaper Engine setup onboarding. */

/** English dictionary and key source of truth. */
export const en = {
  title: 'Set up Wallpaper Engine',
  body: 'Choose the wallpaper library and playback settings to use on this desktop.',
  openSettings: 'Open Wallpaper Engine settings',
} satisfies Record<string, string>

/** Wallpaper Engine onboarding locale key union. */
export type WallpaperOnboardingLocaleKey = keyof typeof en

/** Simplified Chinese dictionary checked against the English key set. */
export const zh = {
  title: '设置 Wallpaper Engine',
  body: '选择要在这台电脑上使用的壁纸库和播放设置。',
  openSettings: '打开 Wallpaper Engine 设置',
} satisfies Record<WallpaperOnboardingLocaleKey, string>

/** Detached copy snapshot injected into one onboarding registration. */
export type WallpaperOnboardingCopy = Readonly<Record<WallpaperOnboardingLocaleKey, string>>
