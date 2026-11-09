# Install X Native Extension

## Upgrade from 1.1.0 or 1.0

1. Quit nothing. Unzip the new package over the folder you already loaded, or delete that folder’s files and unzip there. The folder must still contain `manifest.json`.
2. Open `chrome://extensions` or `brave://extensions` and click **Reload** on X Native Extension.
3. Refresh every open x.com tab. A tab that stayed open keeps the previous content script until it reloads.

## Install

Unzip `x-native-extension-unpacked.zip`. The folder you load must contain `manifest.json` directly inside it. Chrome and Brave do not install this package from a zip in the extensions page; they load the unpacked folder.

## Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder.
4. Pin **X Native Extension** if you want the paste toggle handy.
5. Open `https://x.com` and use a composer or right-click a post.

## Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the same folder.
4. Brave Shields do not need a change for this extension. It does not inject a remote script.

Leave the extension as a private unpacked install. Do not upload it to the Chrome Web Store from this package.

## Check that it is working

- Popup: “Rewrite plain-text paste” is on.
- In a post composer, `Ctrl+V` inserts plain text. Hold `Shift` (`Ctrl+Shift+V`) when you want the browser’s normal paste.
- Right-click a photo. The menu shows Download full image from post, Open image in new tab, Post image, and Screenshot post. It does not offer the video actions.
- Right-click a video, its poster, or the play button. The menu shows the video versions of those actions, plus Screenshot post.
- Right-click the words of a text post. The menu shows Screenshot post only.
- Post image or Post video attaches the file for you to review. It does not publish. If a draft is already open, that text stays and a new composer tab is used. A blob or segmented video is refused instead of opening an empty composer.
- Downloads are saved under `X-Native` in your downloads folder. A small note appears at the bottom right of the page when something is saved, attached, or refused.

The options page lists the measured paste behavior, video cases that are refused, and each permission.
