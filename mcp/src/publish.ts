export type PublishInput = {
  content: string;
  visibility?: "public" | "private";
  expires?: "1h" | "24h" | "1run" | "never";
};

export type PublishResult = {
  one_liner: string;
  url: string;
  slug: string;
  delete_token: string;
};

export type Deps = {
  fetch: typeof fetch;
  baseUrl: string;
};

export async function publishScript(deps: Deps, input: PublishInput): Promise<PublishResult> {
  const body = {
    content: input.content,
    visibility: input.visibility ?? "private",
    expires: input.expires ?? "24h",
  };
  const res = await deps.fetch(`${deps.baseUrl}/api/scripts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    const text = await res.text();
    throw new Error(`1ln.sh returned ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    slug: string; url: string; oneliner: string; delete_token: string;
  };
  return {
    one_liner: json.oneliner,
    url: json.url,
    slug: json.slug,
    delete_token: json.delete_token,
  };
}
