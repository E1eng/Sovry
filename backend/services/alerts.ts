export enum AlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export async function sendDiscordAlert(title: string, message: string, level: AlertLevel = AlertLevel.INFO) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const payload = {
    username: 'Sovry Keeper Bot',
    embeds: [
      {
        title: `${level}: ${title}`,
        description: message,
        color: level === AlertLevel.ERROR ? 0xff0000 : level === AlertLevel.WARNING ? 0xffa500 : 0x3b82f6,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[ALERT] Failed to send Discord alert:', err);
  }
}
