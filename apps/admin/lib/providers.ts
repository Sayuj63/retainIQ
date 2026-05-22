import type { ChannelProvider, ChannelProviders } from "@retainiq/db";

/**
 * Phase-1 stub providers. They log a structured JSON line per dispatch and
 * return a deterministic provider message id so the dashboard surfaces the
 * full pipeline end-to-end. Swap one file when real credentials land.
 */
function makeStub(channel: "whatsapp" | "sms" | "email"): ChannelProvider {
  return async ({ to, body, template, shopDomain }) => {
    const providerMessageId = `${channel}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    process.stdout.write(
      `${JSON.stringify({
        channel,
        provider: "stub",
        template,
        to,
        shopDomain,
        providerMessageId,
        body,
        at: new Date().toISOString(),
      })}\n`,
    );
    return { providerMessageId };
  };
}

export function getStubProviders(): ChannelProviders {
  return {
    whatsapp: makeStub("whatsapp"),
    sms: makeStub("sms"),
    email: makeStub("email"),
  };
}
