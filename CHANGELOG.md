# Changelog

## 1.1.1

- The right-click menu follows the media under the pointer. A photo offers image download, open, and post. A video, its poster, or the play control offers the video versions. Text, avatars, and emoji offer screenshot only. A click on the post body lists only media in that post, not media inside a quote, and lists both image and video actions only when that post itself has both.
- Open image uses the full-size image address. Open video uses a progressive MP4 or WebM the page already named. A blob address or a segmented stream is refused. The post URL is not substituted.
- Post image and Post video fetch the file and place it on the composer’s file picker for review. They do not click Post, reply, or retweet, and they do not call a create-post API. An existing draft is left alone and another composer tab is used.
- Up to four images. A file over 32 MB is refused. A video that is not MP4 or WebM is not attached.

## 1.1.0

- Right-click on a timeline post shows the extension’s own menu when the site replaces the browser menu. Shift+right-click keeps the site menu. Alt+right-click keeps the browser menu.
- Posts that are plain `article` elements are recognized.

## 1.0.0

- Plain-text paste in a composer is inserted with `insertText`.
- Download full image, download full video, and screenshot post.
