# Reddl

A local-network frontend for bulk-downloading Reddit videos and GIFs with
[`gallery-dl`](https://github.com/mikf/gallery-dl).

## Run it

Requirements: Node.js 22+ and `gallery-dl` available on your `PATH`.

```bash
npm install
npm run dev
```

On this computer, open `http://127.0.0.1:3000`. From another computer on the
same LAN, open `http://YOUR-LAN-IP:3000`.

The app listens on all network interfaces, launches `gallery-dl` directly
(without a shell), and keeps job state in memory. Downloaded files and the
optional archive are written to the folder you choose in the interface.

Reddit requests use gallery-dl's built-in public OAuth client instead of the
often-blocked public `.json` endpoint. To use your own Reddit installed-app
credentials, set `REDDIT_CLIENT_ID` and optionally `REDDIT_USER_AGENT` before
starting the app.

There is no login screen. Only run the app on a trusted home network, because
any device that can reach port 3000 can start and cancel downloads.
