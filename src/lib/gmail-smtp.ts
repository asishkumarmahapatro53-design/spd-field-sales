import tls from "node:tls";

interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface SendGmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function getGmailSmtpConfig() {
  const user = readEnv("GMAIL_SMTP_USER", "GMAIL_USER") || "asishkumar3190@gmail.com";
  const password = readEnv("GMAIL_APP_PASSWORD", "GMAIL_SMTP_PASSWORD", "GMAIL_PASSWORD");
  const host = readEnv("GMAIL_SMTP_HOST") || "smtp.gmail.com";
  const port = Number(readEnv("GMAIL_SMTP_PORT") || 465);

  if (!password) {
    throw new Error("Gmail app password is not configured. Set GMAIL_APP_PASSWORD for asishkumar3190@gmail.com.");
  }

  return {
    user,
    password,
    host,
    port: Number.isFinite(port) ? port : 465,
  };
}

function encodeBase64Lines(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function cleanAddress(value: string) {
  return value.trim().toLowerCase();
}

function buildMessage(input: SendGmailInput, from: string) {
  const boundary = `spd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const attachments = input.attachments ?? [];
  const recipients = input.to.map(cleanAddress).filter(Boolean);
  const cc = (input.cc ?? []).map(cleanAddress).filter(Boolean);
  const headers = [
    `From: SPD Concrete <${from}>`,
    `To: ${recipients.join(", ")}`,
    cc.length ? `Cc: ${cc.join(", ")}` : "",
    `Subject: ${cleanHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean);

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.text,
    "",
  ];

  attachments.forEach((attachment) => {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${cleanHeader(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${cleanHeader(attachment.filename)}"`,
      "",
      encodeBase64Lines(attachment.content),
      "",
    );
  });

  parts.push(`--${boundary}--`, "");

  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

function dotStuff(message: string) {
  return message.replace(/\r?\n\./g, "\r\n..");
}

class SmtpSession {
  private socket: tls.TLSSocket;
  private buffer = "";

  constructor(socket: tls.TLSSocket) {
    this.socket = socket;
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => {
      this.buffer += chunk;
    });
  }

  static connect(host: string, port: number) {
    return new Promise<SmtpSession>((resolve, reject) => {
      const socket = tls.connect({ host, port, servername: host }, () => resolve(new SmtpSession(socket)));
      socket.once("error", reject);
      socket.setTimeout(20000, () => {
        socket.destroy(new Error("Gmail SMTP connection timed out."));
      });
    });
  }

  async command(value: string, expected: number[]) {
    this.socket.write(`${value}\r\n`);
    return this.read(expected);
  }

  read(expected: number[]) {
    return new Promise<string>((resolve, reject) => {
      const startedAt = Date.now();
      const poll = () => {
        const lines = this.buffer.split(/\r?\n/).filter(Boolean);
        const lastLine = [...lines].reverse().find((line) => /^\d{3} /.test(line));

        if (lastLine) {
          const code = Number(lastLine.slice(0, 3));
          const response = this.buffer;
          this.buffer = "";
          if (expected.includes(code)) {
            resolve(response);
            return;
          }
          reject(new Error(`Gmail SMTP rejected command: ${response.trim()}`));
          return;
        }

        if (Date.now() - startedAt > 20000) {
          reject(new Error("Gmail SMTP response timed out."));
          return;
        }

        setTimeout(poll, 20);
      };

      poll();
    });
  }

  end() {
    this.socket.end();
  }
}

export async function sendGmail(input: SendGmailInput) {
  const recipients = input.to.map(cleanAddress).filter(Boolean);
  const cc = (input.cc ?? []).map(cleanAddress).filter(Boolean);

  if (!recipients.length) {
    throw new Error("At least one email recipient is required.");
  }

  const config = getGmailSmtpConfig();
  const session = await SmtpSession.connect(config.host, config.port);
  const message = buildMessage(input, config.user);

  try {
    await session.read([220]);
    await session.command("EHLO spdconcrete.local", [250]);
    await session.command("AUTH LOGIN", [334]);
    await session.command(Buffer.from(config.user).toString("base64"), [334]);
    await session.command(Buffer.from(config.password).toString("base64"), [235]);
    await session.command(`MAIL FROM:<${config.user}>`, [250]);
    for (const recipient of [...recipients, ...cc]) {
      await session.command(`RCPT TO:<${recipient}>`, [250, 251]);
    }
    await session.command("DATA", [354]);
    await session.command(`${dotStuff(message)}\r\n.`, [250]);
    await session.command("QUIT", [221]);
  } finally {
    session.end();
  }
}
