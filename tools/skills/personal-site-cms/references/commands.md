# CLI commands

Invoke `node <skill-directory>/scripts/site.mjs ...`. Stdout is JSON, errors use stderr and a nonzero exit. Use absolute UTF-8 file paths. `help`, `schema`, `convert` and publication dry runs work offline.

| Resource | Contents | Scope |
| --- | --- | --- |
| site | Name, Logo, footer, navigation, copy/icons, section order/visibility, theme/player | site:read/write |
| profile | Avatar, contacts/facts, experience/projects/education, skills/honors/resume | profile:read/write |
| brands | Logo URL, label, monochrome mask, ratio, visibility | brands:read/write |
| gallery | Large/thumb URLs, title/place/date/copy, location and footprint link | gallery:read/write |
| music | Original audio URL, title/artist/album/note/cover/visibility | music:read/write |
| essays | Public path/folder, title/summary/tags/date/body/status/cover | essays:read/write |
| folders | Nested path, title and order | folders:read/write |
| footprints | Visited place, GCJ-02 point, date/region/note and photo ids | footprints:read/write |
| wishes | Future place, reason/region and optional point | wishes:read/write |
| media | Upload/list/download, deletion of unreferenced uploads | media:read/write |
| analytics | Date-limited aggregate reports | analytics:read |

```text
schema profile
get profile default
list gallery
upload --file C:/prepared/photo.jpg --purpose gallery
upload --file C:/prepared/song.flac --purpose music
upload --file C:/prepared/video.mp4 --purpose music
create gallery --data C:/prepared/photo.json
update gallery <id> --data C:/prepared/photo.json --revision 3
delete music <id> --revision 2
reorder gallery --data C:/prepared/complete-id-order.json
media
media-delete <unreferenced-id>
map-search --query "示例大学" --city "深圳"
map-gps --lng 113.9405 --lat 22.5394
visit wishes <id> --data C:/prepared/visit.json --revision 2
analytics --from 2026-10-01 --to 2026-10-03
publish --file C:/prepared/note.md --path 知识/新文章 --dry-run
convert --file C:/prepared/document.docx --out C:/prepared/converted --path 知识/新文章
publish --file C:/prepared/converted/index.md --path 知识/新文章 --status published
```

Chinese argv examples assume PowerShell. In git-bash, use UTF-8 files for payloads.

`reorder` takes {"ids":["b","a"],"revisions":{"a":1,"b":1}}: every current id exactly once and the latest revision of each record. Stale ordering is rejected. It increments record revisions; read again before later edits. `visit.json` is `{ "date":"2026-10-03", "note":"出行记录", "lnglat":[100,28] }`. Omit lnglat to keep the wish's point. Moving a wish requires wishes:write and footprints:write.

For gallery/music/interface changes, upload prepared files, inspect warnings/EXIF time/suggested location, inspect the resource schema, construct a JSON record using returned URLs, create/update it, and verify the public result. A gallery footprint is a visited-record id; relations update both sides. Location is `{ "lnglat":[lng,lat], "source":"exif|search|manual", "address":"..." }`. Music src uses original audio. Safe SVG logos become inert raster images, with ratio controlling their display dimensions.

MP4 music uploads keep only the first audio track converted to MP3: no video, subtitles, input metadata or MP4 original is retained. Use the returned `.mp3` filename and `variants.original` URL. Inputs/outputs are limited to 100 MB, conversion to 120 seconds and two simultaneous jobs; missing audio, invalid files and cancellation fail with cleanup. MP3 and existing audio formats remain supported. Reuse an existing asset URL rather than uploading another copy when appropriate.

Article frontmatter recognizes title/subtitle/summary/date/tags/cover/featured/publicPath. Missing dates default to today; replace that when the source date is known. Publication cancellation hides article bodies and their exclusively used attachments. The CLI cannot issue credentials; token creation/revocation requires the owner's browser session.
