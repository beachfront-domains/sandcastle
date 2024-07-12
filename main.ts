


/// import

import { ensureDir, ensureFile, exists } from "https://deno.land/std/fs/mod.ts";
import { Hono, validator } from "https://deno.land/x/hono@v4.2.4/mod.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";

import {
  bearerAuth,
  prettyJSON,
  secureHeaders,
  trimTrailingSlash
} from "https://deno.land/x/hono/middleware.ts";

/// npm

import { default as dedent } from "npm:dedent@1.5.1";
import * as tr46 from "npm:idna-uts46-hx@5.0.7";

/// util

const app = new Hono({ strict: true });
const env = await load();
const inProduction = Deno.args.includes("production");
const regexDomain = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
const regexUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token = env["TOKEN"];

const sandcastlesDirectory = inProduction ?
  "/var/www/sandcastles" :
  "dist/sandcastles";

const toASCII = (str: string) => tr46.toAscii(
  String(str).trim(), {
    transitional: true,
    useStd3ASCII: false,
    verifyDnsLength: false
  }
);

interface ConfigFile {
  encode?: string;
  fileServer?: {
    browse: string;
  };
  tls?: {
    cert: string;
    key: string;
  };
}

interface LooseObject {
  [key: string]: any;
}



/// program

await ensureDir(sandcastlesDirectory);

app.use(secureHeaders());
app.use(trimTrailingSlash());
app.use(prettyJSON());

app.get("/", context => context.redirect("/api"));
app.get("/api", context => context.json({ message: "Do you wanna build a sandcastle?" }, 200));

app.post("/api",
  bearerAuth({ token }),
  validator("json", (value, context) => {
    const { customer, data, domain, files } = value;

    if (!customer || !data || !domain)
      return context.json({ message: "Missing data!" }, 400);

    if (!regexUUID.test(customer))
      return context.json({ message: "Invalid customer ID!" }, 400);

    if (typeof data !== "string")
      return context.json({ message: "Weird data!" }, 400);

    if (!regexDomain.test(domain))
      return context.json({ message: "Invalid domain!" }, 400);

    // TODO
    // : ensure there's no JS in `data` (have built-in analytics? be sure to block spambots)
    // : validate `domain` has a TLD we carry
    // : if `files` exist, validate it's a Set/array of files and process them
    // : store sandcastles on external mount

    return { customer, data, domain: toASCII(domain), files };
  }),
  async(context) => {
    const { customer, data, domain, files } = await context.req.json();

    ///
    /// CREATE INDEX.HTML
    ///

    const indexHTML = `${sandcastlesDirectory}/${customer}/${domain}/index.html`;

    await ensureFile(indexHTML);
    await Deno.writeTextFile(indexHTML, data);

    console.info(`WRITE | ${indexHTML}`);

    ///
    /// UPDATE CADDY CONFIG
    ///

    const configFile = inProduction ?
      `/etc/caddy/sld/${domain}` :
      `dist/${domain}/${domain}`;

    const doesConfigExist = await exists(configFile, { isFile: true });

    if (!doesConfigExist)
      return context.json({ message: "Caddy config doesn't exist!" }, 400);

    const configFileContents = await Deno.readTextFile(configFile);
    const parsedConfig = parseFileConfig(configFileContents);

    const configContent = dedent`
      ${domain} {
        import common
        root * ${sandcastlesDirectory}/${customer}/${domain}
        tls ${parsedConfig[domain].tls.cert} ${parsedConfig[domain].tls.key}
      }
    `;

    await Deno.writeTextFile(configFile, configContent);
    console.info(`WRITE | ${configFile}`);

    ///
    /// RELOAD CADDY
    ///

    if (inProduction) {
      const command = new Deno.Command("service", { args: ["caddy", "reload"] });
      const { code, stderr, stdout } = await command.output();

      code === 0 ?
        console.log(`RELOAD SUCCESS | ${new TextDecoder().decode(stdout)}`) :
        console.log(`RELOAD FAILURE | ${new TextDecoder().decode(stderr)}`);
    }

    ///
    /// FINISH
    ///

    console.info(`DONE  | ${domain}\n`);

    return context.json({
      message: `Updated site for ${domain}!`,
      success: true
    }, 201);
  }
);

Deno.serve({ port: 3700 }, app.fetch);



/// helper

function parseFileConfig(input: string): Record<string, ConfigFile> {
  const result: Record<string, ConfigFile> = {};
  const lines = input.split("\n");
  const stack: Array<{ key: string; config: LooseObject }> = [];

  for (let line of lines) {
    line = line.trim();

    if (!line)
      continue;

    if (line.endsWith("{")) {
      const key = line.slice(0, -1).trim();
      const newConfig: LooseObject = {};

      if (stack.length === 0) {
        result[key] = newConfig;
      } else {
        const parent = stack[stack.length - 1].config;
        parent[key] = newConfig;
      }

      stack.push({ key, config: newConfig });
    } else if (line === "}") {
      stack.pop();
    } else {
      const [key, ...valueParts] = line.split(" ");
      const value = valueParts.join(" ");
      const current = stack[stack.length - 1].config;

      if (key === "tls") {
        const [cert, keyFile] = value.split(" ");
        current[key] = { cert, key: keyFile };
      } else {
        current[key] = value;
      }
    }
  }

  return result;

  /// via Claude 3.5 Sonnet
}
