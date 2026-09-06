!macro customInstall
  FileOpen $0 "$INSTDIR\resources\oasisfish-installed.json" w
  FileWrite $0 "Oasisfish$\r$\n"
  FileClose $0
!macroend
