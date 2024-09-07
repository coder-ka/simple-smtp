import nodemailer from "nodemailer";
import { SMTPServer } from "smtp-server";
import fs from "fs/promises";
import { PassThrough } from "stream";
import { simpleParser } from "mailparser";

export async function main() {
  async function createSMTPServer({
    useTls,
    startTls,
  }: {
    useTls: boolean;
    startTls: boolean;
  }) {
    const enableTls = useTls || startTls;
    return new SMTPServer({
      secure: useTls,
      disabledCommands: startTls ? [] : ["STARTTLS"],
      key: enableTls
        ? await fs.readFile(process.env.SMTP_TLS_KEY_PATH as string)
        : undefined,
      cert: enableTls
        ? await fs.readFile(process.env.SMTP_TLS_CERT_PATH as string)
        : undefined,
      onAuth(auth, _session, callback) {
        if (
          auth.username === process.env.SMTP_USER &&
          auth.password === process.env.SMTP_PASS
        ) {
          return callback(null, { user: process.env.SMTP_USER });
        }

        return callback(new Error("Invalid username or password"));
      },
      onData: async (stream, session, callback) => {
        const mailFrom = session.envelope.mailFrom;
        const mailTo = session.envelope.rcptTo;

        try {
          await Promise.all(
            mailTo.map(async (rcpt) => {
              if (mailFrom) {
                const targetHost = rcpt.address.split("@")[1];
                const branch = new PassThrough();
                stream.pipe(branch);
                branch.pipe(process.stdout);

                const transport = nodemailer.createTransport({
                  host: process.env.SMTP_DUMMY_TARGET_HOST || targetHost,
                  port: process.env.SMTP_DUMMY_TARGET_PORT
                    ? Number(process.env.SMTP_DUMMY_TARGET_PORT)
                    : 587,
                });

                const mail = await simpleParser(branch);

                const info = await transport
                  .sendMail({
                    from: mailFrom.address,
                    to: mailTo.map((rcpt) => rcpt.address),
                    envelope: {
                      from: mailFrom.address,
                      to: mailTo.map((rcpt) => rcpt.address),
                    },
                    subject: mail.subject,
                    text: mail.text,
                    html: mail.html ? mail.html : undefined,
                    attachments: mail.attachments.map((att) => ({
                      filename: att.filename,
                      content: att.content,
                    })),
                  })
                  .catch((err) => {
                    console.error(err);
                    throw err;
                  });

                console.log(info);
              }
            })
          );

          callback(null);
        } catch (error) {
          callback(error as Error);
        }
      },
    });
  }

  const enableTls = process.env.SMTP_TLS === "true";

  return Promise.all([
    createSMTPServer({
      useTls: false,
      startTls: false,
    }),
    ...(enableTls
      ? [
          createSMTPServer({
            useTls: false,
            startTls: true,
          }),
          createSMTPServer({
            useTls: true,
            startTls: false,
          }),
        ]
      : []),
  ]).then(([server1, server2, server3]) => {
    server1.listen(25);
    if (server2) server2.listen(587);
    if (server3) server3.listen(465);
  });
}

main();
