# Once for VS Code

Support for [Once](https://once.rennko.tech) programs (`.once` files):

- Syntax highlighting, comment toggling, bracket matching and auto-indent
- Hover any word to see what it does, with an example. Hovering your own `to ...` instructions shows their inputs and the `--` comment lines above them; hovering a name shows where it was first set
- Autocomplete for keywords, built-ins, your own names, and block snippets (`if`, `repeat`, `for each`, `every frame`, `when ...`), plus input hints while typing `name(...)`
- Mistakes underlined as you type, with the same plain-English messages and hints as the playground
- **Run in Preview** (the play button in the editor title, or Cmd/Ctrl + Enter): runs the program in a panel beside the editor, with drawing, sound, keys and mouse. Saving re-runs it.
- **Once: Run in Output**: runs it like the `once run` command (text only)
- **Once: Export as Web Page**: writes a single `.html` file next to your program
- **Once: Open in Web Playground**

Nothing else needs installing: the extension runs Once with VS Code's own Node.
