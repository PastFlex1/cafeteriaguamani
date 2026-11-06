/**
 * Native Node.js SMTP Client (Zero external dependencies)
 * Supports SSL/TLS (port 465) and STARTTLS (port 587 / 25), AUTH LOGIN,
 * UTF-8 HTML bodies, and Base64 MIME attachments (PDF RIDE, XML Autorizado, Nota de Venta).
 */

const net = require('net');
const tls = require('tls');

function chunkBase64(b64) {
  const clean = (b64 || '').replace(/[\r\n\s]/g, '');
  return clean.replace(/(.{76})/g, '$1\r\n');
}

function encodeHeaderUtf8(text) {
  if (!text) return '';
  return `=?UTF-8?B?${Buffer.from(String(text), 'utf8').toString('base64')}?=`;
}

/**
 * Builds a raw RFC 2822 / MIME multipart/mixed message
 */
function buildMimeMessage({ fromName, fromEmail, toEmail, subject, html, attachments = [] }) {
  const boundary = `----=_Part_SRI_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const dateHeader = new Date().toUTCString();
  const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@${(fromEmail.split('@')[1] || 'cafeteria.local')}>`;

  const headers = [
    `Date: ${dateHeader}`,
    `Message-ID: ${messageId}`,
    `From: ${fromName ? `${encodeHeaderUtf8(fromName)} <${fromEmail}>` : `<${fromEmail}>`}`,
    `To: <${toEmail}>`,
    `Subject: ${encodeHeaderUtf8(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const htmlBase64 = chunkBase64(Buffer.from(html || '', 'utf8').toString('base64'));

  const parts = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    htmlBase64,
  ];

  for (const att of attachments) {
    if (!att || !att.filename || !att.contentBase64) continue;
    const contentType = att.contentType || 'application/octet-stream';
    const safeFilename = encodeHeaderUtf8(att.filename);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${safeFilename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeFilename}"`,
      '',
      chunkBase64(att.contentBase64)
    );
  }

  parts.push(`--${boundary}--`, '');

  // Escape any line starting with a dot (RFC 5321 transparency)
  const fullBody = [...headers, '', ...parts]
    .join('\r\n')
    .replace(/\r\n\./g, '\r\n..');

  return fullBody;
}

/**
 * Sends an email via SMTP using native net/tls sockets
 */
