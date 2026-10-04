import { describe, expect, it, vi } from "vitest";
import { SMTP2GO_SEND_URL, sendThroughSmtp2go } from "./smtp2go.js";

const mail = {
  sender: "LAYERED.work <hello@layered.work>",
  to: "owner@layered.test",
  subject: "Test",
  text: "Hi",
};

function answer(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("sending through SMTP2GO", () => {
  it("sends to the fixed address with the key in a header and refuses redirects", async () => {
    const send = answer({ data: { succeeded: 1, failed: 0, failures: [], email_id: "1u0SwL" } });
    await sendThroughSmtp2go("secret-key", mail, send);

    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SMTP2GO_SEND_URL);
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>)["X-Smtp2go-Api-Key"]).toBe("secret-key");
    expect(JSON.parse(String(init.body))).toEqual({
      sender: mail.sender,
      to: [mail.to],
      subject: "Test",
      text_body: "Hi",
    });
  });

  it("reports an accepted message with the id SMTP2GO gave it", async () => {
    const outcome = await sendThroughSmtp2go(
      "key",
      mail,
      answer({ data: { succeeded: 1, failed: 0, email_id: "1u0SwL-B9zBpi9ffUq-JAB2" } }),
    );
    expect(outcome).toEqual({ accepted: true, answer: "Accepted as 1u0SwL-B9zBpi9ffUq-JAB2." });
  });

  it("sends both HTML and text when a template provides them", async () => {
    const send = answer({ data: { succeeded: 1, failed: 0 } });
    await sendThroughSmtp2go("key", { ...mail, html: "<p>Hi</p>" }, send);
    expect(JSON.parse(String(send.mock.calls[0]?.[1]?.body))).toMatchObject({
      text_body: "Hi",
      html_body: "<p>Hi</p>",
    });
  });

  it("reports a refusal in SMTP2GO's own words, also when it answered 200", async () => {
    const refused = await sendThroughSmtp2go(
      "key",
      mail,
      answer(
        {
          data: {
            error_code: "E_ApiResponseCodes.ENDPOINT_PERMISSION_DENIED",
            error: "You do not have permission",
          },
        },
        400,
      ),
    );
    expect(refused).toEqual({ accepted: false, answer: "You do not have permission" });

    const failed = await sendThroughSmtp2go(
      "key",
      mail,
      answer({ data: { succeeded: 0, failed: 1, failures: ["sender not verified"] } }),
    );
    expect(failed).toEqual({ accepted: false, answer: "sender not verified" });
  });

  it("says so when SMTP2GO cannot be reached or answers with nothing readable", async () => {
    const unreachable = await sendThroughSmtp2go(
      "key",
      mail,
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    expect(unreachable).toEqual({ accepted: false, answer: "SMTP2GO could not be reached." });

    const unreadable = await sendThroughSmtp2go(
      "key",
      mail,
      vi.fn().mockResolvedValue(new Response("Unauthorised", { status: 401 })),
    );
    expect(unreadable).toEqual({ accepted: false, answer: "SMTP2GO answered with status 401." });
  });
});
