// The Learn course: each lesson explains something, gives a task, and checks the result.
import { OnceError } from './errors';
import { Thing, Value } from './values';

export interface CheckCtx {
  code: string;
  /** The code without comments, for looking for words. */
  bare: string;
  out: string[];
  error: OnceError | null;
  things: Thing[];
  vars: Map<string, Value>;
}

export interface Lesson {
  id: string;
  part: string;
  title: string;
  body: string;
  task: string;
  starter: string;
  solution: string;
  /** Gives back null when the task is done, or a hint saying what is still missing. */
  check: (c: CheckCtx) => string | null;
  /** How long to let the program run before checking, in seconds. */
  wait?: number;
}

const has = (c: CheckCtx, re: RegExp) => re.test(c.bare);
const count = (c: CheckCtx, re: RegExp) => (c.bare.match(new RegExp(re.source, 'g' + re.flags.replace('g', ''))) ?? []).length;

const BASICS = 'Basics';
const PICTURES = 'Pictures and motion';
const SHOOTER = 'Build a top-down shooter';

// ---- the shooter, built up step by step ----
const S1_START = `-- Top-down shooter, step 1: the player
set speed to 4
set player to new box at 240, 180 size 28 color "#0078d4" bouncy 0

every frame
  -- Move the player here: arrow keys and W A S D.
end
`;

const S1 = `-- Top-down shooter, step 1: the player
set speed to 4
set player to new box at 240, 180 size 28 color "#0078d4" bouncy 0

every frame
  if holding "left" or holding "a" then change player's x by -speed
  if holding "right" or holding "d" then change player's x by speed
  if holding "up" or holding "w" then change player's y by -speed
  if holding "down" or holding "s" then change player's y by speed
end
`;

const S2 = `-- Top-down shooter, step 2: aim and shoot
set speed to 4
set player to new box at 240, 180 size 28 color "#0078d4" bouncy 0
set bullets to []

-- Fires a bullet from the player toward the mouse.
to shoot
  set a to angle(mouse's x - player's x, mouse's y - player's y)
  set b to new circle at player's x, player's y size 8 color "#1f1f1f" moving cos(a) * 9, sin(a) * 9
  add b to bullets
  play sound "click"
end

when mouse is clicked
  shoot()
end

when key "space" is pressed
  shoot()
end

every frame
  if holding "left" or holding "a" then change player's x by -speed
  if holding "right" or holding "d" then change player's x by speed
  if holding "up" or holding "w" then change player's y by -speed
  if holding "down" or holding "s" then change player's y by speed

  -- a faint line to show where you are aiming
  draw line from player's x, player's y to mouse's x, mouse's y color "#88888866" width 1
end
`;

const S3 = `-- Top-down shooter, step 3: enemies
set speed to 4
set player to new box at 240, 180 size 28 color "#0078d4" bouncy 0
set bullets to []
set enemies to []

-- Fires a bullet from the player toward the mouse.
to shoot
  set a to angle(mouse's x - player's x, mouse's y - player's y)
  set b to new circle at player's x, player's y size 8 color "#1f1f1f" moving cos(a) * 9, sin(a) * 9
  add b to bullets
  play sound "click"
end

-- Makes an enemy just outside a random side of the screen.
to spawn
  set x to random 0 to width
  set y to random 0 to height
  set side to random 1 to 4
  if side is 1 then set x to -12
  if side is 2 then set x to width + 12
  if side is 3 then set y to -12
  if side is 4 then set y to height + 12
  set e to new circle at x, y size 24 color "#e5484d"
  set e's pace to 1.5
  add e to enemies
end

when mouse is clicked
  shoot()
end

when key "space" is pressed
  shoot()
end

every 1 seconds
  spawn()
end

every frame
  if holding "left" or holding "a" then change player's x by -speed
  if holding "right" or holding "d" then change player's x by speed
  if holding "up" or holding "w" then change player's y by -speed
  if holding "down" or holding "s" then change player's y by speed

  -- every enemy turns toward the player
  for each e in enemies
    set a to angle(player's x - e's x, player's y - e's y)
    set e's dx to cos(a) * e's pace
    set e's dy to sin(a) * e's pace
  end

  draw line from player's x, player's y to mouse's x, mouse's y color "#88888866" width 1
end
`;

const S4 = S3
  .replace('-- Top-down shooter, step 3: enemies', '-- Top-down shooter, step 4: hits and score')
  .replace('set enemies to []\n', 'set enemies to []\nset score to 0\n')
  .replace(`    set e's dy to sin(a) * e's pace
  end
`, `    set e's dy to sin(a) * e's pace
  end

  -- bullets that hit an enemy take it out
  for each b in bullets
    for each e in enemies
      if b touches e
        remove b
        remove b from bullets
        remove e
        remove e from enemies
        change score by 1
        play sound "pop"
      end
    end
    -- bullets that leave the screen are cleaned up
    if b touches edge
      remove b
      remove b from bullets
    end
  end
`)
  .replace(`  draw line from player's x, player's y to mouse's x, mouse's y color "#88888866" width 1
end
`, `  draw line from player's x, player's y to mouse's x, mouse's y color "#88888866" width 1
  draw text "Score {score}" at 10, 10 size 18
end
`);

