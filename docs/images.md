# Use Images

## Adding one

Paste a screenshot, or drag an image file into the document. Either way the
image is written into a folder beside the document and linked by a relative
path:

```
![alt text](assets/image-20260921-143022.png)
```

The folder is `assets` by default and can be changed in
`File ▸ Preferences… ▸ Images`.

## Why relative paths

A relative link keeps a notes folder portable. Move the folder, sync it to
another machine, or put it in version control, and the images still resolve.
An absolute path would break on the first move, and an embedded base64 blob
would bloat the file and make it awkward to diff.

The document has to be saved before an image can be added to it: without a file
on disk there is no folder to be relative to.

## Alt text

The text in the square brackets is the alt text and is kept exactly as you write
it. Selecting an image and choosing `Format ▸ Image ▸ Image Properties` shows
what the document records for it.

## Resizing

Dragging an image's handle resizes it for the current session only. Markdown has
no standard way to express a size, so writing one into the file would either be
ignored by other readers or overwrite the alt text — this editor does neither.

## In exports

Both HTML and PDF export embed images directly in the exported file, so the
result can be sent to someone else and still display. Images referenced by a
remote URL are left as links: exporting a local document does not go to the
network.
