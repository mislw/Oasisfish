# Oasisfish Desktop Runtime Notices

Oasisfish bundles the following unmodified or minimally repackaged command-line runtimes for offline use on Windows x64. The application license and JavaScript dependency notices are provided separately as `LICENSE` and `THIRD_PARTY_NOTICES.md` in the installed resources directory.

| Component | Version | License and bundled notice |
|---|---:|---|
| Node.js | 24.19.0 | MIT and bundled third-party terms in `runtime/node/LICENSE` |
| pnpm standalone executable | 11.7.0 | MIT; source and license: `pnpm/pnpm` |
| Python | 3.14.7 | Python Software Foundation License in `runtime/python/LICENSE.txt` |
| pip | 26.2.1 | MIT in `runtime/python/Lib/site-packages/pip-26.2.1.dist-info/licenses/LICENSE.txt` |
| Git for Windows, Git Bash, curl, and OpenSSH | 2.55.0.windows.5 | Git GPLv2 terms in `runtime/git/LICENSE.txt`; bundled component licenses under `runtime/git/mingw64/share/licenses/` and `runtime/git/usr/share/licenses/` |
| PowerShell | 7.6.5 | MIT in `runtime/powershell/LICENSE.txt` |
| ripgrep | 15.2.0 | MIT or Unlicense in `runtime/tools/ripgrep/LICENSE-MIT` and `runtime/tools/ripgrep/UNLICENSE` |
| fd | 10.4.2 | Apache-2.0 or MIT in `runtime/tools/fd/LICENSE-APACHE` and `runtime/tools/fd/LICENSE-MIT` |
| jq | 1.8.2 | MIT; source and license: `jqlang/jq` |
| 7-Zip command-line tools | 26.02 | LGPL and bundled restrictions in `runtime/tools/sevenzip/License.txt` |
| BGE small zh v1.5 ONNX model | `75c43b069aac4d136ba6bc1122f995fedcfd2781` | MIT in `models/bge-small-zh-v1.5/LICENSE` |

The exact download URLs and SHA-256 checksums used to assemble the command-line runtime are recorded in `runtime/manifest.json`. The local retrieval model identity and file checksums are recorded in `models/bge-small-zh-v1.5/model-manifest.json`.
