# X Native Extension

Version 1.1.1. A private unpacked extension for your own Chrome or Brave profile on [x.com](https://x.com). It rewrites a plain-text paste in a composer so the page receives typed text, and it adds a right-click menu for the post under the pointer.

The menu can download a full image or video, open that media in a new tab, attach it to a composer for you to review, or screenshot the post. **Post image** and **Post video** stop after the file is attached. They do not click Post, reply, or retweet, and they do not publish for you.

No license is granted. You may install and read this project. That is not permission to reuse it under an open-source license.

## Install the extension

Use the installable release asset, [x-native-extension-unpacked.zip](https://github.com/theesfeld/x-native-extension/releases/download/v1.1.1/x-native-extension-unpacked.zip), from the [latest release](https://github.com/theesfeld/x-native-extension/releases/latest).

That zip is the extension. Unzip it and load the folder that contains `manifest.json` directly inside it. Checksums for the release files are in `SHA256SUMS.txt` on the same release.

GitHub also lists **Source code (zip)** and **Source code (tar.gz)** on every release. Those are a snapshot of the repository. Chrome and Brave do not load them as this extension. `x-native-extension-source.zip`, when it is attached to the release, is the same kind of source snapshot for reading and development.

The asset link above works after the v1.1.1 release is published with that exact file name.

### Chrome

1. Unzip `x-native-extension-unpacked.zip`.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the unzipped folder.
5. Pin **X Native Extension** if you want the paste toggle in the toolbar.
6. Open `https://x.com`.

### Brave

1. Unzip the same file.
2. Open `brave://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the same folder.
5. Open `https://x.com`.

Brave Shields do not need a change. The extension does not inject a remote script.

### Upgrade from 1.1.0 or 1.0

1. Unzip the new package over the folder you already loaded, or replace the files in that folder. The folder must still contain `manifest.json`.
2. On `chrome://extensions` or `brave://extensions`, click **Reload** on X Native Extension.
3. Refresh every open x.com tab. A tab left open keeps the previous copy until it reloads.

## Right-click menu

X draws its own menu and hides the browser menu. A normal right-click on a post shows this extension’s menu on the page.

| You right-click | Actions |
| --- | --- |
| A photo in the post | Download full image from post, Open image in new tab, Post image, Screenshot post |
| A video, its poster, or the play control | Download full video from post, Open video in new tab, Post video, Screenshot post |
| The words of a text post | Screenshot post |

A click on the post body, away from a photo or video, uses only the media in that post. A quote is a separate post: media inside the quote is not treated as the outer post’s media, and a click inside the quote stays on the quote. Image and video actions both appear for a body click only when that same post contains both a photo and a video. Profile pictures, emoji, and video posters are not treated as post photos.

- **Shift+right-click** leaves X’s own menu in place.
- **Alt+right-click** leaves the browser menu in place. Chrome groups several extension items under the extension’s name. **Screenshot post** in that menu is a valid way to take the screenshot.

### Images

The photo under the pointer is the one that is used. If the pointer is on the post but not on a photo, the action covers the photos that belong to that post, up to four, and skips photos that belong only to a nested quote. Download and open use the public full-size address already implied by the image on the page (`name=orig`), then a smaller public size if that is all the host returns. The response is kept only when the bytes are a JPEG, PNG, GIF, or WebP.

### Open

**Open image in new tab** opens the full-size image, not the post. **Open video in new tab** opens a progressive MP4 or WebM the page already named. A blob address or a segmented stream is refused. No substitute address is invented, and the post’s own URL is not opened in its place.

### Post, for review only

**Post image** and **Post video** fetch the file and place it on the composer’s file picker so you can review it. They never click Post. If the page already has draft text, files, or an attachment preview, that draft is left as it is and a new composer tab is opened with the file.

Up to four images are attached. A file over 32 MB is refused. A video that is not an MP4 or WebM file is refused, and an empty composer is not opened in that case.

This path was confirmed on a local fixture: the file was on the picker and Post was not clicked. It was not confirmed on a signed-in x.com composer. The notice the page receives is not a trusted browser event. If X ignores it, the composer preview can stay empty even though the picker holds the file. An empty preview is not a published post, and it is not proof that X accepted the attachment.

## Paste

In a post, reply, edit, or message composer, a plain-text paste is inserted as typed text. The page does not receive the paste event. Newlines and emoji are kept. One undo removes that insertion when the browser’s editing history accepts it. The search box is left alone. Files and images on the clipboard are left alone. Text longer than 100,000 characters is left as a normal paste.

This is one editing command, not a series of hidden keystrokes. It is not invisible, and it is not a way around X’s own checks. A signed-in x.com composer was not part of the automated check.

Turn **Rewrite plain-text paste** off in the toolbar popup or on the options page when you want every paste to stay normal.

Ways to allow one normal paste while rewrite stays on:

- Hold Shift while pasting (`Ctrl+Shift+V` or `Shift+Insert`).
- Press `Alt+Shift+V`, or the popup button **Next paste is normal**, and then paste once. Use that before the right-click Paste menu, which has no Shift key.

`Alt+Ctrl+V` does not paste on Linux Chrome, so Alt by itself is not the bypass.

## Screenshot

**Screenshot post** saves a PNG of the post you right-clicked, including the part that was below the fold. It uses the browser’s own window capture and crops to the post. It does not send the page to another service. The picture shows the current video frame, not a video file.

Chrome allows that capture only after the extension has been invoked. A button drawn on the page does not count.

1. Right-click the post so the menu knows which post you mean.
2. Press `Alt+Shift+S`, or Alt+right-click and choose **Screenshot post** in the browser menu.
3. After one of those, the on-page **Screenshot post** item works on that tab until you navigate.

If `Alt+Shift+S` does nothing, another extension or the operating system may be using that shortcut. Open `chrome://extensions/shortcuts` or `brave://extensions/shortcuts` and change **Screenshot the post from the latest right-click**, or use the browser-menu item instead.

## Downloads

Saved images, videos, and screenshots go to the `X-Native` folder inside your downloads folder. A short note appears at the bottom right of the page when something is saved, attached, or refused.

A file over 32 MB is refused rather than saved in part.

### Video

Only video addresses the page itself already had, on `video.twimg.com`, are used.

| What the page has | What you get |
| --- | --- |
| MP4 or WebM whose bytes match | That file |
| Unencrypted HLS | The highest listed variant, joined |
| MPEG-TS segments | A `.ts` file, which VLC can open. It is not renamed to `.mp4` |
| Encrypted playlist | Nothing. The extension does not decrypt it |
| Separate audio track | The video file may be silent. Audio is not mixed in |
| `blob:` or a media buffer only | Nothing. Play the video and try again after a real file address appears |
| HTML or JSON | Nothing |

## Permissions and privacy

| Permission | Why it is there |
| --- | --- |
| Storage | Remember the paste checkbox on this browser |
| Context menus | Register the post actions |
| Downloads | Save files into `X-Native` |
| Active tab | Chrome requires this for a window screenshot after you invoke the extension. It is not access to every site |
| `x.com` and `twitter.com` | Run on X |
| `pbs.twimg.com` | Download a post photo the page already showed |
| `video.twimg.com` | Download a video or playlist the page already requested |

The extension does not request access to every website. It does not read your cookies from page script, does not ask for an X API key, and does not send what you type or download to another server. The browser may still send the cookies it already has when the extension fetches a photo or video from those hosts.

## Troubleshooting

**The menu is missing, or you only see Copy photo link and Post Photo.** Reload the extension, then refresh the x.com tab. Right-click the post without holding Shift. Shift+right-click is the path that keeps X’s menu.

**Post image or Post video did not show a preview.** The action does not publish. On a signed-in account, X may ignore the attachment notice, so the preview can stay empty. Look at the note at the bottom right of the page. If it says the file was not accepted, nothing was attached. If a draft was already open, the file was sent to a new composer tab and the original draft was left alone.

**Open video or Post video says nothing was opened.** The player only had a blob or a segmented stream. Nothing is invented in its place. Start playback until the page has a progressive MP4 or WebM, then try again.

**Screenshot says Chrome blocked it.** Press `Alt+Shift+S` after the right-click, or choose **Screenshot post** from the browser menu with Alt+right-click. If the shortcut is taken, change it on the extensions shortcuts page.

## What has been checked

| Behavior | Local fixtures in Chrome for Testing | Signed-in x.com | Brave |
| --- | --- | --- | --- |
| Paste rewrite, undo, and Shift bypass | Checked | Not checked | Not checked |
| Menu differs for a photo, a video or poster, text, a quote, and a mixed post | Checked | Not checked for 1.1.1 | Not checked |
| Open image uses the full-size image address | Checked | Not checked | Not checked |
| Blob video is refused and no tab is opened | Checked | Not checked | Not checked |
| Post puts the file on an empty composer and does not submit | Checked | Not checked | Not checked |
| An existing draft is left alone | Checked | Not checked | Not checked |
| Tall post screenshot is one PNG | Checked | Not checked | Not checked |

A signed-in attachment on x.com was not verified. Brave was not tested. Do not treat the fixture result as either of those.

## Version

1.1.1 adds the image-versus-video menu, open in a new tab, and attach-for-review. 1.1.0 added the on-page menu for sites that hide the browser menu. 1.0.0 added paste rewrite, download, and screenshot. The full list is in [CHANGELOG.md](CHANGELOG.md). Release notes for 1.1.1 are in [release/v1.1.1.md](release/v1.1.1.md).
