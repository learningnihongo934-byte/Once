# Once

**Once** is a little programming language for moving pictures. It reads like English, has friendly error messages, and comes with drawing, keyboard and mouse input, sound and simple physics built in.

Try it in your browser: **https://once.rennko.tech** (the playground), learn it step by step at **[/learn](https://once.rennko.tech/learn)** (24 interactive lessons that end with you building a top-down shooter), and look things up in **[the docs](https://once.rennko.tech/docs.html)**.

```
-- Bouncing balls
set gravity to 0.3
set colors to ["#b5452f", "#d39b2a", "#5f8a55", "#3f6788"]

repeat 10 times
  new circle at random 40 to 440, 60 size random 24 to 48 color any of colors moving random -3 to 3, 0 bouncy 0.85 solid
end

when mouse is clicked
  new circle at mouse's x, mouse's y size 36 bouncy 0.85 solid
  play sound "pop"
end
```

## The language in one minute

| You write | It means |
| --- | --- |
| `say "hi {name}"` | Print a line (with `{...}` filled in) |
| `set score to 0` / `change score by 1` | Keep a value / add to it |
| `if ... otherwise if ... otherwise ... end` | Choose |
| `repeat 3 times`, `repeat while`, `repeat until`, `repeat forever`, `for each x in list`, `for each n from 1 to 10` | Repeat |
| `to greet who ... give back ... end`, then `greet("Pip")` | Your own instructions |
| `draw circle at 100, 50 size 30 color "tomato"` | Draw (also `box`, `line`, `text`) |
| `set ball to new circle at 100, 50 moving 3, 0 bouncy solid` | A shape that moves by itself |
| `every frame ... end`, `every 2 seconds ... end` | Animation and timers |
| `when key "space" is pressed`, `when mouse is clicked`, `when ball touches edge` | Events |
| `holding "left"`, `ball touches paddle`, `ball's x` | Questions |
| `play note "C4" for 0.5`, `play sound "coin"` | Sound |
| `choose x` / `case ...`, `try ... otherwise`, `fail`, `check` | Matching and handling problems |
| `given n: n * 2`, `map`, `filter`, `[x * 2 for each x in xs]` | Quick instructions and list tools |
| `is a number`, `is between 1 and 10`, `is in list` | Checking values |
| `after 2 seconds`, `wait until ready`, `save best` / `load best` | Timing and saving |
| `move player by 4, 0`, `turn box by 15`, `nearest(player, enemies)` | Moving and aiming |
| `wait 1 second`, `the end` | Time |

Once has 35 statements, 15 operators and 72 built-in instructions, about the size of Python's core. Lists count from 1, angles are in degrees, and the picture is 480 by 360 with `0, 0` at the top left.

## How it is built

Once is a tree-walking interpreter written in TypeScript. Every statement runs as a generator, so `wait`, `repeat forever` and very long loops can pause and let the picture keep drawing without freezing the page.

- `src/lexer.ts`, `src/parser.ts`: source to syntax tree, with the friendly syntax errors
- `src/interp.ts`: the runner (tasks, events, `every`, `when`), with the friendly runtime errors
- `src/world.ts`: the physics (gravity, bouncing, solid shapes pushing apart)
- `src/stdlib.ts`: built-in instructions
- `src/lessons.ts`: the Learn course (each lesson has a starter, a solution and a check)
- `src/explain.ts`, `src/worddocs.ts`: hover explanations, autocomplete and input hints
- `src/web/`: the playground, the canvas stage (drawing, input, Web Audio), the docs, and the exported-page runtime
- `src/vscode/`: the VS Code extension (live mistakes, preview panel, run and export commands)
- `src/cli.ts`: the `once` command
- `vscode/`: the extension's manifest and grammar
- `tests/`: stories with the output they should give, and mistakes with the message they should get

## Building

Needs Node 18 or newer.

```bash
./build.sh            # build the playground, docs, CLI and extension
./build.sh test       # type-check and run every test program, example and docs listing
./build.sh serve      # http://localhost:8830
./build.sh deploy     # publish to once.rennko.tech (Cloudflare Workers)
./build.sh vsix       # package the VS Code extension
./build.sh install    # install the VS Code extension and link `once` into ~/.local/bin
```

## VS Code

`./build.sh install` installs the extension. Open any `.once` file to get highlighting, mistakes underlined as you type, hover explanations for every word (with examples), autocomplete and input hints. Press the play button in the editor title (or Cmd/Ctrl + Enter) to run the program in a preview panel with drawing, sound and keys; saving re-runs it. The command palette also has **Once: Run in Output**, **Once: Export as Web Page** and **Once: Open in Web Playground**.

## The `once` command

```bash
once run main.once                  # run in the terminal (no drawing or sound)
once check main.once                # look for mistakes
once export main.once -o main.html  # a single web page that plays the program
```

`./build.sh install` also links `once` into `~/.local/bin`.

## License

MIT

Made by **Virat Reddy Kaukuntla** ([@learningnihongo934-byte](https://github.com/learningnihongo934-byte))