function sendSmtpEmail(options) {
  return new Promise((resolve, reject) => {
    const {
      host,
      port = 465,
      secure = Number(port) === 465,
      user,
      pass,
      fromName,
      fromEmail,
      to,
      subject,
      html,
      attachments = [],
    } = options || {};

    if (!host || !user || !pass) {
      return resolve({
        success: false,
        error: 'Faltan credenciales SMTP (Servidor, Usuario o Contraseña). Configúrelas en la pestaña CONFIG. SRI.',
      });
    }

    if (!to || !String(to).includes('@')) {
      return resolve({
        success: false,
        error: 'La dirección de correo del destinatario no es válida.',
      });
    }

    const cleanHost = String(host).trim();
    const cleanPort = Number(port) || 465;
    const cleanUser = String(user).trim();
    const cleanPass = String(pass).replace(/\s+/g, ''); // Gmail App Passwords often have spaces when copied
    const rawPass = String(pass).trim();
    const senderEmail = (fromEmail && fromEmail.includes('@')) ? fromEmail.trim() : cleanUser;
    const recipientEmail = String(to).trim();

    let socket = null;
    let buffer = '';
    let currentWaiter = null;
    let finished = false;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(globalTimer);
      try {
        if (socket && !socket.destroyed) {
          socket.end();
          socket.destroy();
        }
      } catch (e) {}
      resolve(result);
    };

    const globalTimer = setTimeout(() => {
      finish({
        success: false,
        error: `Tiempo de espera agotado (25s) conectando al servidor SMTP ${cleanHost}:${cleanPort}. Verifique el puerto y su conexión.`,
      });
    }, 25000);

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        // Multi-line SMTP response has '-' at index 3 (e.g. "250-PIPELINING"), final line has ' ' (e.g. "250 OK")
        if (line.length >= 4 && line[3] === '-') {
          continue;
        }
        const code = parseInt(line.substring(0, 3), 10);
        if (currentWaiter) {
          const w = currentWaiter;
          currentWaiter = null;
          w({ code, line });
        }
      }
    };

    const waitResponse = () =>
      new Promise((res) => {
        currentWaiter = res;
      });

    const sendCommand = (cmd) => {
      const p = waitResponse();
      socket.write(cmd + '\r\n');
      return p;
    };

    const attachListeners = (sock) => {
      sock.on('data', onData);
      sock.on('error', (err) => {
        finish({
          success: false,
          error: `Error de conexión SMTP (${cleanHost}:${cleanPort}): ${err.message}`,
        });
      });
      sock.on('close', () => {
        if (!finished) {
          finish({
            success: false,
            error: 'El servidor SMTP cerró la conexión inesperadamente.',
          });
        }
      });
    };

    const runConversation = async () => {
      try {
        // 1. Wait initial 220 banner
        const banner = await waitResponse();
        if (banner.code !== 220) {
          return finish({ success: false, error: `Error de saludo SMTP: ${banner.line}` });
        }

        // 2. EHLO
        let ehlo = await sendCommand(`EHLO cafeteria.local`);
        if (ehlo.code !== 250) {
          return finish({ success: false, error: `Error en EHLO: ${ehlo.line}` });
        }

        // 3. Upgrade STARTTLS if not already secure
        if (!secure && cleanPort !== 465) {
          const startTlsRes = await sendCommand('STARTTLS');
          if (startTlsRes.code !== 220) {
            return finish({
              success: false,
              error: `El servidor no aceptó STARTTLS en puerto ${cleanPort}: ${startTlsRes.line}`,
            });
          }

          socket.removeAllListeners('data');
          socket.removeAllListeners('error');
          socket.removeAllListeners('close');

          socket = await new Promise((resTls, rejTls) => {
            const tlsSock = tls.connect(
              {
                socket,
                servername: cleanHost,
                rejectUnauthorized: false,
              },
              () => resTls(tlsSock)
            );
            tlsSock.once('error', rejTls);
          });

          attachListeners(socket);

          ehlo = await sendCommand(`EHLO cafeteria.local`);
          if (ehlo.code !== 250) {
            return finish({ success: false, error: `Error en EHLO tras STARTTLS: ${ehlo.line}` });
          }
        }

        // 4. AUTH LOGIN
        const authStart = await sendCommand('AUTH LOGIN');
        if (authStart.code !== 334) {
          return finish({
            success: false,
            error: `El servidor no aceptó AUTH LOGIN: ${authStart.line}`,
          });
        }

        const userStep = await sendCommand(Buffer.from(cleanUser, 'utf8').toString('base64'));
        if (userStep.code !== 334) {
          return finish({
            success: false,
            error: `Usuario SMTP rechazado: ${userStep.line}`,
          });
        }

        // Try with space-stripped password first (helpful for 16-char Google App Passwords)
        const passToUse = cleanHost.includes('gmail') ? cleanPass : rawPass;
        const passStep = await sendCommand(Buffer.from(passToUse, 'utf8').toString('base64'));
        if (passStep.code !== 235) {
          return finish({
            success: false,
            error: `Autenticación SMTP fallida (${passStep.code}): Verifique su correo y Contraseña de Aplicación. Detalle: ${passStep.line}`,
          });
        }

        // 5. MAIL FROM
        const mailFrom = await sendCommand(`MAIL FROM:<${senderEmail}>`);
        if (mailFrom.code !== 250) {
          return finish({
            success: false,
            error: `Error en MAIL FROM (${senderEmail}): ${mailFrom.line}`,
          });
        }

        // 6. RCPT TO
        const rcptTo = await sendCommand(`RCPT TO:<${recipientEmail}>`);
        if (rcptTo.code !== 250 && rcptTo.code !== 251) {
          return finish({
            success: false,
            error: `Destinatario rechazado (${recipientEmail}): ${rcptTo.line}`,
          });
        }

        // 7. DATA
        const dataCmd = await sendCommand('DATA');
        if (dataCmd.code !== 354) {
          return finish({
            success: false,
            error: `Error al iniciar envío de datos (DATA): ${dataCmd.line}`,
          });
        }

        // 8. MIME Content + final dot
        const mimeMessage = buildMimeMessage({
          fromName: fromName || 'Facturación Electrónica',
          fromEmail: senderEmail,
          toEmail: recipientEmail,
          subject: subject || 'Comprobante Electrónico',
          html: html || '<p>Adjunto encontrará su comprobante electrónico.</p>',
          attachments,
        });

        const sendDataRes = await sendCommand(`${mimeMessage}\r\n.`);
        if (sendDataRes.code !== 250) {
          return finish({
            success: false,
            error: `El servidor rechazó el contenido del correo: ${sendDataRes.line}`,
          });
        }

        // 9. QUIT
        try {
          await sendCommand('QUIT');
        } catch (e) {}

        return finish({
          success: true,
          message: `Correo enviado exitosamente a ${recipientEmail}`,
        });
      } catch (err) {
        return finish({
          success: false,
          error: err.message || 'Error inesperado durante el envío SMTP.',
        });
      }
    };

    try {
      if (secure || cleanPort === 465) {
        socket = tls.connect({
          host: cleanHost,
          port: cleanPort,
          servername: cleanHost,
          rejectUnauthorized: false,
        });
      } else {
        socket = net.connect({
          host: cleanHost,
          port: cleanPort,
        });
      }
      attachListeners(socket);
      runConversation();
    } catch (err) {
      finish({
        success: false,
        error: `No se pudo iniciar conexión con ${cleanHost}:${cleanPort}: ${err.message}`,
      });
    }
  });
}

module.exports = { sendSmtpEmail };

