import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

// Use the real API to create scripts — this matches the convention in raw.test.ts /
// view.test.ts / meta.test.ts and exercises the same code path users will hit.
// Each test uses a unique IP to stay clear of the 5/day anonymous rate limit.
async function createScript(
  content: string,
  ip: string,
  opts: { singleUse?: boolean } = {}
): Promise<{ slug: string }> {
  const res = await SELF.fetch("http://x/api/scripts", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({
      content,
      visibility: "public",
      ...(opts.singleUse ? { expires: "1run" } : {}),
    }),
  });
  if (res.status !== 201) {
    throw new Error(`createScript failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { slug: string };
}

describe("GET /:slug with query params", () => {
  it("serves identical bytes to today when there are no params", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.110");
    const res = await SELF.fetch(`http://x/${slug}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo hi\n");
  });

  it("prepends a shell preamble when params are present", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.111");
    const res = await SELF.fetch(`http://x/${slug}?port=8080&env=staging`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      "# 1ln.sh runtime parameters\n" +
        "export ENV_1LN_ENV='staging'\n" +
        "export ENV_1LN_PORT='8080'\n" +
        "\n" +
        "echo hi\n"
    );
  });

  it("safely quotes shell-metacharacter values without expanding them", async () => {
    const { slug } = await createScript("echo done\n", "192.0.2.112");
    const unsafe = encodeURIComponent("$(rm -rf /); echo 'gotcha'");
    const res = await SELF.fetch(`http://x/${slug}?cmd=${unsafe}`);
    const body = await res.text();
    expect(body).toContain(
      `export ENV_1LN_CMD='$(rm -rf /); echo '\\''gotcha'\\'''`
    );
    expect(body).toContain("\necho done\n");
  });

  it("caches the bare content (no params) and rebuilds the preamble per request", async () => {
    const { slug } = await createScript("echo body\n", "192.0.2.113");
    const r1 = await SELF.fetch(`http://x/${slug}`);
    expect(await r1.text()).toBe("echo body\n");

    const r2 = await SELF.fetch(`http://x/${slug}?port=8080`);
    expect(await r2.text()).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_PORT='8080'\n\necho body\n"
    );

    const r3 = await SELF.fetch(`http://x/${slug}?port=9090`);
    expect(await r3.text()).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_PORT='9090'\n\necho body\n"
    );
  });

  it("works with single-use scripts (preamble + content delivered atomically once)", async () => {
    const { slug } = await createScript("echo once\n", "192.0.2.114", {
      singleUse: true,
    });
    const r1 = await SELF.fetch(`http://x/${slug}?flag=on`);
    expect(r1.status).toBe(200);
    expect(await r1.text()).toBe(
      "# 1ln.sh runtime parameters\nexport ENV_1LN_FLAG='on'\n\necho once\n"
    );
    const r2 = await SELF.fetch(`http://x/${slug}?flag=on`);
    expect(r2.status).toBe(410);
  });

  it("invalid params are silently dropped (no preamble emitted)", async () => {
    const { slug } = await createScript("echo hi\n", "192.0.2.115");
    const res = await SELF.fetch(`http://x/${slug}?1port=8080&_format=raw`);
    expect(await res.text()).toBe("echo hi\n");
  });
});