const S5 = S4
  .replace('-- Top-down shooter, step 4: hits and score', '-- Top-down shooter, step 5: lives and game over')
  .replace('set score to 0\n', 'set score to 0\nset lives to 3\n')
  .replace(`  draw text "Score {score}" at 10, 10 size 18
end
`, `  -- enemies that reach the player cost a life
  for each e in enemies
    if e touches player
      remove e
      remove e from enemies
      change lives by -1
      play sound "hit"
      if lives is 0
        say "Game over! Final score: {score}"
        the end
      end
    end
  end

  draw text "Score {score}   Lives {lives}" at 10, 10 size 18
end
`);

const S6 = S5
  .replace('-- Top-down shooter, step 5: lives and game over', '-- Top-down shooter: finished!')
  .replace(`  set e's pace to 1.5`, `  -- enemies get faster as your score goes up
  set e's pace to 1.5 + score / 15`)
  .replace(`every 1 seconds
  spawn()
end`, `every 1 seconds
  spawn()
  -- and from 10 points on, two come at a time
  if score is at least 10 then spawn()
end`);

export const LESSONS: Lesson[] = [
  {
    id: 'hello', part: BASICS, title: 'Hello, Once',
    body: `
<p>Once is a programming language that reads like English. A program is a list of <b>steps</b>, one per line, run from top to bottom.</p>
<p>The simplest step is <code>say</code>. It prints a line in the <b>Output</b> panel under the preview. Text goes inside double quotes.</p>
<pre class="once">say "Hello!"
say 2 + 3</pre>
<p>Press <b>Run</b> (or Ctrl/Cmd + Enter) to run the program. Anything after <code>--</code> is a <b>comment</b>: a note for people that Once skips.</p>
<pre class="once">-- This line is just for you.
say "This one runs."</pre>`,
    task: 'Make the program say two different lines, then press Run.',
    starter: '-- My first program\nsay "Hello!"\n',
    solution: '-- My first program\nsay "Hello!"\nsay "I am learning Once."\n',
    check: (c) => (new Set(c.out).size >= 2 ? null : 'Add a second say line with different text.'),
  },
  {
    id: 'names', part: BASICS, title: 'Keeping values',
    body: `
<p>To keep a value for later, give it a <b>name</b> with <code>set</code>. Names can hold text, numbers, <code>true</code>/<code>false</code>, lists and more.</p>
<pre class="once">set name to "Pip"
set age to 3</pre>
<p>Inside text, a name in curly braces is replaced by its value. You can put any calculation in the braces.</p>
<pre class="once">say "Hi, {name}! Next year you'll be {age + 1}."</pre>
<p>You can also join text with <code>+</code>: <code>say "Hi, " + name</code>. Setting a name again replaces its value.</p>`,
    task: 'Keep your name in <code>name</code>, then say a greeting that uses <code>{name}</code>.',
    starter: '-- Keep your name, then greet yourself\n',
    solution: '-- Keep your name, then greet yourself\nset name to "Sam"\nsay "Hi, I\'m {name}!"\n',
    check: (c) => {
      if (!has(c, /\bset\s+name\s+to\b/)) return 'Start with a line like: set name to "Sam"';
      if (!/"[^"\n]*\{[^}]*\bname\b[^}]*\}[^"\n]*"/.test(c.bare)) return 'Use {name} inside the text you say.';
      return c.out.length ? null : 'Add a say line and press Run.';
    },
  },
  {
    id: 'numbers', part: BASICS, title: 'Numbers and math',
    body: `
<p>Once does math with <code>+</code>, <code>-</code>, <code>*</code>, <code>/</code>, <code>^</code> (power) and <code>mod</code> (remainder). Brackets work as you'd expect.</p>
<pre class="once">say 7 / 2          -- 3.5
say 2 ^ 8          -- 256
say 17 mod 5       -- 2
say round(3.14159, 2)</pre>
<p><code>change</code> adds to a number that's already kept. A negative amount subtracts.</p>
<pre class="once">set lives to 3
change lives by -1
say lives          -- 2</pre>
<p><code>set x to x * 2</code> uses the old value to make the new one.</p>`,
    task: 'Start <code>coins</code> at 10. Double it with <code>set</code>, add 5 with <code>change</code>, then say it. It should be 25.',
    starter: '-- Coins\nset coins to 10\n',
    solution: '-- Coins\nset coins to 10\nset coins to coins * 2\nchange coins by 5\nsay coins\n',
    check: (c) => {
      if (!has(c, /\bchange\s+coins\s+by\b/)) return 'Use change coins by 5 to add the 5.';
      return c.out.includes('25') ? null : 'Say coins at the end. It should come out as 25.';
    },
  },
  {
    id: 'choosing', part: BASICS, title: 'Making choices',
    body: `
<p><code>if</code> runs its steps only when something is true. <code>otherwise if</code> tries another condition, and <code>otherwise</code> catches everything else. Every block closes with <code>end</code>.</p>
<pre class="once">if score is above 100
  say "Legend"
otherwise if score is at least 50
  say "Great"
otherwise
  say "Keep going"
end</pre>
<p>Comparisons: <code>is</code>, <code>is not</code>, <code>is above</code>, <code>is below</code>, <code>is at least</code>, <code>is at most</code> (or <code>=</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code>). Join them with <code>and</code>, <code>or</code> and <code>not</code>.</p>
<p>For a single step, put it on the same line with <code>then</code>. That kind of <code>if</code> needs no <code>end</code>:</p>
<pre class="once">if lives is 0 then say "Game over"</pre>`,
    task: 'Set <code>temp</code> to a number. Say "hot" if it is above 25, "cold" if it is below 10, and "nice" otherwise.',
    starter: '-- Weather\nset temp to 18\n',
    solution: '-- Weather\nset temp to 18\n\nif temp is above 25\n  say "hot"\notherwise if temp is below 10\n  say "cold"\notherwise\n  say "nice"\nend\n',
    check: (c) => {
      if (!has(c, /\bif\b/) || !has(c, /\botherwise\s+if\b/) || !has(c, /\botherwise\s*$/m)) return 'Use if, otherwise if, and otherwise (each on its own line), and close with end.';
      return c.out.some((l) => ['hot', 'cold', 'nice'].includes(l.trim())) ? null : 'Say exactly "hot", "cold" or "nice".';
    },
  },
  {
    id: 'loops', part: BASICS, title: 'Repeating',
    body: `
<p>Loops run steps again and again:</p>
<pre class="once">repeat 3 times
  say "knock"
end

for each n from 1 to 5
  say n
end

for each n from 10 to 0 by -5
  say n          -- 10, 5, 0
end</pre>
<p><code>repeat while ...</code> keeps going while something is true, and <code>repeat until ...</code> stops when it becomes true. Inside any loop, <code>stop</code> leaves it early and <code>skip</code> jumps to the next turn.</p>
<pre class="once">for each n from 1 to 100
  if n mod 7 is not 0 then skip
  say "{n} is the first number that 7 goes into"
  stop
end</pre>`,
    task: 'Say the even numbers from 2 to 10, one per line (2, 4, 6, 8, 10).',
    starter: '-- Even numbers\n',
    solution: '-- Even numbers\nfor each n from 2 to 10 by 2\n  say n\nend\n',
    check: (c) => (c.out.join(',') === '2,4,6,8,10' ? null : `The output should be 2, 4, 6, 8, 10, each on its own line. Hint: count with "by 2".`),
  },
  {
    id: 'lists', part: BASICS, title: 'Lists',
    body: `
<p>A <b>list</b> keeps several values in order, inside square brackets.</p>
<pre class="once">set pets to ["cat", "owl", "toad"]
add "fox" to pets
remove "owl" from pets
say pets               -- ["cat", "toad", "fox"]
say item 1 of pets     -- cat (lists count from 1)
say pets[2]            -- toad
say length of pets     -- 3
say any of pets        -- one at random
say pets contains "cat"</pre>
<p><code>for each</code> goes through every item:</p>
<pre class="once">for each pet in pets
  say "Goodnight, {pet}"
end</pre>`,
    task: 'Make a list called <code>bag</code> with 3 things, <code>add</code> a 4th, and say how many things are in it (4).',
    starter: '-- My bag\n',
    solution: '-- My bag\nset bag to ["map", "apple", "rope"]\nadd "lamp" to bag\nsay "My bag has {length of bag} things."\n',
    check: (c) => {
      if (!has(c, /\bset\s+bag\s+to\s+\[/)) return 'Start with: set bag to ["...", "...", "..."]';
      if (!has(c, /\badd\b.*\bto\s+bag\b/)) return 'Use add ... to bag for the 4th thing.';
      return c.out.some((l) => /\b4\b/.test(l)) ? null : 'Say how many things are in the bag, with length of bag.';
    },
  },
  {
    id: 'records', part: BASICS, title: 'Records',
    body: `
<p>A <b>record</b> bundles named values together, like a character sheet. Read and change them with <code>'s</code>, just like in English.</p>
<pre class="once">set hero to {name: "Mo", hp: 10, items: []}
change hero's hp by -2
add "sword" to hero's items
set hero's mood to "brave"     -- adds a new value
say "{hero's name} has {hero's hp} hp"</pre>
<p>Records are great for keeping everything about one thing in one place.</p>`,
    task: 'Make a <code>hero</code> record with a name and 10 hp. Take 3 damage with <code>change</code>, then say the hero\'s name and hp (7).',
    starter: '-- A hero\n',
    solution: '-- A hero\nset hero to {name: "Mo", hp: 10}\nchange hero\'s hp by -3\nsay "{hero\'s name} has {hero\'s hp} hp"\n',
    check: (c) => {
      if (!has(c, /\bset\s+hero\s+to\s+\{/)) return 'Start with: set hero to {name: "...", hp: 10}';
      if (!has(c, /\bchange\s+hero['’]s\s+hp\s+by\b/)) return "Use change hero's hp by -3.";
      return c.out.some((l) => /\b7\b/.test(l)) ? null : "Say the hero's hp. It should be 7.";
    },
  },
  {
    id: 'instructions', part: BASICS, title: 'Your own instructions',
    body: `
<p>Teach Once a new word with <code>to</code>. List its inputs after the name, joined by <code>and</code>. <code>give back</code> hands a value back.</p>
<pre class="once">-- Works out the area of a rectangle.
to area w and h
  give back w * h
end

say area(3, 4)       -- 12</pre>
<p>Use your instructions by writing the name with the values in brackets. Ones without inputs use empty brackets, like <code>reset()</code>. Instructions with one input can also be written with <code>of</code>, like <code>square of 5</code>.</p>
<p>Comment lines right above a <code>to</code> become its description: in VS Code, hovering its name shows them.</p>`,
    task: 'Write <code>to square n</code> that gives back n times n, then say <code>square(7)</code> (49).',
    starter: '-- Squares\n',
    solution: '-- Squares\n-- Gives back n times itself.\nto square n\n  give back n * n\nend\n\nsay square(7)\n',
    check: (c) => {
      if (!has(c, /^\s*to\s+square\s+\w+/m)) return 'Start with: to square n';
      if (!has(c, /\bgive\s+back\b/)) return 'Inside it, use give back n * n.';
      return c.out.includes('49') ? null : 'Say square(7). It should be 49.';
    },
  },
  {
    id: 'drawing', part: PICTURES, title: 'Drawing',
    body: `
<p>The preview is <b>480 wide and 360 tall</b>. Point <code>0, 0</code> is the <b>top left</b>; <code>x</code> grows to the right and <code>y</code> grows <b>down</b>.</p>
<p><code>draw</code> takes a shape and some settings, in any order:</p>
<pre class="once">draw circle at 240, 180 size 80 color "gold"
draw box at 240, 320 size 480, 80 color "seagreen"
draw line from 20, 20 to 200, 60 width 4
draw text "Hello" at 20, 100 size 32</pre>
<p><code>at</code> is the <b>middle</b> of circles and boxes, and the <b>top left</b> of text. <code>size</code> is the width of a circle, the width and height of a box, or the font size of text. Add <code>outline</code> to draw just the edge.</p>`,
    task: 'Draw a face: at least 3 circles (a head and two eyes). Add a mouth with a line or box if you like.',
    starter: '-- A face\ndraw circle at 240, 180 size 200 color "#f5a524"\n',
    solution: '-- A face\ndraw circle at 240, 180 size 200 color "#f5a524"\ndraw circle at 205, 150 size 24 color "#1f1f1f"\ndraw circle at 275, 150 size 24 color "#1f1f1f"\ndraw line from 200, 220 to 280, 220 width 6\n',
    check: (c) => (count(c, /\bdraw\s+circle\b/) >= 3 ? null : 'Draw at least 3 circles: one for the head and two for eyes.'),
  },
  {
    id: 'colors', part: PICTURES, title: 'Colors',
    body: `
<p>Colors are text: a name like <code>"tomato"</code> or <code>"skyblue"</code>, or a code like <code>"#0078d4"</code>. You can also make them from numbers:</p>
<pre class="once">draw box at 100, 100 size 60 color rgb(255, 120, 0)     -- red, green, blue: 0 to 255
draw box at 200, 100 size 60 color hsl(200, 80, 50)     -- hue 0-360, saturation, lightness</pre>
<p><code>background</code> fills the whole preview behind everything:</p>
<pre class="once">background "#1f1f1f"</pre>
<p><code>hsl</code> is handy in loops: changing just the hue walks around the rainbow.</p>`,
    task: 'Set a <code>background</code>, then use a loop and <code>hsl</code> (or <code>rgb</code>) to draw a row of 6 differently colored boxes.',
    starter: '-- A rainbow row\n',
    solution: '-- A rainbow row\nbackground "#1f1f1f"\nfor each i from 0 to 5\n  draw box at 40 + i * 80, 180 size 70 color hsl(i * 60, 80, 55)\nend\n',
    check: (c) => {
      if (!has(c, /^\s*background\b/m)) return 'Add a background line.';
      if (!has(c, /\b(for\s+each|repeat)\b/)) return 'Use a loop (for each or repeat) to draw the boxes.';
      if (!has(c, /\b(hsl|rgb)\s*\(/)) return 'Make the colors with hsl(...) or rgb(...).';
      return has(c, /\bdraw\s+box\b/) ? null : 'Draw boxes inside the loop.';
    },
  },
  {
    id: 'animation', part: PICTURES, title: 'Animation',
    body: `
<p>Steps inside <code>every frame</code> run <b>60 times a second</b>. Drawings made there are wiped and redrawn each time, so changing a number a little each frame makes things move.</p>
<pre class="once">set x to 0

every frame
  change x by 3
  draw circle at x, 180 size 40 color "tomato"
end</pre>
<p>Drawings outside <code>every frame</code> stay put until you <code>clear</code>. <code>time</code> is the seconds since the program started, and <code>sin</code>/<code>cos</code> (in degrees) make smooth waves:</p>
<pre class="once">every frame
  draw circle at 240 + cos(time * 90) * 100, 180 size 30
end</pre>`,
    task: 'Make a circle travel to the right, and when it goes past the right edge, send it back to the left so it loops forever.',
    starter: '-- Moving circle\nset x to 0\n\nevery frame\n  draw circle at x, 180 size 40 color "tomato"\nend\n',
    solution: '-- Moving circle\nset x to 0\n\nevery frame\n  change x by 4\n  if x is above width + 20 then set x to -20\n  draw circle at x, 180 size 40 color "tomato"\nend\n',
    check: (c) => {
      if (!has(c, /\bevery\s+frame\b/)) return 'Put the drawing inside every frame.';
      if (!has(c, /\bchange\s+x\s+by\b/)) return 'Inside every frame, change x by a few pixels.';
      return has(c, /\bif\b[^\n]*\bx\b/) ? null : 'Use an if to send x back to the left when it gets past the edge (width is 480).';
    },
  },
  {
    id: 'things', part: PICTURES, title: 'Shapes that move',
    body: `
<p><code>new</code> makes a shape that stays on screen and moves <b>by itself</b>. Keep it in a name to change it later.</p>
<pre class="once">set ball to new circle at 100, 60 size 30 moving 3, 0 bouncy solid</pre>
<p>Extra settings for <code>new</code> shapes:</p>
<ul>
<li><code>moving dx, dy</code>: how far it moves across and down each frame</li>
<li><code>bouncy</code>: bounces off the edges (<code>bouncy 0.8</code> loses some speed; <code>bouncy 0</code> just stops at the edges)</li>
<li><code>solid</code>: bumps into other solid shapes</li>
<li><code>fixed</code>: never moves by itself, good for walls</li>
</ul>
<p><code>set gravity to 0.3</code> pulls every shape that isn't fixed. Read and change a shape with <code>'s</code>: <code>ball's x</code>, <code>ball's dy</code>, <code>ball's color</code>... and <code>remove ball</code> takes it away.</p>`,
    task: 'Turn on gravity and make at least 3 bouncy shapes with <code>new</code>.',
    starter: '-- Bouncing\n',
    solution: '-- Bouncing\nset gravity to 0.3\nrepeat 5 times\n  new circle at random 40 to 440, random 20 to 120 size 30 moving random -3 to 3, 0 bouncy 0.9 solid\nend\n',
    check: (c) => {
      const g = c.vars.get('gravity');
      if (typeof g !== 'number' || g <= 0) return 'Set gravity to a number above 0, like 0.3.';
      if (c.things.length < 3) return 'Make at least 3 shapes with new (a repeat loop is handy).';
      return c.things.some((t) => t.walls) ? null : 'Give them the bouncy setting.';
    },
  },
  {
    id: 'keyboard', part: PICTURES, title: 'The keyboard',
    body: `
<p>Two ways to listen to keys. <code>holding "key"</code> is true for as long as a key is down, which is perfect for movement inside <code>every frame</code>:</p>
<pre class="once">every frame
  if holding "left" then change hero's x by -4
end</pre>
<p><code>when key ... is pressed</code> runs once each time the key goes down, which is perfect for jumping or shooting:</p>
<pre class="once">when key "space" is pressed
  play sound "jump"
end</pre>
<p>Key names: <code>"left"</code>, <code>"right"</code>, <code>"up"</code>, <code>"down"</code>, <code>"space"</code>, <code>"enter"</code>, a letter like <code>"a"</code>, or <code>"any"</code>. <b>Click the preview first</b> so it gets the keyboard.</p>`,
    task: 'Make a box you can move in all four directions with the arrow keys, and that plays a sound when you press space.',
    starter: '-- Move me\nset hero to new box at 240, 180 size 30 color "#0078d4" bouncy 0\n',
    solution: '-- Move me\nset hero to new box at 240, 180 size 30 color "#0078d4" bouncy 0\n\nevery frame\n  if holding "left" then change hero\'s x by -4\n  if holding "right" then change hero\'s x by 4\n  if holding "up" then change hero\'s y by -4\n  if holding "down" then change hero\'s y by 4\nend\n\nwhen key "space" is pressed\n  play sound "jump"\nend\n',
    check: (c) => {
      for (const k of ['left', 'right', 'up', 'down']) if (!has(c, new RegExp(`holding\\s+"${k}"`))) return `Use holding "${k}" inside every frame to move.`;
      return has(c, /when\s+key\s+"space"\s+is\s+pressed/) ? null : 'Add when key "space" is pressed ... end with a play sound inside.';
    },
  },
  {
    id: 'mouse', part: PICTURES, title: 'The mouse',
    body: `
<p><code>mouse's x</code> and <code>mouse's y</code> are where the pointer is over the preview, and <code>mouse's down</code> is true while a button is pressed.</p>
<pre class="once">every frame
  draw circle at mouse's x, mouse's y size 20 color "gold"
end</pre>
<p><code>when mouse is clicked</code> runs once per click:</p>
<pre class="once">when mouse is clicked
  new circle at mouse's x, mouse's y size 16 moving 0, 2
end</pre>`,
    task: 'Draw a small circle that follows the mouse every frame, and make a new shape where you click.',
    starter: '-- Mouse fun\n',
    solution: '-- Mouse fun\nevery frame\n  draw circle at mouse\'s x, mouse\'s y size 14 color "#0078d4"\nend\n\nwhen mouse is clicked\n  new circle at mouse\'s x, mouse\'s y size 24 color any of ["tomato", "gold", "teal"] moving 0, 2\nend\n',
    check: (c) => {
      if (!(has(c, /\bevery\s+frame\b/) && has(c, /draw\s+\w+\s+at\s+mouse['’]s\s+x/))) return "Inside every frame, draw something at mouse's x, mouse's y.";
      return has(c, /when\s+mouse\s+is\s+clicked/) ? null : 'Add when mouse is clicked ... end that makes a new shape.';
    },
  },
  {
    id: 'collisions', part: PICTURES, title: 'Collisions',
    body: `
<p><code>a touches b</code> is true when two <code>new</code> shapes overlap. Either side can be a list of shapes, and <code>edge</code> means the border of the preview.</p>
<pre class="once">every frame
  if ball touches paddle then set ball's dy to -5
  if ball touches edge then play sound "click"
end</pre>
<p><code>when a touches b</code> runs once, at the moment they first meet:</p>
<pre class="once">when hero touches coin
  remove coin
  play sound "coin"
end</pre>
<p><code>remove</code> takes a shape off the screen. <code>hide</code> and <code>show</code> make it disappear and come back.</p>`,
    task: 'Make the box move toward the coin. When they touch, remove the coin and say "Got it!".',
    starter: '-- Collect the coin\nset coin to new circle at 380, 180 size 26 color "gold" fixed\nset bug to new box at 60, 180 size 30 color "#30a46c"\n',
    solution: '-- Collect the coin\nset coin to new circle at 380, 180 size 26 color "gold" fixed\nset bug to new box at 60, 180 size 30 color "#30a46c" moving 5, 0\n\nwhen bug touches coin\n  remove coin\n  set bug\'s dx to 0\n  play sound "coin"\n  say "Got it!"\nend\n',
    wait: 1.6,
    check: (c) => {
      if (!has(c, /\btouches\b/)) return 'Use touches (for example: when bug touches coin).';
      if (!has(c, /\bremove\s+coin\b/)) return 'Remove the coin when they touch.';
      return c.out.some((l) => /got it/i.test(l)) ? null : 'Make the bug move (moving 5, 0) so it reaches the coin, then say "Got it!".';
    },
  },
  {
    id: 'time', part: PICTURES, title: 'Sound and time',
    body: `
<p><code>play note</code> plays a note by name: <code>"C4"</code> is middle C, and <code>"F#5"</code> or <code>"Bb3"</code> work too. Add <code>for</code> (seconds), <code>wave</code> and <code>volume</code>. <code>play sound</code> plays a ready-made effect: beep, boop, coin, jump, pop, hit, boom, click.</p>
<pre class="once">play note "E5" for 0.2 wave "square"
play sound "coin"</pre>
<p><code>wait</code> pauses this part of the program while everything else keeps running. <code>every 2 seconds</code> runs on a clock, and <code>the end</code> stops everything.</p>
<pre class="once">say "3"
wait 1 second
say "2"
wait 1 second
say "1"
wait 1 second
say "Go!"
the end</pre>`,
    task: 'Play a tune of at least 4 notes, with a <code>wait</code> between them, then finish with <code>the end</code>.',
    starter: '-- A tune\n',
    solution: '-- A tune\nfor each n in ["C4", "E4", "G4", "C5"]\n  play note n for 0.3\n  wait 0.25 seconds\nend\nthe end\n',
    wait: 1.4,
    check: (c) => {
      const notes = count(c, /\bplay\s+note\b/) + (has(c, /for\s+each\s+\w+\s+in\s+\[[^\]]*("[^"]*"\s*,\s*){3}/) ? 4 : 0);
      if (notes < 4 && !has(c, /\brepeat\b[\s\S]*play\s+note/)) return 'Play at least 4 notes (four play note lines, or a loop over 4 notes).';
      if (!has(c, /\bwait\b/)) return 'Put a wait between the notes.';
      return has(c, /^\s*the\s+end\b/m) ? null : 'Finish with the end.';
    },
  },
  {
    id: 'mistakes', part: PICTURES, title: 'Fixing mistakes',
    body: `
<p>Everyone makes mistakes. When Once finds one, it underlines it in red and explains it in the <b>Problems</b> panel, usually with a hint or a guess at what you meant.</p>
<p>The most common ones:</p>
<ul>
<li>A typo in a word or name: "I don't know what <code>scroe</code> is. Did you mean <code>score</code>?"</li>
<li>A block without its <code>end</code>: "This <code>if</code> on line 3 is never closed with <code>end</code>."</li>
<li>Text in a calculation: use <code>number("5")</code> to turn text into a number.</li>
</ul>
<p>Click a problem to jump to its line.</p>`,
    task: 'This program has three mistakes. Fix them all so it says <code>Score: 15</code>.',
    starter: '-- Fix me\nset score to 0\nrepeat 3 times\n  change score by 5\nsey "Score: {scroe}"\n',
    solution: '-- Fix me\nset score to 0\nrepeat 3 times\n  change score by 5\nend\nsay "Score: {score}"\n',
    check: (c) => (c.error ? 'There is still a problem. Read the Problems panel.' : c.out.includes('Score: 15') ? null : 'Make sure the say line is after the end of the repeat, so it runs once.'),
  },
  {
    id: 'shooter-1', part: SHOOTER, title: 'The player',
    body: `
<p>Time to build a real game: a <b>top-down shooter</b>. You move a little ship around, aim with the mouse, and shoot the enemies that keep coming at you.</p>
<p>We'll build it in steps, and each step starts with the code from the last one. First: the player. It's a <code>new</code> box with <code>bouncy 0</code>, so it can't leave the screen. <code>speed</code> is kept in a name, so it's easy to tweak later.</p>
<p>For movement, use <code>holding</code> inside <code>every frame</code>. Players expect both the arrow keys and W A S D, and <code>or</code> handles both:</p>
<pre class="once">if holding "left" or holding "a" then change player's x by -speed</pre>`,
    task: 'Move the player with the arrow keys <b>and</b> W A S D in all four directions. Run it, click the preview, and try it.',
    starter: S1_START,
    solution: S1,
    check: (c) => {
      for (const [k, w] of [['left', 'a'], ['right', 'd'], ['up', 'w'], ['down', 's']]) {
        if (!has(c, new RegExp(`holding\\s+"${k}"`))) return `Use holding "${k}" to move the player.`;
        if (!has(c, new RegExp(`holding\\s+"${w}"`))) return `Also allow holding "${w}" (with or).`;
      }
      return has(c, /change\s+player['’]s\s+[xy]\s+by/) ? null : "Move with change player's x by ... and change player's y by ...";
    },
  },
  {
    id: 'shooter-2', part: SHOOTER, title: 'Aim and shoot',
    body: `
<p>Bullets should fly from the player <b>toward the mouse</b>. Two built-ins make that easy:</p>
<ul>
<li><code>angle(dx, dy)</code> gives the direction from one point to another, in degrees.</li>
<li><code>cos(a)</code> and <code>sin(a)</code> turn that direction into how far to move across and down. Multiply by a speed.</li>
</ul>
<pre class="once">set a to angle(mouse's x - player's x, mouse's y - player's y)
new circle at player's x, player's y size 8 moving cos(a) * 9, sin(a) * 9</pre>
<p>Put that in your own instructions called <code>shoot</code>, and keep every bullet in a <code>bullets</code> list (you'll need it for hits later). Then call <code>shoot()</code> on a click and on space.</p>
<p>A faint line from the player to the mouse helps with aiming. Colors can have transparency with 8-digit codes like <code>"#88888866"</code>.</p>`,
    task: 'Add a <code>bullets</code> list and a <code>to shoot</code> that fires toward the mouse. Shoot on click and on space.',
    starter: S1.replace('step 1: the player', 'step 2: aim and shoot'),
    solution: S2,
    check: (c) => {
      if (!has(c, /set\s+bullets\s+to\s+\[\s*\]/)) return 'Start an empty list: set bullets to []';
      if (!has(c, /^\s*to\s+shoot\b/m)) return 'Write your own instructions: to shoot ... end';
      if (!has(c, /angle\s*\(/) || !has(c, /cos\s*\(/) || !has(c, /sin\s*\(/)) return 'Inside shoot, use angle(...) and then cos(a) and sin(a) for the bullet\'s moving.';
      if (!has(c, /add\s+\w+\s+to\s+bullets/)) return 'Add each new bullet to the bullets list.';
      if (!has(c, /when\s+mouse\s+is\s+clicked/)) return 'Call shoot() in when mouse is clicked.';
      return has(c, /when\s+key\s+"space"\s+is\s+pressed/) ? null : 'Also call shoot() in when key "space" is pressed.';
    },
  },
  {
    id: 'shooter-3', part: SHOOTER, title: 'Enemies',
    body: `
<p>Enemies appear just outside a random side of the screen, once a second, and walk toward the player.</p>
<p>Write <code>to spawn</code>: pick a random spot, push it off one side with <code>random 1 to 4</code>, make a red circle, and add it to an <code>enemies</code> list. Shapes can hold your own values too, so give each one a <code>pace</code>:</p>
<pre class="once">set e's pace to 1.5</pre>
<p>Call it with <code>every 1 seconds</code>. Then, every frame, point each enemy at the player, using the same <code>angle</code> trick as the bullets but aimed the other way:</p>
<pre class="once">for each e in enemies
  set a to angle(player's x - e's x, player's y - e's y)
  set e's dx to cos(a) * e's pace
  set e's dy to sin(a) * e's pace
end</pre>`,
    task: 'Add an <code>enemies</code> list, a <code>to spawn</code> that runs <code>every 1 seconds</code>, and make every enemy chase the player.',
    starter: S2.replace('step 2: aim and shoot', 'step 3: enemies'),
    solution: S3,
    wait: 1.4,
    check: (c) => {
      if (!has(c, /set\s+enemies\s+to\s+\[\s*\]/)) return 'Start an empty list: set enemies to []';
      if (!has(c, /^\s*to\s+spawn\b/m)) return 'Write to spawn ... end that makes an enemy.';
      if (!has(c, /add\s+\w+\s+to\s+enemies/)) return 'Add each new enemy to the enemies list.';
      if (!has(c, /every\s+[\d.]+\s+seconds?/)) return 'Call spawn() from every 1 seconds.';
      if (!has(c, /for\s+each\s+\w+\s+in\s+enemies/)) return 'In every frame, go through the enemies with for each.';
      return has(c, /['’]s\s+dx\s+to/) ? null : "Set each enemy's dx and dy so it moves toward the player.";
    },
  },
  {
    id: 'shooter-4', part: SHOOTER, title: 'Hits and score',
    body: `
<p>Now bullets need to hit things. Check every bullet against every enemy, a loop inside a loop:</p>
<pre class="once">for each b in bullets
  for each e in enemies
    if b touches e
      remove b
      remove b from bullets
      remove e
      remove e from enemies
      change score by 1
    end
  end
end</pre>
<p><code>remove b</code> takes the shape off the screen, and <code>remove b from bullets</code> takes it out of the list. Do both. (It's safe to remove things inside <code>for each</code>: the loop goes through a copy of the list.)</p>
<p>Bullets that fly off screen should be cleaned up too, with <code>if b touches edge</code>. Finally, show the score with <code>draw text</code>.</p>`,
    task: 'Keep a <code>score</code>. When a bullet touches an enemy, remove both and add 1 to the score. Clean up bullets at the edge, and draw the score.',
    starter: S3.replace('step 3: enemies', 'step 4: hits and score'),
    solution: S4,
    check: (c) => {
      if (!has(c, /set\s+score\s+to\s+0/)) return 'Start with: set score to 0';
      if (!has(c, /for\s+each\s+(\w+)\s+in\s+bullets[\s\S]*for\s+each\s+\w+\s+in\s+enemies/)) return 'Loop over bullets, and inside that, over enemies.';
      if (!has(c, /\w+\s+touches\s+\w+/)) return 'Check if a bullet touches an enemy.';
      if (!has(c, /remove\s+\w+\s+from\s+enemies/) || !has(c, /remove\s+\w+\s+from\s+bullets/)) return 'Remove both from their lists (remove e from enemies, remove b from bullets).';
      if (!has(c, /change\s+score\s+by\s+1/)) return 'change score by 1 on a hit.';
      if (!has(c, /touches\s+edge/)) return 'Clean up bullets that touch the edge.';
      return has(c, /draw\s+text\b[^\n]*\{score\}/) ? null : 'Draw the score with draw text "Score {score}" ...';
    },
  },
  {
    id: 'shooter-5', part: SHOOTER, title: 'Lives and game over',
    body: `
<p>A game needs a way to lose. Start with 3 <code>lives</code>. Each frame, check whether any enemy touches the player. If one does, remove it and take away a life. At 0 lives, say the final score and stop everything with <code>the end</code>.</p>
<pre class="once">for each e in enemies
  if e touches player
    remove e
    remove e from enemies
    change lives by -1
    if lives is 0
      say "Game over! Final score: {score}"
      the end
    end
  end
end</pre>
<p>Show the lives next to the score in the same <code>draw text</code>.</p>`,
    task: 'Add 3 <code>lives</code>. Lose one when an enemy touches the player; at 0, say the final score and use <code>the end</code>. Show lives on screen.',
    starter: S4.replace('step 4: hits and score', 'step 5: lives and game over'),
    solution: S5,
    check: (c) => {
      if (!has(c, /set\s+lives\s+to\s+3/)) return 'Start with: set lives to 3';
      if (!has(c, /\w+\s+touches\s+player/)) return 'Check whether an enemy touches the player.';
      if (!has(c, /change\s+lives\s+by\s+-1/)) return 'change lives by -1 when that happens.';
      if (!has(c, /^\s*the\s+end\b/m) && !has(c, /then\s+the\s+end/)) return 'At 0 lives, finish with the end.';
      return has(c, /draw\s+text\b[^\n]*\{lives\}/) ? null : 'Show the lives on screen too, with {lives} in the draw text.';
    },
  },
  {
    id: 'shooter-6', part: SHOOTER, title: 'Make it yours',
    body: `
<p>You built a whole game. Here are some ideas to make it your own:</p>
<ul>
<li><b>Harder over time:</b> make each enemy's <code>pace</code> grow with the score, and spawn two at a time later on (the solution shows both).</li>
<li><b>Different enemies:</b> sometimes spawn a big slow one that needs 3 hits: give it <code>set e's hp to 3</code> and count down.</li>
<li><b>A dash:</b> <code>when key "shift" is pressed</code>, briefly double <code>speed</code>, <code>wait 0.2 seconds</code>, then set it back.</li>
<li><b>Juice:</b> play notes on hits, flash the background, or leave a trail by drawing outside <code>every frame</code>.</li>
<li><b>High score:</b> keep the best score and show it on screen.</li>
</ul>
<p>When it's done, open it in the <a href="./">playground</a> to get a <b>Share</b> link or <b>Export HTML</b> as a single web page anyone can play. Look things up in the <a href="docs.html">docs</a> any time.</p>`,
    task: 'Change anything you like (try one of the ideas), then press Run. Have fun.',
    starter: S5.replace('step 5: lives and game over', 'my game'),
    solution: S6,
    check: (c) => (c.error ? 'Fix the problem in the Problems panel first.' : null),
  },
];
