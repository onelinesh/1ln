import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("end-to-end", () => {
  it("paste → curl → delete → 404", async () => {
    // 1. Paste via form.
    const form = new URLSearchParams({ content: "#!/bin/sh\necho e2e", visibility: "public" });
    const createRes = await SELF.fetch("http://x/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "cf-connecting-ip": "203.0.113.10",
      },
      body: form,
    });
    expect(createRes.status).toBe(200);
    const html = await createRes.text();
    const slugMatch = html.match(/curl 1ln\.sh\/([0-9A-Za-z]+)/);
    const tokenMatch = html.match(/id="delete-token"[^>]*>([0-9A-Za-z]{32})<\/pre>/);
    expect(slugMatch).not.toBeNull();
    expect(tokenMatch).not.toBeNull();
    const slug = slugMatch![1]!;
    const token = tokenMatch![1]!;

    // 2. Curl-style raw fetch.
    const rawRes = await SELF.fetch(`http://x/${slug}`);
    expect(rawRes.status).toBe(200);
    expect(await rawRes.text()).toBe("#!/bin/sh\necho e2e");

    // 3. Meta endpoint.
    const metaRes = await SELF.fetch(`http://x/${slug}?meta`);
    expect(metaRes.status).toBe(200);
    const meta: any = await metaRes.json();
    expect(meta.visibility).toBe("public");

    // 4. View page.
    const viewRes = await SELF.fetch(`http://x/${slug}?view`);
    expect(viewRes.status).toBe(200);
    expect((await viewRes.text())).toContain("e2e");

    // 5. Delete.
    const delRes = await SELF.fetch(`http://x/api/scripts/${slug}`, {
      method: "DELETE",
      headers: { "x-delete-token": token },
    });
    expect(delRes.status).toBe(204);

    // 6. 404 after delete.
    const goneRes = await SELF.fetch(`http://x/${slug}`);
    expect(goneRes.status).toBe(404);
  });
});
