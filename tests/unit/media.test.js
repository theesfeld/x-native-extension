import assert from "node:assert/strict";
import test from "node:test";
import { concatBytes, resolveImage, resolveVideo } from "../../src/lib/download-media.js";
import { parsePlaylist, pickVariant } from "../../src/lib/playlist.js";
import { sniffBytes } from "../../src/lib/sniff.js";
import { collectVideoUrls, resolutionScore } from "../../src/lib/video-url.js";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MP4 = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00]);
const HTML = new TextEncoder().encode("<!DOCTYPE html><html><body>nope</body></html>");

test("sniff trusts magic bytes and rejects markup even if someone labeled it video", () => {
  assert.equal(sniffBytes(JPEG).ext, "jpg");
  assert.equal(sniffBytes(PNG).ext, "png");
  assert.equal(sniffBytes(MP4).ext, "mp4");
  assert.equal(sniffBytes(HTML).kind, "other");
  assert.equal(sniffBytes(new TextEncoder().encode("#EXTM3U\n")).kind, "playlist");
  const ts = new Uint8Array(188 * 2);
  ts[0] = 0x47;
  ts[188] = 0x47;
  assert.equal(sniffBytes(ts).ext, "ts");
});

test("hls master picks the highest variant and refuses encryption", () => {
  const master = parsePlaylist(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=128000,RESOLUTION=640x360
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=1280x720,AUDIO="a"
mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=200000,RESOLUTION=1920x1080
high.m3u8
`);
  assert.equal(master.kind, "master");
  assert.equal(pickVariant(master.variants).uri, "high.m3u8");
  const encrypted = parsePlaylist(`#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key"
#EXTINF:1,
a.ts
`);
  assert.equal(encrypted.encrypted, true);
});

test("video urls must already exist and share the post id when other videos are loaded", () => {
  const hints = ["https://pbs.twimg.com/ext_tw_video_thumb/1700000000000000001/pu/img/abc.jpg"];
  const good = "https://video.twimg.com/ext_tw_video/1700000000000000001/pu/vid/1280x720/clip.mp4";
  const other = "https://video.twimg.com/ext_tw_video/1800000000000000002/pu/vid/1920x1080/other.mp4";
  const blob = "blob:https://x.com/uuid";
  assert.ok(resolutionScore(good) > resolutionScore("https://video.twimg.com/ext_tw_video/1700000000000000001/pu/vid/640x360/small.mp4"));
  const matched = collectVideoUrls({
    hints,
    directUrls: [blob],
    observedUrls: [other, good],
    playbackUrls: [other],
    playbackExclusive: false,
  });
  assert.deepEqual(matched, [good]);
  assert.deepEqual(
    collectVideoUrls({ hints: [], directUrls: [blob, "https://evil.example/a.mp4"], playbackUrls: [good], playbackExclusive: true }),
    [good],
  );
});

test("image download skips an HTML body and does not follow a redirect off the image host", async () => {
  const orig = "https://pbs.twimg.com/media/Ab?format=jpg&name=orig";
  const large = "https://pbs.twimg.com/media/Ab?format=jpg&name=large";
  const saved = await resolveImage([orig, large], {
    fetchImpl: mockFetch({
      [orig]: { status: 200, bytes: HTML },
      [large]: { status: 200, bytes: JPEG },
    }),
  });
  assert.equal(saved.ext, "jpg");
  assert.match(saved.notice, /original size was not available/i);
  await assert.rejects(
    () =>
      resolveImage([orig], {
        fetchImpl: mockFetch({
          [orig]: { status: 200, bytes: JPEG, finalUrl: "https://evil.example/login" },
        }),
      }),
    /Nothing was saved/,
  );
});

test("a direct mp4 is saved only when the bytes are a video", async () => {
  const url = "https://video.twimg.com/ext_tw_video/1700000000000000001/pu/vid/1280x720/clip.mp4";
  const saved = await resolveVideo([url], { fetchImpl: mockFetch({ [url]: { status: 200, bytes: MP4 } }) });
  assert.equal(saved.ext, "mp4");
  await assert.rejects(
    () => resolveVideo([url], { fetchImpl: mockFetch({ [url]: { status: 200, bytes: HTML } }) }),
    /Nothing was saved/,
  );
});

test("hls segments are joined and an html segment is not renamed to mp4", async () => {
  const master = "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/master.m3u8";
  const media = "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/1920x1080/index.m3u8";
  const init = "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/1920x1080/init.mp4";
  const seg = "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/1920x1080/seg.m4s";
  const masterText = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="en",URI="audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=640x360
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=8000,RESOLUTION=1920x1080,AUDIO="a"
1920x1080/index.m3u8
`;
  const mediaText = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:2.0,
seg.m4s
`;
  const saved = await resolveVideo([master], {
    fetchImpl: mockFetch({
      [master]: { status: 200, bytes: text(masterText) },
      [media]: { status: 200, bytes: text(mediaText) },
      [init]: { status: 200, bytes: MP4 },
      [seg]: { status: 200, bytes: Uint8Array.from([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x66]) },
    }),
  });
  assert.equal(saved.ext, "mp4");
  assert.ok(saved.bytes.byteLength > MP4.byteLength);
  assert.match(saved.notice, /may be silent/);

  const ts = new Uint8Array(188 * 2);
  ts[0] = 0x47;
  ts[188] = 0x47;
  const tsList = "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/index.m3u8";
  const tsSeg = "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/seg0.ts";
  const tsSaved = await resolveVideo([tsList], {
    fetchImpl: mockFetch({
      [tsList]: { status: 200, bytes: text("#EXTM3U\n#EXTINF:1,\nseg0.ts\n") },
      [tsSeg]: { status: 200, bytes: ts },
    }),
  });
  assert.equal(tsSaved.ext, "ts");
  assert.match(tsSaved.notice, /MPEG-TS/);
  assert.equal(tsSaved.notice.includes(".mp4"), false);

  await assert.rejects(
    () =>
      resolveVideo([tsList], {
        fetchImpl: mockFetch({
          [tsList]: { status: 200, bytes: text("#EXTM3U\n#EXTINF:1,\nbad.ts\n") },
          "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/bad.ts": { status: 200, bytes: HTML },
        }),
      }),
    /Nothing was saved/,
  );
});

test("an encrypted playlist is refused", async () => {
  const url = "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/master.m3u8";
  await assert.rejects(
    () =>
      resolveVideo([url], {
        fetchImpl: mockFetch({
          [url]: { status: 200, bytes: text("#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\n#EXTINF:1,\na.ts\n") },
        }),
      }),
    (error) => error.code === "encrypted" && /does not bypass encryption/.test(error.message),
  );
});

test("concat keeps segment order", () => {
  const out = concatBytes([Uint8Array.from([1, 2]), Uint8Array.from([3])]);
  assert.deepEqual([...out], [1, 2, 3]);
});

function text(value) {
  return new TextEncoder().encode(value);
}

function mockFetch(routes) {
  return async (url) => {
    const route = routes[url];
    if (!route) {
      return {
        ok: false,
        status: 404,
        url,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const bytes = route.bytes instanceof Uint8Array ? route.bytes : new Uint8Array(route.bytes);
    const copy = bytes.slice();
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      url: route.finalUrl || url,
      arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
    };
  };
}
