# Channel 配置调研

## RPC 方法
- `channels.status` — 获取所有 channel 的运行状态（scope: operator.read）
- `channels.logout <channel>` — 登出指定 channel（scope: operator.write）
- `config.get` / `config.apply` — 读写 channel 配置（跟 provider 一样）

## Channel 配置在 openclaw.json 中的结构

所有 channel 配置在 `channels` 对象下：

```json5
{
  channels: {
    telegram: { enabled: true, botToken: "123:abc", dmPolicy: "pairing", groups: {} },
    discord: { enabled: true, botToken: "xxx", guildId: "xxx" },
    whatsapp: { enabled: true },  // QR 配对，无需 token
    signal: { enabled: true, account: "+15551234567", cliPath: "signal-cli", dmPolicy: "pairing" },
    slack: { enabled: true, appToken: "xapp-...", botToken: "xoxb-..." },
    feishu: { enabled: true },  // 插件
    line: { enabled: true, channelAccessToken: "...", channelSecret: "..." },
    irc: { enabled: true, server: "irc.example.com", nick: "openclaw" },
    googlechat: { enabled: true },
    msteams: { enabled: true },  // 插件
    matrix: { enabled: true },  // 插件
    mattermost: { enabled: true },  // 插件
    twitch: { enabled: true },  // 插件
    nostr: { enabled: true },  // 插件
    bluebubbles: { enabled: true, serverUrl: "http://...", password: "..." },
    synologychat: { enabled: true },  // 插件
    tlon: { enabled: true },  // 插件
    zalo: { enabled: true },  // 插件
  }
}
```

## 每个 Channel 的配置字段

| Channel | 关键字段 | 认证方式 | 插件 |
|---------|----------|----------|------|
| Telegram | botToken, dmPolicy, groups | Bot Token | 内置 |
| Discord | botToken, guildId | Bot Token | 内置 |
| WhatsApp | (无 token) | QR 配对 | 内置 |
| Signal | account, cliPath, allowFrom | signal-cli | 内置 |
| Slack | appToken, botToken | App+Bot Token | 内置 |
| Feishu | appId, appSecret | App 凭证 | 插件 |
| LINE | channelAccessToken, channelSecret | Channel 凭证 | 插件 |
| IRC | server, port, nick, password | 服务器连接 | 内置 |
| Google Chat | webhookUrl | Webhook | 插件 |
| MS Teams | appId, appPassword | Bot Framework | 插件 |
| Matrix | homeserver, accessToken | Access Token | 插件 |
| Mattermost | url, botToken | Bot Token | 插件 |
| BlueBubbles | serverUrl, password | Server 密码 | 内置 |
| iMessage | (legacy) | macOS 原生 | 内置 |
| Twitch | username, oauthToken, channels | OAuth | 插件 |
| Nostr | privateKey | 密钥对 | 插件 |
| Zalo | appId, secretKey | App 凭证 | 插件 |

## 实现方案
壁纸 Settings Modal 新增 "📡 Channels" tab，通过 config.get 读 + config.apply 写。
