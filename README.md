# sandcastle

beachfront/ API for enabling website creation

- creates/overwrites `index.html` in `/etc/caddy/sandcastles/<customer-uuid>/<domain>`
- updates Caddy config of said domain
- reloads Caddy

## Prerequisites

- Caddy: https://caddyserver.com
- unzip: `brew install unzip` or `apt install unzip -y`
- Deno: `curl -fsSL https://deno.land/install.sh | sh`
  - `export DENO_INSTALL="/root/.deno"`
  - `export PATH="$DENO_INSTALL/bin:$PATH"`
- `.env` file with a strong `TOKEN`

## Notes

- sandcastle **expects** to find a Caddy config and will fail gracefully if it isn't found
- this should be run with golfer on the same server

## Production

```sh
deno task start
```

Websites will live in `/var/www/sandcastles`. Contents will look like:

```
00000000-0000-0000-0000-000000000000
└─ domain.tld
   └─ index.html
00000000-0000-0000-0000-000000000001
└─ domain1.tld
   └─ index.html
00000000-0000-0000-0000-000000000002
├─ domain2.tld
│  └─ index.html
└─ domain3.tld
   └─ index.html
```

…where each immediate child is a customer's UUID.

## Development

```sh
deno task dev
```

```sh
# using curl
curl -d '{ "customer": "00000000-0000-0000-0000-000000000000", "data": "markdown compiled to HTML", "domain": "www.lynk" }' -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -X POST http://localhost:3700/api | jq
```
