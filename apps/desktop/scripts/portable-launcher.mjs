const shebangMarker = Buffer.from('#!')
const portablePythonShebang = Buffer.from('#!<launcher_dir>\\..\\python.exe\n')

/**
 * Replace distlib's appended absolute Python shebang with its launcher-relative form.
 * @param {Buffer} launcher - Windows distlib launcher bytes.
 * @returns {Buffer} Launcher bytes that remain valid after the runtime directory moves.
 */
export function makeWindowsPythonLauncherPortable(launcher) {
  const shebangStart = launcher.lastIndexOf(shebangMarker)
  const shebangEnd = launcher.indexOf(0x0a, shebangStart)
  if (shebangStart < 0 || shebangEnd < 0) {
    throw new Error('Python launcher has no appended shebang.')
  }
  const shebang = launcher.subarray(shebangStart, shebangEnd).toString('utf8')
  if (!/^#!(?:"[^"]*python(?:w)?\.exe"|[^\r\n]*python(?:w)?\.exe)$/iu.test(shebang)) {
    throw new Error(`Python launcher has an unsupported shebang: ${shebang}`)
  }
  return Buffer.concat([
    launcher.subarray(0, shebangStart),
    portablePythonShebang,
    launcher.subarray(shebangEnd + 1),
  ])
}
