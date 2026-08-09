Output "/tmp/paceproof-demo/docs/demo-verify-json.gif"
Set FontSize 16
Set Width 760
Set Height 260
Set Theme "Dracula"
Set WindowBar Colorful
Set WindowBarSize 36

Type "export PS1='$ '"
Enter
Sleep 300ms
Type "export HOME=/tmp/paceproof-demo"
Enter
Sleep 300ms

Type "paceproof init ./records"
Enter
Sleep 1s

Type "paceproof verify ./records"
Enter
Sleep 2s

Type "paceproof verify ./records --json | head -n 20"
Enter
Sleep 3s
