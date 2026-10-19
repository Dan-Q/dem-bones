# Dem Bones

## Play it

Play at https://skelly.monster/

Accompanying blog post available at https://danq.me/2026/10/22/dem-bones/

## How it works

Visiting the web page opens a websocket connection to the server for real-time updates. It generates a random "key" and encodes it into
the QR code as a longer version of the same URL. Visiting that URL (on your mobile device) allows orientation/spatial data from the
mobile device to be streamed, via the websocket server, back to the desktop computer, where it's mapped onto puppet-like movements of
the skeleton.

## Host it

Install dependencies with `npm install`.

Start development server with `npm start`. It defaults to running on http://localhost:7080/

Note that accessing the orientation API on your mobile device will normally require a HTTPS endpoint. Here's a simple Caddyfile:

```Caddyfile
skelly.monster {
  reverse_proxy localhost:7080
}
```

In production, I'm using a slightly extended configuration to allow Caddy to directly serve the static files:

```Caddyfile
skelly.monster {
  root * /path/to/repo/public
  encode zstd gzip

  # Serve a file directly if it exists in public/
  @static file
  handle @static {
    file_server
  }

  # Everything else goes to app server: /ws, /qr...
  handle {
    reverse_proxy localhost:7080
  }
}
```

## Extend it

I'd love to see somebody with better graphical skills than me made some other monster puppets. Just rip out the relevant SVGs
from the code, edit, and re-inject. I'm thinking all the horror classics: vampire, witch, mummy, zombie...
