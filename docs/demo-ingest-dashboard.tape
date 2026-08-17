Output "/tmp/paceproof-demo/docs/demo-ingest-dashboard.gif"
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

Type "paceproof init ./attestations"
Enter
Sleep 1s

Type "paceproof ingest ./attestations --out normalized.jsonl"
Enter
Sleep 1s

Type "paceproof dashboard ./attestations --out dashboard.html"
Enter
Sleep 1s

Type "ls normalized.jsonl dashboard.html"
Enter
Sleep 2s
