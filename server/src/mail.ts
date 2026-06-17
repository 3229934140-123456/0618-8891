import nodemailer from 'nodemailer';

let transporter: any = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return transporter;
  }
  return null;
}

export async function sendMail(to: string, subject: string, html: string, text?: string) {
  const t = getTransporter();
  if (t) {
    try {
      await t.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@api-doc.local',
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]+>/g, ''),
      });
      console.log(`[邮件发送成功] To: ${to}, Subject: ${subject}`);
      return true;
    } catch (e: any) {
      console.error(`[邮件发送失败] To: ${to}, Error: ${e.message}`);
      return false;
    }
  } else {
    console.log(`[邮件模拟] To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body (first 300 chars): ${(text || html.replace(/<[^>]+>/g, '')).slice(0, 300)}`);
    return true;
  }
}

export function buildNotificationEmail(doc: any, version: string, changes: string[] | string): { subject: string; html: string; text: string } {
  const changesHtml = Array.isArray(changes)
    ? changes.map((c) => `  <li>${c}</li>`).join('\n')
    : `  <li>${changes}</li>`;
  const changesText = Array.isArray(changes) ? changes.join('\n  - ') : String(changes);
  const subject = `【文档更新】${doc.title} v${version}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1677ff;">📄 ${doc.title} 已更新</h2>
      <p>文档 <b>${doc.title}</b> 已发布新版本 <b>v${version}</b>，变更内容如下：</p>
      <ul style="background: #f6f8fa; padding: 16px 16px 16px 32px; border-radius: 6px;">
${changesHtml}
      </ul>
      <p style="color: #666;">
        如需查看完整版本，请点击 <a href="${process.env.PUBLIC_URL || 'http://localhost:5173'}/doc/${doc.id}">此处</a> 访问。
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #999; font-size: 12px;">此邮件由 API 文档平台自动发送，请勿直接回复。</p>
    </div>
  `.trim();
  const text = `【文档更新】${doc.title} v${version}\n\n变更内容:\n  - ${changesText}\n\n查看详情: ${process.env.PUBLIC_URL || 'http://localhost:5173'}/doc/${doc.id}`;
  return { subject, html, text };
}

export function buildChangelogEmail(doc: any, version: string, changes: string[] | string): { subject: string; html: string; text: string } {
  return buildNotificationEmail(doc, version, changes);
}

export { getTransporter };
