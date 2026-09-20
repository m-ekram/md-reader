# Custom Themes

A theme is one CSS file that redefines a documented set of custom properties.
That is the whole contract: no selectors to match, no internal class names to
depend on, and the same file styles the document, the application chrome, and
anything you export.

## Adding one

Drop a `.css` file into the themes folder:

```
%APPDATA%\ekram.md\themes\
```

It appears in the **Themes** menu without restarting, under a separator below
the built-in themes. Editing the file updates the menu again.

## What to define

Scope everything to your theme's attribute, where the id is the filename
without its extension:

```css
:root[data-theme='my-theme'] {
  --doc-bg: #fffdf8;
  --doc-fg: #232020;
  --doc-accent: #a4552f;
}
```

Anything you leave out falls back to the default, so a theme can be three lines
or ninety.

### Document

`--doc-bg` `--doc-fg` `--doc-font` `--doc-font-size` `--doc-line-height`
`--doc-measure` `--doc-heading-fg` `--doc-muted` `--doc-accent` `--doc-rule`
`--doc-selection`

### Code, quotes and tables

`--code-bg` `--code-fg` `--code-font` `--code-font-size` `--quote-bar`
`--quote-fg` `--table-border` `--table-header-bg` `--table-stripe`

### Application chrome

`--chrome-bg` `--chrome-fg` `--chrome-fg-dim` `--chrome-hover` `--chrome-active`
`--chrome-border` `--chrome-accent` `--menu-bg` `--menu-fg` `--menu-fg-disabled`
`--menu-hover` `--menu-border` `--menu-shadow` `--sidebar-bg` `--sidebar-fg`
`--status-bg` `--status-fg`

A dark theme needs to set the chrome group too. Darkening only the document
leaves the title bar, menus and sidebar bright against it.

## Beyond the properties

Ordinary CSS works if you need it, scoped the same way:

```css
:root[data-theme='my-theme'] .milkdown a {
  text-decoration: underline;
}
```

Keep it scoped. An unscoped rule in a theme file restyles every other theme too.
